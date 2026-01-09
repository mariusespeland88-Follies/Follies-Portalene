import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

function getAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
  return createClient(url, key, { auth: { persistSession: false } });
}

export async function POST(req: Request) {
  try {
    const { sessionId } = await req.json();
    if (!sessionId) return NextResponse.json({ error: "Missing sessionId" }, { status: 400 });

    const supabase = getAdminClient();

    const sRes = await supabase
      .from("activity_sessions")
      .select("id, activity_id, title, start_at, end_at, location, note")
      .eq("id", sessionId)
      .single();
    if (sRes.error) throw sRes.error;

    const tRes = await supabase
      .from("activity_session_targets")
      .select("member_id")
      .eq("session_id", sessionId);
    if (tRes.error) throw tRes.error;

    const tids = (tRes.data ?? []).map((r: any) => String(r.member_id)).filter(Boolean);

    let targetMembers: any[] = [];
    if (tids.length) {
      const mRes = await supabase
        .from("members")
        .select("id, first_name, last_name, email, name, full_name")
        .in("id", tids);
      if (!mRes.error) targetMembers = mRes.data ?? [];
    }

    // leaders/participants (2-stegs via enrollments)
    const eRes = await supabase
      .from("enrollments")
      .select("member_id, role")
      .eq("activity_id", (sRes.data as any).activity_id);
    if (eRes.error) throw eRes.error;

    const leaderIds = Array.from(new Set((eRes.data ?? []).filter((x: any) => x.role === "leader").map((x: any) => String(x.member_id))));
    const partIds = Array.from(new Set((eRes.data ?? []).filter((x: any) => x.role === "participant").map((x: any) => String(x.member_id))));
    const allIds = Array.from(new Set([...leaderIds, ...partIds]));

    let allMembers: any[] = [];
    if (allIds.length) {
      const mmRes = await supabase
        .from("members")
        .select("id, first_name, last_name, email, name, full_name")
        .in("id", allIds);
      if (!mmRes.error) allMembers = mmRes.data ?? [];
    }

    const byId = new Map(allMembers.map((m: any) => [String(m.id), m]));
    const leaders = leaderIds.map((id) => byId.get(id)).filter(Boolean);
    const participants = partIds.map((id) => byId.get(id)).filter(Boolean);

    return NextResponse.json({
      session: sRes.data,
      targetIds: tids,
      targetMembers,
      leaders,
      participants,
    });
  } catch (e: any) {
    return NextResponse.json({ error: String(e?.message ?? e) }, { status: 500 });
  }
}
