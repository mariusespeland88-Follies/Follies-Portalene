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
    const { sessionId, activityId, title, start_at, end_at, location, note, targetIds } = await req.json();

    if (!activityId) return NextResponse.json({ error: "Missing activityId" }, { status: 400 });
    if (!start_at) return NextResponse.json({ error: "Missing start_at" }, { status: 400 });

    const supabase = getAdminClient();

    const payload = {
      activity_id: activityId,
      title: title ?? "Økt",
      start_at,
      end_at: end_at ?? null,
      location: location ?? null,
      note: note ?? null,
    };

    let id = sessionId ? String(sessionId) : null;

    if (id) {
      const up = await supabase.from("activity_sessions").update(payload).eq("id", id);
      if (up.error) throw up.error;
    } else {
      const ins = await supabase.from("activity_sessions").insert(payload).select("id").single();
      if (ins.error) throw ins.error;
      id = String((ins.data as any).id);
    }

    // Targets: slett og sett inn på nytt
    const delT = await supabase.from("activity_session_targets").delete().eq("session_id", id);
    if (delT.error) throw delT.error;

    const tids = Array.isArray(targetIds) ? targetIds.map(String).filter(Boolean) : [];
    if (tids.length) {
      const rows = tids.map((mid) => ({ session_id: id, member_id: mid }));
      const insT = await supabase.from("activity_session_targets").insert(rows);
      if (insT.error) throw insT.error;
    }

    return NextResponse.json({ id });
  } catch (e: any) {
    return NextResponse.json({ error: String(e?.message ?? e) }, { status: 500 });
  }
}
