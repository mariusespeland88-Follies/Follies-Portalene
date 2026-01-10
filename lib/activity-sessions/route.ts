// PATH: lib/activity-sessions/route.ts
import { NextResponse } from "next/server";
import { getSupabaseServiceRoleClient } from "@/lib/supabase/server";

function S(v: any) {
  return v == null ? "" : String(v);
}

export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const activityId = url.searchParams.get("activityId") || "";

    if (!activityId) {
      return NextResponse.json({ error: "Missing activityId" }, { status: 400 });
    }

    const supabase = getSupabaseServiceRoleClient();
    if (!supabase) {
      return NextResponse.json({ error: "Service client missing" }, { status: 500 });
    }

    const { data: sessions, error: sErr } = await supabase
      .from("activity_sessions")
      .select("id, activity_id, title, start_at, end_at, location, note, created_at")
      .eq("activity_id", activityId)
      .order("start_at", { ascending: true });

    if (sErr) {
      return NextResponse.json({ error: sErr.message }, { status: 500 });
    }

    const ids = (sessions || []).map((r: any) => S(r.id)).filter(Boolean);

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

    const out = (sessions || []).map((r: any) => ({
      id: S(r.id),
      activity_id: S(r.activity_id),
      title: S(r.title) || "Økt",
      start_at: S(r.start_at),
      end_at: S(r.end_at),
      location: r.location ?? "",
      note: r.note ?? "",
      targets: Array.from(new Set(targetsBySession[S(r.id)] || [])),
    }));

    return NextResponse.json({ sessions: out });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || "Unknown error" }, { status: 500 });
  }
}
