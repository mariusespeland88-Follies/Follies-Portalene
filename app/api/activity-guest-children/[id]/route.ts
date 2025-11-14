import { NextResponse } from "next/server";
import { getSupabaseServiceRoleClient } from "@/lib/supabase/server";

export async function PATCH(
  request: Request,
  { params }: { params: { id: string } }
) {
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
  if ("firstName" in body) updates.first_name = body.firstName ?? null;
  if ("age" in body) updates.age = typeof body.age === "number" ? body.age : null;
  if ("gender" in body) updates.gender = body.gender ?? null;
  if ("notes" in body) updates.notes = body.notes ?? null;

  if (Object.keys(updates).length === 0) {
    return NextResponse.json(
      { error: "Ingen felter å oppdatere" },
      { status: 400 }
    );
  }

  const supabase = getSupabaseServiceRoleClient();
  if (!supabase) {
    return NextResponse.json({ id, ...updates });
  }
  const { data, error } = await supabase
    .from("activity_guest_children")
    .update(updates)
    .eq("id", id)
    .select()
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json(data);
}

export async function DELETE(
  _request: Request,
  { params }: { params: { id: string } }
) {
  const id = params?.id;
  if (!id) {
    return NextResponse.json({ error: "Mangler id" }, { status: 400 });
  }

  const supabase = getSupabaseServiceRoleClient();
  if (!supabase) {
    return NextResponse.json({ success: true });
  }
  const { error } = await supabase
    .from("activity_guest_children")
    .delete()
    .eq("id", id);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}
