// PATH: lib/activitySessionsClient.ts
"use client";

import { createClientComponentClient } from "@/lib/supabase/browser";

export type ActivitySessionRow = {
  id: string;
  activity_id: string;
  title: string;
  start_at: string; // timestamptz -> ISO string
  end_at: string | null;
  location: string | null;
  note: string | null;
  created_at?: string | null;
};

export type ActivitySession = {
  id: string;
  activity_id: string;
  title: string;
  start_at: string;
  end_at: string;
  location: string;
  note: string;
  targets: string[]; // member_id[]
};

function toStr(v: any): string {
  return v == null ? "" : String(v);
}

function safeISO(v: any, fallback: string): string {
  const s = toStr(v).trim();
  if (!s) return fallback;
  const d = new Date(s);
  return Number.isNaN(+d) ? fallback : d.toISOString();
}

export async function fetchActivitySessions(activityId: string): Promise<ActivitySession[]> {
  const supabase = createClientComponentClient();

  const { data: rows, error } = await supabase
    .from("activity_sessions")
    .select("id, activity_id, title, start_at, end_at, location, note, created_at")
    .eq("activity_id", activityId)
    .order("start_at", { ascending: true });

  if (error) throw error;

  const base: ActivitySessionRow[] = Array.isArray(rows) ? (rows as any[]) : [];
  const sessionIds = base.map((r) => toStr(r.id)).filter(Boolean);

  // Targets i én query
  let targetsBySession: Record<string, string[]> = {};
  if (sessionIds.length > 0) {
    const { data: trows, error: terr } = await supabase
      .from("activity_session_targets")
      .select("session_id, member_id")
      .in("session_id", sessionIds);

    if (terr) throw terr;

    targetsBySession = {};
    for (const tr of (trows as any[]) ?? []) {
      const sid = toStr(tr.session_id);
      const mid = toStr(tr.member_id);
      if (!sid || !mid) continue;
      (targetsBySession[sid] ||= []).push(mid);
    }
  }

  return base.map((r) => {
    const startISO = safeISO(r.start_at, new Date().toISOString());
    const endISO = safeISO(r.end_at, startISO);

    return {
      id: toStr(r.id),
      activity_id: toStr(r.activity_id),
      title: toStr(r.title) || "Økt",
      start_at: startISO,
      end_at: endISO,
      location: toStr(r.location),
      note: toStr(r.note),
      targets: Array.from(new Set(targetsBySession[toStr(r.id)] || [])),
    };
  });
}

export async function createActivitySession(input: Omit<ActivitySession, "id">): Promise<ActivitySession> {
  const supabase = createClientComponentClient();

  const { data, error } = await supabase
    .from("activity_sessions")
    .insert({
      activity_id: input.activity_id,
      title: input.title,
      start_at: input.start_at,
      end_at: input.end_at,
      location: input.location || null,
      note: input.note || null,
    })
    .select("id, activity_id, title, start_at, end_at, location, note, created_at")
    .single();

  if (error) throw error;
  const sessionId = toStr((data as any)?.id);

  // targets
  const targets = Array.from(new Set((input.targets || []).map(toStr).filter(Boolean)));
  if (targets.length > 0) {
    const { error: terr } = await supabase
      .from("activity_session_targets")
      .insert(targets.map((member_id) => ({ session_id: sessionId, member_id })));
    if (terr) throw terr;
  }

  return {
    id: sessionId,
    activity_id: toStr((data as any)?.activity_id),
    title: toStr((data as any)?.title) || input.title,
    start_at: safeISO((data as any)?.start_at, input.start_at),
    end_at: safeISO((data as any)?.end_at, input.end_at),
    location: toStr((data as any)?.location),
    note: toStr((data as any)?.note),
    targets,
  };
}

export async function updateActivitySession(
  sessionId: string,
  patch: Omit<ActivitySession, "id">
): Promise<void> {
  const supabase = createClientComponentClient();

  const { error } = await supabase
    .from("activity_sessions")
    .update({
      title: patch.title,
      start_at: patch.start_at,
      end_at: patch.end_at,
      location: patch.location || null,
      note: patch.note || null,
    })
    .eq("id", sessionId);

  if (error) throw error;

  // Replace targets (enklest og tryggest)
  const { error: delErr } = await supabase
    .from("activity_session_targets")
    .delete()
    .eq("session_id", sessionId);

  if (delErr) throw delErr;

  const targets = Array.from(new Set((patch.targets || []).map(toStr).filter(Boolean)));
  if (targets.length > 0) {
    const { error: insErr } = await supabase
      .from("activity_session_targets")
      .insert(targets.map((member_id) => ({ session_id: sessionId, member_id })));
    if (insErr) throw insErr;
  }
}

export async function deleteActivitySession(sessionId: string): Promise<void> {
  const supabase = createClientComponentClient();

  // targets først (FK)
  const { error: tdel } = await supabase
    .from("activity_session_targets")
    .delete()
    .eq("session_id", sessionId);
  if (tdel) throw tdel;

  const { error: sdel } = await supabase
    .from("activity_sessions")
    .delete()
    .eq("id", sessionId);
  if (sdel) throw sdel;
}
