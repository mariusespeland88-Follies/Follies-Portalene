import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

function getAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
  return createClient(url, key, { auth: { persistSession: false } });
}

function fullName(m: any) {
  const n = `${m?.first_name ?? ""} ${m?.last_name ?? ""}`.trim();
  return (n || m?.email || "Uten navn").trim();
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

    const session = sRes.data as any;
    const activityId = String(session.activity_id);

    // targets
    const tRes = await supabase
      .from("activity_session_targets")
      .select("member_id")
      .eq("session_id", sessionId);
    if (tRes.error) throw tRes.error;

    const targetIds = Array.from(
      new Set((tRes.data ?? []).map((r: any) => String(r.member_id)).filter(Boolean))
    );

    // target members
    let targetMembers: any[] = [];
    if (targetIds.length) {
      const mRes = await supabase
        .from("members")
        .select("id, first_name, last_name, email")
        .in("id", targetIds);
      if (mRes.error) throw mRes.error;

      targetMembers = (mRes.data ?? []).map((m: any) => ({
        id: String(m.id),
        name: fullName(m),
        email: m.email ?? null,
      }));
    }

    // leaders/participants via enrollments -> member ids -> members
    const eRes = await supabase
      .from("enrollments")
      .select("member_id, role")
      .eq("activity_id", activityId);
    if (eRes.error) throw eRes.error;

    const leaderIds = Array.from(
      new Set((eRes.data ?? []).filter((x: any) => x.role === "leader").map((x: any) => String(x.member_id)))
    );
    const participantIds = Array.from(
      new Set((eRes.data ?? []).filter((x: any) => x.role === "participant").map((x: any) => String(x.member_id)))
    );
    const allIds = Array.from(new Set([...leaderIds, ...participantIds])).filter(Boolean);

    let peopleById = new Map<string, any>();
    if (allIds.length) {
      const mmRes = await supabase
        .from("members")
        .select("id, first_name, last_name, email")
        .in("id", allIds);
      if (mmRes.error) throw mmRes.error;

      for (const m of mmRes.data ?? []) {
        peopleById.set(String((m as any).id), {
          id: String((m as any).id),
          name: fullName(m),
          email: (m as any).email ?? null,
        });
      }
    }

    const leaders = leaderIds.map((id) => peopleById.get(String(id))).filter(Boolean);
    const participants = participantIds.map((id) => peopleById.get(String(id))).filter(Boolean);

    return NextResponse.json({
      session,
      targetIds,
      targetMembers,
      leaders,
      participants,
    });
  } catch (e: any) {
    return NextResponse.json({ error: String(e?.message ?? e) }, { status: 500 });
  }
}
