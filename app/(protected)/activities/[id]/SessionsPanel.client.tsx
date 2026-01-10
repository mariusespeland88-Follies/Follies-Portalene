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

type Draft = {
  title: string;
  date: string;
  startTime: string;
  endTime: string;
  location: string;
  note: string;
};
const emptyDraft: Draft = { title: "", date: "", startTime: "", endTime: "", location: "", note: "" };

async function apiList(activityId: string): Promise<SessionItem[]> {
  const res = await fetch(`/api/sessions/list?activityId=${encodeURIComponent(activityId)}`, { cache: "no-store" });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(String((json as any)?.error || "Kunne ikke hente økter"));
  const list = Array.isArray((json as any)?.sessions) ? (json as any).sessions : [];
  return list as SessionItem[];
}

async function apiUpsert(payload: AnyObj): Promise<void> {
  const res = await fetch(`/api/sessions/upsert`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(String((json as any)?.error || "Kunne ikke lagre økt"));
}

async function apiDelete(id: string): Promise<void> {
  const res = await fetch(`/api/sessions/delete`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ id }),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(String((json as any)?.error || "Kunne ikke slette økt"));
}

function toISO(date: string, time: string) {
  return new Date(`${date}T${time}:00`).toISOString();
}

export default function SessionsPanel({ activityId, activityName, sessions, setSessions, enrolledIds }: Props) {
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draft, setDraft] = useState<Draft>(emptyDraft);

  async function refresh() {
    setErr(null);
    const list = await apiList(activityId);
    setSessions(list as any);
  }

  useEffect(() => {
    let alive = true;
    (async () => {
      setLoading(true);
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
    })).filter((s: any) => s.id && s.start_at);
  }, [sessions, activityId]);

  function reset() { setDraft(emptyDraft); setEditingId(null); }

  function edit(s: SessionItem) {
    const st = new Date(s.start_at);
    const en = new Date(s.end_at || s.start_at);

    const yyyy = st.getFullYear();
    const mm = String(st.getMonth() + 1).padStart(2, "0");
    const dd = String(st.getDate()).padStart(2, "0");
    const date = `${yyyy}-${mm}-${dd}`;

    const stt = `${String(st.getHours()).padStart(2, "0")}:${String(st.getMinutes()).padStart(2, "0")}`;
    const ett = `${String(en.getHours()).padStart(2, "0")}:${String(en.getMinutes()).padStart(2, "0")}`;

    setDraft({
      title: s.title || "Økt",
      date,
      startTime: stt,
      endTime: ett,
      location: S(s.location),
      note: S(s.note),
    });
    setEditingId(s.id);
  }

  async function save() {
    if (!draft.date || !draft.startTime) { alert("Dato og starttid må fylles ut."); return; }
    setBusy("save");
    setErr(null);
    try {
      const payload = {
        id: editingId || undefined,
        activity_id: activityId,
        title: draft.title || "Økt",
        start_at: toISO(draft.date, draft.startTime),
        end_at: draft.endTime ? toISO(draft.date, draft.endTime) : toISO(draft.date, draft.startTime),
        location: draft.location || null,
        note: draft.note || null,
        targets: Array.isArray(enrolledIds) ? enrolledIds : [],
      };
      await apiUpsert(payload);
      await refresh();
      reset();
    } catch (e: any) {
      setErr(e?.message || "Kunne ikke lagre økt.");
    } finally {
      setBusy(null);
    }
  }

  async function remove(id: string) {
    if (!confirm("Er du sikker på at du vil slette denne økten?")) return;
    setBusy(id);
    setErr(null);
    try {
      await apiDelete(id);
      await refresh();
      if (editingId === id) reset();
    } catch (e: any) {
      setErr(e?.message || "Kunne ikke slette økt.");
    } finally {
      setBusy(null);
    }
  }

  if (loading) {
    return <div className="text-neutral-300">Laster økter…</div>;
  }

  return (
    <div className="space-y-6">
      {err ? (
        <div className="rounded-lg border border-red-500/40 bg-red-950/30 px-4 py-3 text-red-200 text-sm">
          {err}
          <div className="mt-2 text-red-200/80 text-xs">
            (Dette skjer ofte hvis Vercel mangler SUPABASE_SERVICE_ROLE_KEY.)
          </div>
        </div>
      ) : null}

      <div className="rounded-xl border border-white/10 p-4 bg-black/40">
        <h3 className="font-semibold mb-3">Planlagte økter</h3>

        {normalized.length === 0 ? (
          <div className="text-neutral-400">Ingen økter.</div>
        ) : (
          <ul className="space-y-2">
            {normalized.map((s) => (
              <li key={s.id} className="flex items-center justify-between rounded-lg border border-white/10 p-3">
                <div>
                  <div className="font-medium">{s.title}</div>
                  <div className="text-sm text-neutral-400">
                    {new Date(s.start_at).toLocaleString("nb-NO")} – {new Date(s.end_at).toLocaleTimeString("nb-NO")}
                  </div>
                </div>
                <div className="flex gap-2">
                  <button onClick={() => edit(s)} className="rounded-full border border-neutral-600 px-3 py-1 text-sm hover:border-red-500">
                    Rediger
                  </button>
                  <button
                    onClick={() => remove(s.id)}
                    disabled={busy === s.id}
                    className="rounded-full border border-neutral-700 px-3 py-1 text-sm text-red-300 hover:border-red-600 disabled:opacity-60"
                  >
                    {busy === s.id ? "Sletter…" : "Slett"}
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="rounded-xl border border-white/10 p-4 bg-black/40">
        <h3 className="font-semibold mb-3">{editingId ? "Rediger økt" : "Ny økt"}</h3>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm text-neutral-300 mb-1">Tittel</label>
            <input
              value={draft.title}
              onChange={(e) => setDraft((d) => ({ ...d, title: e.target.value }))}
              className="w-full rounded-xl bg-neutral-800 text-white px-3 py-2 border border-white/10 focus:border-red-500"
              placeholder="Øving – Scene 3"
            />
          </div>
          <div>
            <label className="block text-sm text-neutral-300 mb-1">Dato</label>
            <input
              type="date"
              value={draft.date}
              onChange={(e) => setDraft((d) => ({ ...d, date: e.target.value }))}
              className="w-full rounded-xl bg-neutral-800 text-white px-3 py-2 border border-white/10 focus:border-red-500"
            />
          </div>
          <div>
            <label className="block text-sm text-neutral-300 mb-1">Tid (start)</label>
            <input
              type="time"
              value={draft.startTime}
              onChange={(e) => setDraft((d) => ({ ...d, startTime: e.target.value }))}
              className="w-full rounded-xl bg-neutral-800 text-white px-3 py-2 border border-white/10 focus:border-red-500"
            />
          </div>
          <div>
            <label className="block text-sm text-neutral-300 mb-1">Tid (slutt)</label>
            <input
              type="time"
              value={draft.endTime}
              onChange={(e) => setDraft((d) => ({ ...d, endTime: e.target.value }))}
              className="w-full rounded-xl bg-neutral-800 text-white px-3 py-2 border border-white/10 focus:border-red-500"
            />
          </div>
          <div className="md:col-span-2">
            <label className="block text-sm text-neutral-300 mb-1">Sted</label>
            <input
              value={draft.location}
              onChange={(e) => setDraft((d) => ({ ...d, location: e.target.value }))}
              className="w-full rounded-xl bg-neutral-800 text-white px-3 py-2 border border-white/10 focus:border-red-500"
              placeholder="Metro Storsal"
            />
          </div>
          <div className="md:col-span-2">
            <label className="block text-sm text-neutral-300 mb-1">Notat</label>
            <textarea
              value={draft.note}
              onChange={(e) => setDraft((d) => ({ ...d, note: e.target.value }))}
              className="w-full rounded-xl bg-neutral-800 text-white px-3 py-2 border border-white/10 focus:border-red-500"
              rows={3}
            />
          </div>
        </div>

        <div className="mt-4 flex gap-2">
          <button
            onClick={save}
            disabled={busy === "save"}
            className="rounded-xl bg-red-600 hover:bg-red-700 px-4 py-2 font-semibold disabled:opacity-60"
          >
            {busy === "save" ? "Lagrer…" : editingId ? "Lagre" : "Legg til"}
          </button>
          {editingId ? (
            <button
              onClick={reset}
              className="rounded-xl border border-white/20 px-4 py-2 font-semibold hover:bg-white/10"
            >
              Avbryt
            </button>
          ) : null}
        </div>
      </div>
    </div>
  );
}
