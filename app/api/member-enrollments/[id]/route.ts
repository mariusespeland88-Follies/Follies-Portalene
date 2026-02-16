import { NextResponse } from "next/server";
import { requireLeader } from "@/lib/authz/apiAuth";
import { getSupabaseServiceRoleClient } from "@/lib/supabase/server";

function asIdSet(items: unknown): Set<string> {
  if (!Array.isArray(items)) return new Set();
  return new Set(items.map((x) => String(x || "").trim()).filter(Boolean));
}

export async function PUT(req: Request, { params }: { params: { id: string } }) {
  const auth = await requireLeader(req);
  if (!auth.ok) return auth.response;

  const memberId = String(params?.id || "").trim();
  const body = await req.json().catch(() => ({}));
  const nextIds = asIdSet(body?.activity_ids);

  if (!memberId) {
    return NextResponse.json({ error: "Mangler member id" }, { status: 400 });
  }

  const db = getSupabaseServiceRoleClient();
  if (!db) {
    return NextResponse.json(
      { error: "Supabase er ikke konfigurert" },
      { status: 500 }
    );
  }

  const { data: currentRows, error: currentError } = await db
    .from("enrollments")
    .select("activity_id")
    .eq("member_id", memberId);
  if (currentError) {
    return NextResponse.json({ error: currentError.message }, { status: 500 });
  }

  const currentIds = asIdSet((currentRows || []).map((r: any) => r.activity_id));
  const toAdd = Array.from(nextIds).filter((id) => !currentIds.has(id));
  const toRemove = Array.from(currentIds).filter((id) => !nextIds.has(id));

  if (toAdd.length) {
    const rows = toAdd.map((activityId) => ({
      member_id: memberId,
      activity_id: activityId,
    }));
    const { error } = await db
      .from("enrollments")
      .upsert(rows, { onConflict: "member_id,activity_id" });
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
  }

  if (toRemove.length) {
    const { error } = await db
      .from("enrollments")
      .delete()
      .eq("member_id", memberId)
      .in("activity_id", toRemove);
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
  }

  return NextResponse.json({ success: true, added: toAdd, removed: toRemove });
}
