import { NextResponse } from "next/server";

import { requireApiMember } from "@/lib/authz/apiAuth";
import { getSupabaseServiceRoleClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

export async function DELETE(
  request: Request,
  context: { params: { id: string } }
) {
  const auth = await requireApiMember(request);
  if (!auth.ok) return auth.response;

  const id = String(context.params.id ?? "").trim();
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
    .from("member_calendar_events")
    .select("id, member_id")
    .eq("id", id)
    .maybeSingle();

  if (findError) {
    return NextResponse.json({ error: findError.message }, { status: 500 });
  }

  if (!row) {
    return NextResponse.json({ error: "Fant ikke hendelsen." }, { status: 404 });
  }

  if (!auth.isAdmin && String((row as any).member_id ?? "") !== String(auth.memberId ?? "")) {
    return NextResponse.json(
      { error: "Du har ikke tilgang til å slette denne hendelsen." },
      { status: 403 }
    );
  }

  const { error: deleteError } = await supabase
    .from("member_calendar_events")
    .delete()
    .eq("id", id);

  if (deleteError) {
    return NextResponse.json({ error: deleteError.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
