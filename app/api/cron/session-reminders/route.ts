import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { requireLeader } from "@/lib/authz/apiAuth";
import { sendPushToMembers } from "@/lib/push/memberPush";

export const runtime = "nodejs";

type SessionRow = {
  id: string;
  activity_id: string;
  title: string | null;
  start_at: string;
  location: string | null;
};

function createServiceClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("Mangler SUPABASE env");
  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

function isCronAuthorized(req: Request): boolean {
  const secret = String(process.env.CRON_SECRET ?? "").trim();
  if (!secret) return false;
  const auth = String(req.headers.get("authorization") ?? "").trim();
  return auth === `Bearer ${secret}`;
}

function uniq(values: string[]) {
  return Array.from(new Set(values.filter(Boolean)));
}

function osloDateKey(date: Date): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Oslo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}

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

async function handle(req: Request) {
  if (!isCronAuthorized(req)) {
    const auth = await requireLeader(req);
    if (!auth.ok) return auth.response;
  }

  const db = createServiceClient();

  const now = new Date();
  const max = new Date(now.getTime() + 72 * 60 * 60 * 1000);
  const tomorrowKey = osloDateKey(new Date(now.getTime() + 24 * 60 * 60 * 1000));

  const { data: rows, error } = await db
    .from("activity_sessions")
    .select("id, activity_id, title, start_at, location")
    .gte("start_at", now.toISOString())
    .lt("start_at", max.toISOString())
    .order("start_at", { ascending: true });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const sessions = ((rows || []) as any[])
    .map(
      (r): SessionRow => ({
        id: String(r?.id ?? ""),
        activity_id: String(r?.activity_id ?? ""),
        title: r?.title ? String(r.title) : null,
        start_at: String(r?.start_at ?? ""),
        location: r?.location ? String(r.location) : null,
      })
    )
    .filter((s) => s.id && s.activity_id && s.start_at)
    .filter((s) => osloDateKey(new Date(s.start_at)) === tomorrowKey);

  if (!sessions.length) {
    return NextResponse.json({ ok: true, sessions: 0, sent: 0, failed: 0, tokens: 0 });
  }

  const sessionIds = sessions.map((s) => s.id);
  const activityIds = uniq(sessions.map((s) => s.activity_id));

  const [{ data: targetRows }, { data: activityRows }, { data: loggedRows }] =
    await Promise.all([
      db
        .from("activity_session_targets")
        .select("session_id, member_id")
        .in("session_id", sessionIds),
      db.from("activities").select("id, title, name").in("id", activityIds),
      db
        .from("session_push_events")
        .select("session_id, member_id")
        .eq("kind", "day_before")
        .in("session_id", sessionIds),
    ]);

  const targetsBySession = new Map<string, string[]>();
  for (const row of (targetRows || []) as any[]) {
    const sid = String(row?.session_id ?? "").trim();
    const mid = String(row?.member_id ?? "").trim();
    if (!sid || !mid) continue;
    if (!targetsBySession.has(sid)) targetsBySession.set(sid, []);
    targetsBySession.get(sid)!.push(mid);
  }

  const activityNameById = new Map<string, string>();
  for (const row of (activityRows || []) as any[]) {
    const id = String(row?.id ?? "").trim();
    if (!id) continue;
    const name = String(row?.title ?? row?.name ?? "").trim() || "Follies";
    activityNameById.set(id, name);
  }

  const alreadyLogged = new Set<string>();
  for (const row of (loggedRows || []) as any[]) {
    const sid = String(row?.session_id ?? "").trim();
    const mid = String(row?.member_id ?? "").trim();
    if (sid && mid) alreadyLogged.add(`${sid}:${mid}`);
  }

  let sent = 0;
  let failed = 0;
  let tokens = 0;
  let touchedSessions = 0;

  for (const session of sessions) {
    const memberIds = uniq(targetsBySession.get(session.id) || []).filter(
      (mid) => !alreadyLogged.has(`${session.id}:${mid}`)
    );
    if (!memberIds.length) continue;

    const activityName = activityNameById.get(session.activity_id) || "Follies";
    const title = `Påminnelse: ${activityName}`;
    const body = `${session.title || "Øving"} • ${fmtOslo(session.start_at)}${
      session.location ? ` • ${session.location}` : ""
    }`;

    const result = await sendPushToMembers(db, {
      memberIds,
      title,
      body,
      data: {
        type: "session_day_before",
        sessionId: session.id,
        activityId: session.activity_id,
      },
      channelId: "messages",
    });

    sent += result.sent;
    failed += result.failed;
    tokens += result.tokens;
    touchedSessions += 1;

    await db.from("session_push_events").upsert(
      memberIds.map((memberId) => ({
        session_id: session.id,
        member_id: memberId,
        kind: "day_before",
      })),
      { onConflict: "session_id,member_id,kind" }
    );
  }

  return NextResponse.json({
    ok: true,
    sessions: touchedSessions,
    sent,
    failed,
    tokens,
  });
}

export async function GET(req: Request) {
  try {
    return await handle(req);
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || "Ukjent feil" }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    return await handle(req);
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || "Ukjent feil" }, { status: 500 });
  }
}
