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
  if (typeof body.firstName === "string") updates.first_name = body.firstName;
  if (typeof body.lastName === "string") updates.last_name = body.lastName;
  if (typeof body.phone === "string") updates.phone = body.phone;
  if (typeof body.email === "string" || body.email === null)
    updates.email = body.email;
  if (typeof body.isNorwegian === "boolean" || body.isNorwegian === null)
    updates.is_norwegian = body.isNorwegian;
  if (typeof body.notes === "string" || body.notes === null)
    updates.notes = body.notes;
  if (typeof body.present === "boolean") updates.present = body.present;

  if (Object.keys(updates).length === 0) {
    return NextResponse.json(
      { error: "Ingen gyldige felter å oppdatere" },
      { status: 400 }
    );
  }

  const supabase = getSupabaseServiceRoleClient();
  if (!supabase) {
    return NextResponse.json({ id, ...updates });
  }

  if ("present" in updates) {
    const { data: existing, error: fetchErr } = await supabase
      .from("activity_guests")
      .select("present")
      .eq("id", id)
      .single();

    if (fetchErr) {
      return NextResponse.json({ error: fetchErr.message }, { status: 500 });
    }

    const wasPresent = !!existing?.present;
    const nextPresent = !!updates.present;

    if (nextPresent && !wasPresent) {
      updates.present_marked_at = new Date().toISOString();
    } else if (!nextPresent) {
      updates.present_marked_at = null;
    }
  }

  const { data, error } = await supabase
    .from("activity_guests")
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
    .from("activity_guests")
    .delete()
    .eq("id", id);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}
