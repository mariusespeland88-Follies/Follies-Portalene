// PATH: lib/activitySessionsClient.ts
"use client";

import { createClientComponentClient } from "@/lib/supabase/browser";

export type ActivitySessionRow = {
  id: string;
  activity_id: string;
  title: string;
  start_at: string;
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
  targets: string[];
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

/**
 * DB-first via server-route (service role) → så portalen får samme sessions som finnes i DB
 * selv om RLS på klienten begrenser SELECT.
 */
export async function fetchActivitySessions(activityId: string): Promise<ActivitySession[]> {
  const res = await fetch(`/api/activity-sessions?activityId=${encodeURIComponent(activityId)}`, {
    cache: "no-store",
  });

  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(json?.error || "Kunne ikke hente økter");

  const list = Array.isArray(json?.sessions) ? (json.sessions as any[]) : [];
  return list.map((r) => {
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
      targets: Array.isArray(r.targets) ? r.targets.map(toStr) : [],
    };
  });
}

/* --- resten er uendret (create/update/delete går fortsatt direkte via client) --- */

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

export async function updateActivitySession(sessionId: string, patch: Omit<ActivitySession, "id">): Promise<void> {
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
