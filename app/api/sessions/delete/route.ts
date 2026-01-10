// PATH: app/api/sessions/delete/route.ts
import { NextResponse } from "next/server";
import { getSupabaseServiceRoleClient } from "@/lib/supabase/server";

const S = (v: any) => String(v ?? "").trim();

export async function POST(req: Request) {
  try {
    const supabase = getSupabaseServiceRoleClient();
    if (!supabase) {
      return NextResponse.json(
        { error: "Service role client mangler (SUPABASE_SERVICE_ROLE_KEY er ikke satt på Vercel)." },
        { status: 500 }
      );
    }

    const body = await req.json().catch(() => ({}));
    const id = S(body.id);

    if (!id) return NextResponse.json({ error: "Missing id" }, { status: 400 });

    const { error: tdel } = await supabase
      .from("activity_session_targets")
      .delete()
      .eq("session_id", id);
    if (tdel) return NextResponse.json({ error: tdel.message }, { status: 500 });

    const { error: sdel } = await supabase
      .from("activity_sessions")
      .delete()
      .eq("id", id);
    if (sdel) return NextResponse.json({ error: sdel.message }, { status: 500 });

    return NextResponse.json({ ok: true });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || "Unknown error" }, { status: 500 });
  }
}
