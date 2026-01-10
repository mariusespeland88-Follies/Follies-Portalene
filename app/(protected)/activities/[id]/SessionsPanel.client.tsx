// PATH: app/(protected)/activities/[id]/SessionsPanel.client.tsx
"use client";

import { useEffect, useMemo, useState } from "react";

type AnyObj = Record<string, any>;
type SessionItem = {
  id: string;
  activity_id: string;
  title: string;
  start_at: string;
  end_at: string;
  location?: string | null;
  note?: string | null;
  targets?: string[];
};

interface Props {
  activityId: string;
  activityName: string;
  sessions: AnyObj[];
  setSessions: (s: AnyObj[]) => void;
  participants: AnyObj[];
  leaders: AnyObj[];
  enrolledIds: string[];
}

const S = (v: any) => String(v ?? "");

async function apiList(activityId: string): Promise<SessionItem[]> {
  const res = await fetch(`/api/sessions/list?activityId=${encodeURIComponent(activityId)}`, { cache: "no-store" });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(String((json as any)?.error || "Kunne ikke hente økter"));
  const list = Array.isArray((json as any)?.sessions) ? (json as any).sessions : [];
  return list as SessionItem[];
}

export default function SessionsPanel({ activityId, sessions, setSessions }: Props) {
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    (async () => {
      setLoading(true);
      setErr(null);
      try {
        const list = await apiList(activityId);
        if (!alive) return;
        setSessions(list as any);
      } catch (e: any) {
        if (!alive) return;
        setErr(e?.message || "Kunne ikke hente økter.");
        setSessions([]);
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => { alive = false; };
  }, [activityId, setSessions]);

  const normalized: SessionItem[] = useMemo(() => {
    return (sessions || []).map((s: any) => ({
      id: S(s.id),
      activity_id: S(s.activity_id ?? activityId),
      title: S(s.title) || "Økt",
      start_at: S(s.start_at),
      end_at: S(s.end_at || s.start_at),
      location: s.location ?? "",
      note: s.note ?? "",
      targets: Array.isArray(s.targets) ? s.targets : [],
    })).filter((x) => x.id && x.start_at);
  }, [sessions, activityId]);

  if (loading) return <div className="text-neutral-300">Laster økter…</div>;

  return (
    <div className="space-y-4">
      {err ? (
        <div className="rounded-lg border border-red-500/40 bg-red-950/30 px-4 py-3 text-red-200 text-sm">
          {err}
        </div>
      ) : null}

      {normalized.length === 0 ? (
        <div className="text-neutral-400">Ingen økter.</div>
      ) : (
        <ul className="space-y-2">
          {normalized.map((s) => (
            <li key={s.id} className="rounded-lg border border-white/10 bg-black/40 p-3">
              <div className="font-medium text-white">{s.title}</div>
              <div className="text-sm text-neutral-300">
                {new Date(s.start_at).toLocaleString("nb-NO")} – {new Date(s.end_at).toLocaleTimeString("nb-NO")}
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
