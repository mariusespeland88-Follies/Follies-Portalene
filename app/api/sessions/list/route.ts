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
    const { activityId } = await req.json();
    if (!activityId) return NextResponse.json({ error: "Missing activityId" }, { status: 400 });

    const supabase = getAdminClient();

    const sRes = await supabase
      .from("activity_sessions")
      .select("id, activity_id, title, start_at, end_at, location, note")
      .eq("activity_id", activityId)
      .order("start_at", { ascending: true });

    if (sRes.error) throw sRes.error;

    const tRes = await supabase
      .from("activity_session_targets")
      .select("session_id, member_id")
      .in("session_id", (sRes.data ?? []).map((s) => s.id));

    if (tRes.error) throw tRes.error;

    const targetBySession = new Map<string, string[]>();
    for (const r of tRes.data ?? []) {
      const sid = String((r as any).session_id);
      const mid = String((r as any).member_id);
      const arr = targetBySession.get(sid) ?? [];
      arr.push(mid);
      targetBySession.set(sid, arr);
    }

    // Hent navn for target-medlemmer (for pen visning, ikke UUID)
    const allMemberIds = Array.from(
      new Set((tRes.data ?? []).map((r: any) => String(r.member_id)))
    );

    let membersById = new Map<string, any>();
    if (allMemberIds.length) {
      const mRes = await supabase
        .from("members")
        .select("id, first_name, last_name, email, name, full_name")
        .in("id", allMemberIds);

      if (!mRes.error) {
        for (const m of mRes.data ?? []) {
          membersById.set(String((m as any).id), m);
        }
      }
    }

    const out = (sRes.data ?? []).map((s: any) => {
      const sid = String(s.id);
      const mids = (targetBySession.get(sid) ?? []).map(String);
      const targetMembers = mids.map((id) => {
        const m = membersById.get(id);
        const name =
          (m?.first_name || m?.last_name)
            ? `${m?.first_name ?? ""} ${m?.last_name ?? ""}`.trim()
            : (m?.full_name || m?.name || m?.email || null);
        return { id, name: name ?? null, email: m?.email ?? null };
      });

      return {
        id: sid,
        activity_id: String(s.activity_id),
        title: s.title ?? "Økt",
        start_at: s.start_at,
        end_at: s.end_at ?? null,
        location: s.location ?? "",
        note: s.note ?? "",
        targetIds: mids,
        targetMembers,
      };
    });

    return NextResponse.json({ sessions: out });
  } catch (e: any) {
    return NextResponse.json({ error: String(e?.message ?? e) }, { status: 500 });
  }
}
