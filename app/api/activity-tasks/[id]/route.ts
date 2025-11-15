import { NextResponse } from "next/server";

import { getSupabaseServiceRoleClient } from "@/lib/supabase/server";

const STATUS_VALUES = new Set(["todo", "in_progress", "done"]);

function normalizeStatus(value: any): "todo" | "in_progress" | "done" {
  const str = String(value ?? "todo").toLowerCase();
  if (STATUS_VALUES.has(str)) {
    return str as "todo" | "in_progress" | "done";
  }
  return "todo";
}

function mapTask(row: any) {
  const member = row?.member || row?.members || null;
  return {
    id: row.id,
    activity_id: row.activity_id,
    title: row.title,
    description: row.description,
    status: normalizeStatus(row.status),
    assigned_member_id: row.assigned_member_id,
    due_date: row.due_date,
    sort_order: row.sort_order,
    created_by: row.created_by,
    completed_at: row.completed_at,
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
  if (typeof body.title === "string") updates.title = body.title;
  if (typeof body.description === "string" || body.description === null)
    updates.description = body.description ?? null;
  if ("assignedMemberId" in body)
    updates.assigned_member_id = body.assignedMemberId || null;
  if ("dueDate" in body) updates.due_date = body.dueDate || null;
  if (typeof body.sortOrder === "number" && Number.isFinite(body.sortOrder))
    updates.sort_order = Math.trunc(body.sortOrder);
  if ("createdBy" in body) updates.created_by = body.createdBy || null;

  const supabase = getSupabaseServiceRoleClient();
  if (!supabase) {
    return NextResponse.json({ error: "Supabase er ikke konfigurert" }, { status: 500 });
  }

  const { data: existing, error: fetchError } = await supabase
    .from("activity_tasks")
    .select("status, completed_at")
    .eq("id", id)
    .maybeSingle();
  if (fetchError) {
    return NextResponse.json({ error: fetchError.message }, { status: 500 });
  }

  if ("status" in body) {
    const nextStatus = normalizeStatus(body.status);
    updates.status = nextStatus;
    if (!existing || normalizeStatus(existing.status) !== nextStatus) {
      updates.completed_at = nextStatus === "done" ? new Date().toISOString() : null;
    } else {
      updates.completed_at = existing.completed_at ?? null;
    }
  } else if (existing && updates.completed_at === undefined) {
    updates.completed_at = existing.completed_at ?? null;
  }

  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ error: "Ingen gyldige felter" }, { status: 400 });
  }

  const { data, error } = await supabase
    .from("activity_tasks")
    .update(updates)
    .eq("id", id)
    .select(
      "id, activity_id, title, description, status, assigned_member_id, due_date, sort_order, created_by, completed_at, created_at, member:assigned_member_id ( id, first_name, last_name, email, phone )"
    )
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json(mapTask(data));
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

  const { error } = await supabase.from("activity_tasks").delete().eq("id", id);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}
