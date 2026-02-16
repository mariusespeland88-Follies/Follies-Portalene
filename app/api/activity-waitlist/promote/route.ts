import { NextResponse } from "next/server";

import { requireLeader } from "@/lib/authz/apiAuth";
import { getSupabaseServiceRoleClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const auth = await requireLeader(request);
    if (!auth.ok) return auth.response;

    const body = await request.json().catch(() => ({}));
    const id = String(body?.id ?? "").trim();
    if (!id) {
      return NextResponse.json({ error: "id er påkrevd" }, { status: 400 });
    }

    const supabase = getSupabaseServiceRoleClient();
    if (!supabase) {
      return NextResponse.json(
        { error: "Supabase er ikke konfigurert" },
        { status: 500 }
      );
    }

    const { data: row, error: findError } = await supabase
      .from("activity_waitlist")
      .select("id, activity_id, member_id")
      .eq("id", id)
      .maybeSingle();

    if (findError) {
      return NextResponse.json({ error: findError.message }, { status: 500 });
    }

    if (!row) {
      return NextResponse.json(
        { error: "Ventelisteposten finnes ikke." },
        { status: 404 }
      );
    }

    const activityId = String((row as any).activity_id ?? "");
    const memberId = String((row as any).member_id ?? "");

    const { data: existingEnrollment, error: enrollmentError } = await supabase
      .from("enrollments")
      .select("id")
      .eq("activity_id", activityId)
      .eq("member_id", memberId)
      .maybeSingle();

    if (enrollmentError) {
      return NextResponse.json(
        { error: enrollmentError.message },
        { status: 500 }
      );
    }

    if (existingEnrollment?.id) {
      const { error: updateError } = await supabase
        .from("enrollments")
        .update({ role: "participant" })
        .eq("id", existingEnrollment.id);

      if (updateError) {
        return NextResponse.json(
          { error: updateError.message },
          { status: 500 }
        );
      }
    } else {
      const { error: insertError } = await supabase.from("enrollments").insert({
        activity_id: activityId,
        member_id: memberId,
        role: "participant",
      });

      if (insertError) {
        return NextResponse.json(
          { error: insertError.message },
          { status: 500 }
        );
      }
    }

    const { error: deleteError } = await supabase
      .from("activity_waitlist")
      .delete()
      .eq("id", id);

    if (deleteError) {
      return NextResponse.json({ error: deleteError.message }, { status: 500 });
    }

    return NextResponse.json({
      ok: true,
      enrollment: {
        activity_id: activityId,
        member_id: memberId,
        role: "participant",
      },
    });
  } catch (err: any) {
    return NextResponse.json(
      { error: err?.message || "Ukjent feil" },
      { status: 500 }
    );
  }
}
