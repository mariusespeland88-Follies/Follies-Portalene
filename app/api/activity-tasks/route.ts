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
    .from("activity_tasks")
    .select(
      "id, activity_id, title, description, status, assigned_member_id, due_date, sort_order, created_by, completed_at, created_at, member:assigned_member_id ( id, first_name, last_name, email, phone )"
    )
    .eq("activity_id", activityId)
    .order("sort_order", { ascending: true })
    .order("title", { ascending: true });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json((data ?? []).map(mapTask));
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { activityId, title, description, status, assignedMemberId, dueDate, sortOrder, createdBy } = body ?? {};

    if (!activityId || !title) {
      return NextResponse.json({ error: "activityId og title er påkrevde" }, { status: 400 });
    }

    const supabase = getSupabaseServiceRoleClient();
    if (!supabase) {
      return NextResponse.json({ error: "Supabase er ikke konfigurert" }, { status: 500 });
    }

    const payload = {
      activity_id: activityId,
      title,
      description: description ?? null,
      status: normalizeStatus(status),
      assigned_member_id: assignedMemberId || null,
      due_date: dueDate || null,
      sort_order: typeof sortOrder === "number" ? sortOrder : undefined,
      created_by: createdBy || null,
    };

    const { data, error } = await supabase
      .from("activity_tasks")
      .insert(payload)
      .select(
        "id, activity_id, title, description, status, assigned_member_id, due_date, sort_order, created_by, completed_at, created_at, member:assigned_member_id ( id, first_name, last_name, email, phone )"
      )
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json(mapTask(data));
  } catch (err: any) {
    return NextResponse.json({ error: err?.message || "Ukjent feil" }, { status: 500 });
  }
}
