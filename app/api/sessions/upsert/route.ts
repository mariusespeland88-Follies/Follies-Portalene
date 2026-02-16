// PATH: app/api/sessions/upsert/route.ts
import { NextResponse } from "next/server";
import { getSupabaseServiceRoleClient } from "@/lib/supabase/server";
import { requireLeader } from "@/lib/authz/apiAuth";
import { sendPushToMembers } from "@/lib/push/memberPush";

const S = (v: any) => String(v ?? "").trim();

function fmtOslo(dateIso: string): string {
  const d = new Date(dateIso);
  if (Number.isNaN(d.getTime())) return dateIso;
  return new Intl.DateTimeFormat("nb-NO", {
    timeZone: "Europe/Oslo",
    weekday: "short",
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(d);
}

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
    const isNew = !sessionId;

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

    // Push: ny eller oppdatert øving
    if (targets.length) {
      const { data: activityRow } = await supabase
        .from("activities")
        .select("id, title, name")
        .eq("id", activity_id)
        .maybeSingle();

      const activityName =
        S((activityRow as any)?.title) || S((activityRow as any)?.name) || "Follies";

      const pushTitle = isNew
        ? `Ny øving i ${activityName}`
        : `Øving oppdatert i ${activityName}`;
      const pushBody = `${title} • ${fmtOslo(start_at)}${location ? ` • ${location}` : ""}`;

      await sendPushToMembers(supabase as any, {
        memberIds: targets,
        title: pushTitle,
        body: pushBody,
        data: {
          type: isNew ? "session_created" : "session_updated",
          sessionId,
          activityId: activity_id,
        },
      }).catch(() => {});
    }

    return NextResponse.json({ ok: true, id: sessionId });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || "Unknown error" }, { status: 500 });
  }
}
