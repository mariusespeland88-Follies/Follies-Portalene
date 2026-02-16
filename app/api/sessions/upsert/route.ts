// PATH: app/api/sessions/upsert/route.ts
import { NextResponse } from "next/server";
import { getSupabaseServiceRoleClient } from "@/lib/supabase/server";
import { requireLeader } from "@/lib/authz/apiAuth";

const S = (v: any) => String(v ?? "").trim();

export async function POST(req: Request) {
  try {
    const auth = await requireLeader(req);
    if (!auth.ok) return auth.response;

    const supabase = getSupabaseServiceRoleClient();
    if (!supabase) {
      return NextResponse.json(
        { error: "Service role client mangler (SUPABASE_SERVICE_ROLE_KEY er ikke satt på Vercel)." },
        { status: 500 }
      );
    }

    const body = await req.json().catch(() => ({}));
    const id = S(body.id);
    const activity_id = S(body.activity_id);
    const title = S(body.title) || "Økt";
    const start_at = S(body.start_at);
    const end_at = S(body.end_at) || start_at;
    const location = S(body.location) || null;
    const note = S(body.note) || null;
    const targets = Array.isArray(body.targets) ? body.targets.map(S).filter(Boolean) : [];

    if (!activity_id || !start_at) {
      return NextResponse.json({ error: "Missing activity_id or start_at" }, { status: 400 });
    }

    // Upsert session
    let sessionId = id;

    if (sessionId) {
      const { error } = await supabase
        .from("activity_sessions")
        .update({ title, start_at, end_at, location, note })
        .eq("id", sessionId);

      if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    } else {
      const { data, error } = await supabase
        .from("activity_sessions")
        .insert({ activity_id, title, start_at, end_at, location, note })
        .select("id")
        .single();

      if (error) return NextResponse.json({ error: error.message }, { status: 500 });
      sessionId = S(data?.id);
    }

    // Replace targets
    const { error: delErr } = await supabase
      .from("activity_session_targets")
      .delete()
      .eq("session_id", sessionId);

    if (delErr) return NextResponse.json({ error: delErr.message }, { status: 500 });

    if (targets.length) {
      const { error: insErr } = await supabase
        .from("activity_session_targets")
        .insert(targets.map((member_id: string) => ({ session_id: sessionId, member_id })));

      if (insErr) return NextResponse.json({ error: insErr.message }, { status: 500 });
    }

    return NextResponse.json({ ok: true, id: sessionId });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || "Unknown error" }, { status: 500 });
  }
}
