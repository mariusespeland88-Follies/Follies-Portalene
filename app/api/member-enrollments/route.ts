import { NextResponse } from "next/server";
import { requireLeader } from "@/lib/authz/apiAuth";
import { getSupabaseServiceRoleClient } from "@/lib/supabase/server";

export async function PUT(req: Request) {
  const auth = await requireLeader(req);
  if (!auth.ok) return auth.response;

  const body = await req.json().catch(() => ({}));
  const memberId = String(body?.memberId || body?.id || "").trim();
  const activityIds = Array.isArray(body?.activity_ids)
    ? body.activity_ids.map((a: any) => String(a)).filter(Boolean)
    : [];

  if (!memberId) {
    return NextResponse.json({ error: "Mangler memberId" }, { status: 400 });
  }

  const db = getSupabaseServiceRoleClient();
  if (!db) {
    return NextResponse.json(
      { error: "Supabase er ikke konfigurert" },
      { status: 500 }
    );
  }

  const { error: delError } = await db
    .from("enrollments")
    .delete()
    .eq("member_id", memberId);
  if (delError) {
    return NextResponse.json({ error: delError.message }, { status: 500 });
  }

  if (activityIds.length) {
    const rows = activityIds.map((activityId: string) => ({
      member_id: memberId,
      activity_id: activityId,
    }));

    const { error: insertError } = await db.from("enrollments").insert(rows);
    if (insertError) {
      return NextResponse.json({ error: insertError.message }, { status: 500 });
    }
  }

  return NextResponse.json({ success: true });
}
