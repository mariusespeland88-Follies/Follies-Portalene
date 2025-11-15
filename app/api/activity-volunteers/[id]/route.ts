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

export async function PATCH(request: Request, { params }: { params: { id: string } }) {
  const id = params?.id;
  if (!id) {
    return NextResponse.json({ error: "Mangler id" }, { status: 400 });
  }

  let body: any = {};
  try {
    body = await request.json();
  } catch {
    body = {};
  }

  const updates: Record<string, any> = {};
  if (body.activityId) updates.activity_id = body.activityId;
  if (body.memberId) updates.member_id = body.memberId;
  if (typeof body.role === "string" || body.role === null) updates.role = body.role;
  if (typeof body.notes === "string" || body.notes === null) updates.notes = body.notes;

  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ error: "Ingen gyldige felter" }, { status: 400 });
  }

  const supabase = getSupabaseServiceRoleClient();
  if (!supabase) {
    return NextResponse.json({ error: "Supabase er ikke konfigurert" }, { status: 500 });
  }

  const { data, error } = await supabase
    .from("activity_volunteers")
    .update(updates)
    .eq("id", id)
    .select(
      "id, activity_id, member_id, role, notes, created_at, member:member_id ( id, first_name, last_name, email, phone )"
    )
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json(mapVolunteer(data));
}

export async function DELETE(_request: Request, { params }: { params: { id: string } }) {
  const id = params?.id;
  if (!id) {
    return NextResponse.json({ error: "Mangler id" }, { status: 400 });
  }

  const supabase = getSupabaseServiceRoleClient();
  if (!supabase) {
    return NextResponse.json({ success: true });
  }

  const { error } = await supabase.from("activity_volunteers").delete().eq("id", id);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}
