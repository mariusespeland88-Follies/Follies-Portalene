// PATH: app/api/activity-participants/route.ts
import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { requireApiUser } from "@/lib/authz/apiAuth";

/**
 * Returnerer { participants: { id, name }[] } for gitt ?id=<activity_id>
 * Leser fra Supabase på server (Service Role key via server-env).
 * Forventer tabeller:
 *  - enrollments (member_id, activity_id, role?)
 *  - members (id, first_name, last_name, archived)
 */

export async function GET(request: Request) {
  try {
    const auth = await requireApiUser(request);
    if (!auth.ok) return auth.response;

    const { searchParams } = new URL(request.url);
    const activityId = searchParams.get("id");
    if (!activityId) {
      return NextResponse.json({ error: "Mangler ?id" }, { status: 400 });
    }

    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY! // server only
    );

    const { data: rows, error } = await supabase
      .from("enrollments")
      .select("member_id")
      .eq("activity_id", activityId);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    const memberIds = Array.from(
      new Set((rows ?? []).map((r: any) => String(r?.member_id ?? "")).filter(Boolean))
    );

    if (memberIds.length === 0) return NextResponse.json({ participants: [] });

    const { data: members, error: mErr } = await supabase
      .from("members")
      .select("id, first_name, last_name, archived")
      .in("id", memberIds);

    if (mErr) {
      return NextResponse.json({ error: mErr.message }, { status: 500 });
    }

    const participants =
      (members ?? [])
        .filter((m: any) => m && !m.archived)
        .map((m: any) => ({
          id: String(m.id),
          name: [m.first_name, m.last_name].filter(Boolean).join(" ") || "Uten navn",
        }));

    return NextResponse.json({ participants });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || "Ukjent feil" }, { status: 500 });
  }
}
