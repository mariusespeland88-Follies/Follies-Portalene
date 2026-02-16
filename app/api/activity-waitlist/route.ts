import { NextResponse } from "next/server";

import { requireLeader } from "@/lib/authz/apiAuth";
import { getSupabaseServiceRoleClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

function mapWaitlist(row: any) {
  const member = row.member ?? null;
  return {
    id: String(row.id),
    activity_id: String(row.activity_id),
    member_id: String(row.member_id),
    note: row.note ?? null,
    priority: Number(row.priority ?? 0),
    created_at: String(row.created_at),
    updated_at: String(row.updated_at),
    member: member
      ? {
          id: String(member.id),
          first_name: member.first_name ?? "",
          last_name: member.last_name ?? "",
          email: member.email ?? "",
          phone: member.phone ?? "",
        }
      : null,
  };
}

export async function GET(request: Request) {
  const auth = await requireLeader(request);
  if (!auth.ok) return auth.response;

  const { searchParams } = new URL(request.url);
  const activityId = String(searchParams.get("activityId") ?? "").trim();
  if (!activityId) {
    return NextResponse.json(
      { error: "activityId er påkrevd" },
      { status: 400 }
    );
  }

  const supabase = getSupabaseServiceRoleClient();
  if (!supabase) {
    return NextResponse.json({ items: [] });
  }

  const { data, error } = await supabase
    .from("activity_waitlist")
    .select(
      "id, activity_id, member_id, note, priority, created_at, updated_at, member:member_id ( id, first_name, last_name, email, phone )"
    )
    .eq("activity_id", activityId)
    .order("priority", { ascending: false })
    .order("created_at", { ascending: true });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({
    items: (data ?? []).map((row) => mapWaitlist(row)),
  });
}

export async function POST(request: Request) {
  try {
    const auth = await requireLeader(request);
    if (!auth.ok) return auth.response;

    const body = await request.json().catch(() => ({}));
    const activityId = String(body?.activityId ?? "").trim();
    const memberId = String(body?.memberId ?? "").trim();
    const note =
      typeof body?.note === "string" && body.note.trim().length > 0
        ? body.note.trim()
        : null;
    const priority = Number.isFinite(Number(body?.priority))
      ? Number(body.priority)
      : 0;

    if (!activityId || !memberId) {
      return NextResponse.json(
        { error: "activityId og memberId er påkrevd" },
        { status: 400 }
      );
    }

    const supabase = getSupabaseServiceRoleClient();
    if (!supabase) {
      return NextResponse.json(
        { error: "Supabase er ikke konfigurert" },
        { status: 500 }
      );
    }

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
      return NextResponse.json(
        { error: "Medlemmet er allerede registrert som deltaker/leder." },
        { status: 409 }
      );
    }

    const { data, error } = await supabase
      .from("activity_waitlist")
      .insert({
        activity_id: activityId,
        member_id: memberId,
        note,
        priority,
        created_by_member_id: auth.memberId,
      })
      .select(
        "id, activity_id, member_id, note, priority, created_at, updated_at, member:member_id ( id, first_name, last_name, email, phone )"
      )
      .single();

    if (error) {
      if ((error as any)?.code === "23505") {
        return NextResponse.json(
          { error: "Dette medlemmet står allerede på ventelisten." },
          { status: 409 }
        );
      }
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ item: mapWaitlist(data) });
  } catch (err: any) {
    return NextResponse.json(
      { error: err?.message || "Ukjent feil" },
      { status: 500 }
    );
  }
}

export async function DELETE(request: Request) {
  const auth = await requireLeader(request);
  if (!auth.ok) return auth.response;

  const { searchParams } = new URL(request.url);
  const id = String(searchParams.get("id") ?? "").trim();

  if (!id) {
    return NextResponse.json(
      { error: "id er påkrevd" },
      { status: 400 }
    );
  }

  const supabase = getSupabaseServiceRoleClient();
  if (!supabase) {
    return NextResponse.json(
      { error: "Supabase er ikke konfigurert" },
      { status: 500 }
    );
  }

  const { error } = await supabase.from("activity_waitlist").delete().eq("id", id);
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
