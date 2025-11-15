import { NextResponse } from "next/server";

import { getSupabaseServiceRoleClient } from "@/lib/supabase/server";

function mapVolunteer(row: any) {
  const member = row?.member || row?.members || null;
  return {
    id: row.id,
    activity_id: row.activity_id,
    member_id: row.member_id,
    role: row.role,
    notes: row.notes,
    created_at: row.created_at,
    member: member
      ? {
          id: member.id,
          first_name: member.first_name,
          last_name: member.last_name,
          email: member.email,
          phone: member.phone,
        }
      : null,
  };
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const activityId = searchParams.get("activityId");
  if (!activityId) {
    return NextResponse.json({ error: "activityId er påkrevd" }, { status: 400 });
  }

  const supabase = getSupabaseServiceRoleClient();
  if (!supabase) {
    return NextResponse.json([], { status: 200 });
  }

  const { data, error } = await supabase
    .from("activity_volunteers")
    .select(
      "id, activity_id, member_id, role, notes, created_at, member:member_id ( id, first_name, last_name, email, phone )"
    )
    .eq("activity_id", activityId)
    .order("created_at", { ascending: true });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json((data ?? []).map(mapVolunteer));
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { activityId, memberId, role, notes } = body ?? {};

    if (!activityId || !memberId) {
      return NextResponse.json({ error: "activityId og memberId er påkrevde" }, { status: 400 });
    }

    const supabase = getSupabaseServiceRoleClient();
    if (!supabase) {
      return NextResponse.json({ error: "Supabase er ikke konfigurert" }, { status: 500 });
    }

    const { data, error } = await supabase
      .from("activity_volunteers")
      .insert({
        activity_id: activityId,
        member_id: memberId,
        role: role ?? null,
        notes: notes ?? null,
      })
      .select(
        "id, activity_id, member_id, role, notes, created_at, member:member_id ( id, first_name, last_name, email, phone )"
      )
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json(mapVolunteer(data));
  } catch (err: any) {
    return NextResponse.json({ error: err?.message || "Ukjent feil" }, { status: 500 });
  }
}
