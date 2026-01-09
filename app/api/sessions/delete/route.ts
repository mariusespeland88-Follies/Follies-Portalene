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

    const delT = await supabase.from("activity_session_targets").delete().eq("session_id", sessionId);
    if (delT.error) throw delT.error;

    const delS = await supabase.from("activity_sessions").delete().eq("id", sessionId);
    if (delS.error) throw delS.error;

    return NextResponse.json({ ok: true });
  } catch (e: any) {
    return NextResponse.json({ error: String(e?.message ?? e) }, { status: 500 });
  }
}
