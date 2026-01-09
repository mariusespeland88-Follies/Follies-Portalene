import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

function getAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
  return createClient(url, key, { auth: { persistSession: false } });
}

function toHHMM(d: Date) {
  const hh = String(d.getHours()).padStart(2, "0");
  const mm = String(d.getMinutes()).padStart(2, "0");
  return `${hh}:${mm}`;
}

function fullName(m: any) {
  const n = `${m?.first_name ?? ""} ${m?.last_name ?? ""}`.trim();
  return (n || m?.email || "Uten navn").trim();
}

export async function POST(req: Request) {
  try {
    const { activityId } = await req.json();
    if (!activityId) return NextResponse.json({ error: "Missing activityId" }, { status: 400 });

    const supabase = getAdminClient();

    const sRes = await supabase
      .from("activity_sessions")
      .select("id, activity_id, title, start_at, end_at, location, note")
      .eq("activity_id", activityId)
      .order("start_at", { ascending: true });

    if (sRes.error) throw sRes.error;

    const sessions = (sRes.data ?? []) as any[];
    const ids = sessions.map((s) => String(s.id)).filter(Boolean);

    // targets
    let targets: any[] = [];
    if (ids.length) {
      const tRes = await supabase
        .from("activity_session_targets")
        .select("session_id, member_id")
        .in("session_id", ids);
      if (tRes.error) throw tRes.error;
      targets = tRes.data ?? [];
    }

    const targetBySession = new Map<string, string[]>();
    const allMemberIds = new Set<string>();

    for (const r of targets) {
      const sid = String((r as any).session_id);
      const mid = String((r as any).member_id);
      if (!sid || !mid) continue;
      const arr = targetBySession.get(sid) ?? [];
      arr.push(mid);
      targetBySession.set(sid, arr);
      allMemberIds.add(mid);
    }

    // member names for targets (optional “preview”)
    const memberIds = Array.from(allMemberIds);
    const membersById = new Map<string, any>();

    if (memberIds.length) {
      const mRes = await supabase
        .from("members")
        .select("id, first_name, last_name, email")
        .in("id", memberIds);
      if (mRes.error) throw mRes.error;

      for (const m of mRes.data ?? []) {
        membersById.set(String((m as any).id), {
          id: String((m as any).id),
          name: fullName(m),
        });
      }
    }

    const out = sessions.map((s) => {
      const start = s.start_at ? new Date(s.start_at) : null;
      const end = s.end_at ? new Date(s.end_at) : null;

      const date = start ? start.toISOString().slice(0, 10) : "";
      const startTime = start ? toHHMM(start) : "";
      const endTime = end ? toHHMM(end) : "";

      const sid = String(s.id);
      const tids = targetBySession.get(sid) ?? [];
      const targetMembers = tids
        .map((id) => membersById.get(String(id)))
        .filter(Boolean)
        .slice(0, 6); // preview

      return {
        id: sid,
        title: s.title ?? "Økt",
        date,
        startTime,
        endTime,
        location: s.location ?? "",
        note: s.note ?? "",
        targetIds: tids,
        targetMembers,
      };
    });

    return NextResponse.json({ sessions: out });
  } catch (e: any) {
    return NextResponse.json({ error: String(e?.message ?? e) }, { status: 500 });
  }
}
