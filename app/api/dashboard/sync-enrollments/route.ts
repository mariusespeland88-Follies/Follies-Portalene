// PATH: app/api/dashboard/sync-enrollments/route.ts
import { NextRequest, NextResponse } from "next/server";
import { requireApiUser } from "@/lib/authz/apiAuth";
import { getSupabaseServiceRoleClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  try {
    const auth = await requireApiUser(req);
    if (!auth.ok) return auth.response;

    const db = getSupabaseServiceRoleClient();
    if (!db) {
      return NextResponse.json({ ok: false, error: "Server mangler Supabase-konfig." }, { status: 500 });
    }

    const body = await req.json();
    const email = String(auth.user.email || body?.email || "").trim();
    const role = body?.role === "leader" ? "leader" : "participant";
    const activityIds: string[] = Array.isArray(body?.activityIds) ? body.activityIds.map((x: any) => String(x)) : [];

    if (!email || activityIds.length === 0) {
      return NextResponse.json({ ok: false, error: "Missing email or activityIds" }, { status: 400 });
    }

    // Finn eller opprett medlem
    let mRow: { id: string } | null = auth.memberId ? { id: auth.memberId } : null;
    if (!mRow?.id) {
      const { data: byEmail } = await db
        .from("members")
        .select("id")
        .ilike("email", email)
        .maybeSingle();
      mRow = byEmail ? { id: String((byEmail as any).id) } : null;
    }
    if (!mRow?.id) {
      const { data: created, error: cErr } = await db
        .from("members")
        .insert({ email })
        .select("id")
        .single();
      if (cErr) throw cErr;
      mRow = { id: String((created as any)?.id || "") };
    }
    const memberId = String(mRow!.id);

    let created = 0, updated = 0;
    for (const aid of activityIds) {
      const { data: ex } = await db
        .from("enrollments")
        .select("id, role")
        .eq("activity_id", aid)
        .eq("member_id", memberId)
        .maybeSingle();

      if (!ex?.id) {
        const { error } = await db.from("enrollments").insert({ activity_id: aid, member_id: memberId, role });
        if (!error) created++;
      } else if (ex.role !== role) {
        const { error } = await db.from("enrollments").update({ role }).eq("id", ex.id);
        if (!error) updated++;
      }
    }

    return NextResponse.json({ ok: true, created, updated });
  } catch (err: any) {
    return NextResponse.json({ ok: false, error: err?.message ?? "Unknown error" }, { status: 500 });
  }
}
