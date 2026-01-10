// PATH: app/api/sessions/list/route.ts
import { NextResponse } from "next/server";
import { getSupabaseServiceRoleClient } from "@/lib/supabase/server";

const S = (v: any) => String(v ?? "").trim();

export async function GET(req: Request) {
  try {
    const supabase = getSupabaseServiceRoleClient();
    if (!supabase) {
      return NextResponse.json({ error: "Service role client missing" }, { status: 500 });
    }

    const url = new URL(req.url);
    const activityId =
      S(url.searchParams.get("activityId")) ||
      S(url.searchParams.get("activity_id"));

    if (!activityId) {
      return NextResponse.json({ error: "Missing activityId" }, { status: 400 });
    }

    // 1) Sessions
    const { data: sessions, error: sErr } = await supabase
      .from("activity_sessions")
      .select("id, activity_id, title, start_at, end_at, location, note, created_at")
      .eq("activity_id", activityId)
      .order("start_at", { ascending: true });

    if (sErr) {
      return NextResponse.json({ error: sErr.message }, { status: 500 });
    }

    const ids = (sessions || []).map((r: any) => S(r.id)).filter(Boolean);

    // 2) Targets
    let targetsBySession: Record<string, string[]> = {};
    if (ids.length) {
      const { data: trows, error: tErr } = await supabase
        .from("activity_session_targets")
        .select("session_id, member_id")
        .in("session_id", ids);

      if (tErr) {
        return NextResponse.json({ error: tErr.message }, { status: 500 });
      }

      targetsBySession = {};
      for (const tr of trows || []) {
        const sid = S((tr as any).session_id);
        const mid = S((tr as any).member_id);
        if (!sid || !mid) continue;
        (targetsBySession[sid] ||= []).push(mid);
      }
    }

    // 3) Normaliser response (samme shape uansett)
    const out = (sessions || []).map((r: any) => {
      const id = S(r.id);
      return {
        id,
        activity_id: S(r.activity_id),
        title: S(r.title) || "Økt",
        start_at: S(r.start_at),
        end_at: S(r.end_at),
        location: r.location ?? "",
        note: r.note ?? "",
        targets: Array.from(new Set(targetsBySession[id] || [])),
      };
    });

    return NextResponse.json({ sessions: out });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || "Unknown error" }, { status: 500 });
  }
}
