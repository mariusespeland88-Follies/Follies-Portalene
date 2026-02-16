import { NextResponse } from "next/server";
import { requireApiMember } from "@/lib/authz/apiAuth";
import { getSupabaseServiceRoleClient } from "@/lib/supabase/server";

export async function GET(req: Request) {
  const auth = await requireApiMember(req);
  if (!auth.ok) return auth.response;

  const { searchParams } = new URL(req.url);
  const requestedMember = String(searchParams.get("member") || "").trim();
  const memberId = auth.memberId;
  if (!memberId) {
    return NextResponse.json({ error: "Fant ikke medlem" }, { status: 403 });
  }

  if (requestedMember && requestedMember !== memberId) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const db = getSupabaseServiceRoleClient();
  if (!db) {
    return NextResponse.json(
      { error: "Supabase er ikke konfigurert" },
      { status: 500 }
    );
  }

  const { data, error } = await db
    .from("enrollments")
    .select("activity_id")
    .eq("member_id", memberId);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json(data || []);
}
