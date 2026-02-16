import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { requireApiMember } from "@/lib/authz/apiAuth";

export const runtime = "nodejs";

const LEADER_ROLES = new Set(["leader", "leder", "staff", "admin"]);

function participantRole(role: unknown): "leader" | "member" {
  const r = String(role ?? "").trim().toLowerCase();
  return LEADER_ROLES.has(r) ? "leader" : "member";
}

export async function POST(req: Request) {
  try {
    const auth = await requireApiMember(req);
    if (!auth.ok) return auth.response;

    const body = await req.json().catch(() => ({}));
    const requested = Array.isArray(body?.activityIds)
      ? body.activityIds.map((x: any) => String(x).trim()).filter(Boolean)
      : [];

    const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY!;
    if (!url || !key) {
      return NextResponse.json({ error: "Mangler SUPABASE env" }, { status: 500 });
    }

    const db = createClient(url, key);

    let myEnrollmentsQuery = db
      .from("enrollments")
      .select("activity_id")
      .eq("member_id", auth.memberId);

    if (requested.length) {
      myEnrollmentsQuery = myEnrollmentsQuery.in("activity_id", requested);
    }

    const { data: myRows, error: myErr } = await myEnrollmentsQuery;
    if (myErr) return NextResponse.json({ error: myErr.message }, { status: 500 });

    const activityIds = Array.from(
      new Set((myRows || []).map((r: any) => String(r.activity_id || "")).filter(Boolean))
    );

    if (!activityIds.length) {
      return NextResponse.json({ ok: true, threads: [] });
    }

    const { data: actRows } = await db
      .from("activities")
      .select("id, name, title")
      .in("id", activityIds);

    const nameById = new Map<string, string>();
    for (const a of actRows || []) {
      const id = String((a as any)?.id || "");
      const name = String((a as any)?.title || (a as any)?.name || "").trim();
      if (id) nameById.set(id, name || "Aktivitet");
    }

    const threads: Array<{ activity_id: string; conversation_id: string; participants: number }> = [];

    for (const activityId of activityIds) {
      const { data: existingRows, error: existingErr } = await db
        .from("conversations")
        .select("id")
        .eq("type", "activity")
        .eq("activity_id", activityId)
        .order("created_at", { ascending: true })
        .limit(1);

      if (existingErr) {
        return NextResponse.json({ error: existingErr.message }, { status: 500 });
      }

      let conversationId = String((existingRows || [])[0]?.id || "").trim();

      if (!conversationId) {
        const { data: created, error: createErr } = await db
          .from("conversations")
          .insert({
            type: "activity",
            activity_id: activityId,
            title: nameById.get(activityId) ?? "Aktivitet",
            created_by: auth.memberId,
          })
          .select("id")
          .single();

        if (createErr) return NextResponse.json({ error: createErr.message }, { status: 500 });
        conversationId = String((created as any)?.id || "");
      }

      const { data: enrollRows, error: enrollErr } = await db
        .from("enrollments")
        .select("member_id, role")
        .eq("activity_id", activityId);
      if (enrollErr) return NextResponse.json({ error: enrollErr.message }, { status: 500 });

      const byMember = new Map<
        string,
        { conversation_id: string; member_id: string; role: "leader" | "member" }
      >();
      for (const r of enrollRows || []) {
        const memberId = String((r as any)?.member_id || "").trim();
        if (!memberId) continue;
        byMember.set(memberId, {
          conversation_id: conversationId,
          member_id: memberId,
          role: participantRole((r as any)?.role),
        });
      }
      const payload = Array.from(byMember.values());

      if (payload.length) {
        const { error: upsertErr } = await db
          .from("conversation_participants")
          .upsert(payload, { onConflict: "conversation_id,member_id" });
        if (upsertErr) return NextResponse.json({ error: upsertErr.message }, { status: 500 });
      }

      threads.push({
        activity_id: activityId,
        conversation_id: conversationId,
        participants: payload.length,
      });
    }

    return NextResponse.json({ ok: true, threads });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || "Ukjent feil" }, { status: 500 });
  }
}
