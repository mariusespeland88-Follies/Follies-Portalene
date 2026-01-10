// PATH: app/(protected)/activities/[id]/SessionsPanel.client.tsx
"use client";

import { useEffect, useMemo, useState } from "react";

type AnyObj = Record<string, any>;

interface Props {
  activityId: string;
  activityName: string;
  sessions: AnyObj[];
  setSessions: (s: AnyObj[]) => void;
  participants: AnyObj[];
  leaders: AnyObj[];
  enrolledIds: string[];
}

const CAL_LS = "follies.calendar.v1";
const SESS_LS = "follies.activitySessions.v1";

const safeJSON = <T,>(s: string | null): T | null => {
  try {
    return s ? (JSON.parse(s) as T) : null;
  } catch {
    return null;
  }
};

const S = (v: any) => String(v ?? "");

type SessionDraft = {
  id?: string;
  title: string;
  date: string; // YYYY-MM-DD
  startTime: string; // HH:MM
  endTime: string; // HH:MM
  location: string;
  note: string;
};

const emptyDraft: SessionDraft = {
  title: "",
  date: "",
  startTime: "",
  endTime: "",
  location: "",
  note: "",
};

function lsLoadSessions(activityId: string): AnyObj[] {
  if (typeof window === "undefined") return [];
  const raw = safeJSON<Record<string, AnyObj[]>>(localStorage.getItem(SESS_LS));
  if (!raw) return [];
  return raw[activityId] ?? [];
}

function lsSaveSessions(activityId: string, list: AnyObj[]) {
  if (typeof window === "undefined") return;
  const raw =
    safeJSON<Record<string, AnyObj[]>>(localStorage.getItem(SESS_LS)) ?? {};
  raw[activityId] = list;
  localStorage.setItem(SESS_LS, JSON.stringify(raw));
}

/**
 * Speil økter inn i kalender-LS (samme format som kalenderen din bruker: array)
 * Vi gjør dette "best effort".
 */
function mirrorSessionsToCalendar(activityId: string, activityName: string, list: AnyObj[]) {
  if (typeof window === "undefined") return;

  const existing = safeJSON<any[]>(localStorage.getItem(CAL_LS)) ?? [];

  // Fjern gamle session-events for denne aktiviteten
  const keep = existing.filter((e) => {
    const src = String(e?.source ?? "");
    const aid = String(e?.activity_id ?? "");
    if (src === "session" && aid === String(activityId)) return false;
    return true;
  });

  const next = [...keep];

  for (const s of list) {
    const sid = S(s.id);
    const title = S(s.title) || "Økt";
    const start = S(s.start_at ?? s.start ?? "");
    const end = S(s.end_at ?? s.end ?? start);
    const targets = Array.isArray(s.targets) ? s.targets.map(S) : [];

    for (const mid of targets) {
      next.unshift({
        id: crypto.randomUUID(),
        member_id: mid,
        title: `${activityName}: ${title}`,
        start,
        end,
        source: "session",
        activity_id: activityId,
        session_id: sid,
      });
    }
  }

  localStorage.setItem(CAL_LS, JSON.stringify(next));
}

/* -------------------- API helpers (bruker din eksisterende struktur) -------------------- */

async function apiList(activityId: string): Promise<AnyObj[]> {
  const res = await fetch(`/api/sessions/list?activityId=${encodeURIComponent(activityId)}`, {
    cache: "no-store",
  });

  const json = await res.json().catch(() => null);

  if (!res.ok) {
    const msg = (json as any)?.error || res.statusText || "Kunne ikke hente økter";
    throw new Error(String(msg));
  }

  // støtte både {sessions:[...]} og bare [...]
  const list = Array.isArray(json) ? json : Array.isArray((json as any)?.sessions) ? (json as any).sessions : [];
  return Array.isArray(list) ? list : [];
}

async function apiUpsert(payload: AnyObj): Promise<void> {
  const res = await fetch(`/api/sessions/upsert`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });

  const json = await res.json().catch(() => null);
  if (!res.ok) {
    const msg = (json as any)?.error || res.statusText || "Kunne ikke lagre økt";
    throw new Error(String(msg));
  }
}

async function apiDelete(id: string): Promise<void> {
  const res = await fetch(`/api/sessions/delete`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ id }),
  });

  const json = await res.json().catch(() => null);
  if (!res.ok) {
    const msg = (json as any)?.error || res.statusText || "Kunne ikke slette økt";
    throw new Error(String(msg));
  }
}

/* -------------------- Component -------------------- */

export default function SessionsPanel(props: Props) {
  const { activityId, activityName, sessions, setSessions } = props;

  const [draft, setDraft] = useState<SessionDraft>(emptyDraft);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);

  const resetDraft = () => {
    setDraft(emptyDraft);
    setEditingId(null);
  };

  // Hent økter DB-first via /api/sessions/list
  useEffect(() => {
    let alive = true;

    (async () => {
      setLoading(true);
      try {
        const list = await apiList(activityId);
        if (!alive) return;
        setSessions(list);
        lsSaveSessions(activityId, list);
        mirrorSessionsToCalendar(activityId, activityName, list);
      } catch {
        // fallback: LS
        const fromLs = lsLoadSessions(activityId);
        if (!alive) return;
        setSessions(fromLs);
        mirrorSessionsToCalendar(activityId, activityName, fromLs);
      } finally {
        if (alive) setLoading(false);
      }
    })();

    return () => {
      alive = false;
    };
  }, [activityId, activityName, setSessions]);

  const handleEdit = (session: AnyObj) => {
    // Støtter både gamle og nye feltnavn
    const startISO = S(session.start_at ?? session.start ?? "");
    const endISO = S(session.end_at ?? session.end ?? "");

    const start = startISO ? new Date(startISO) : null;
    const end = endISO ? new Date(endISO) : null;

    const yyyy = start ? start.getFullYear() : "";
    const mm = start ? String(start.getMonth() + 1).padStart(2, "0") : "";
    const dd = start ? String(start.getDate()).padStart(2, "0") : "";
    const date = start ? `${yyyy}-${mm}-${dd}` : "";

    const st = start ? `${String(start.getHours()).padStart(2, "0")}:${String(start.getMinutes()).padStart(2, "0")}` : "";
    const et = end ? `${String(end.getHours()).padStart(2, "0")}:${String(end.getMinutes()).padStart(2, "0")}` : "";

    setDraft({
      id: session.id,
      title: session.title ?? "",
      date,
      startTime: st,
      endTime: et,
      location: session.location ?? "",
      note: session.note ?? "",
    });
    setEditingId(String(session.id));
  };

  const handleSave = async () => {
    if (!draft.date || !draft.startTime) {
      alert("Dato og starttid må fylles ut.");
      return;
    }

    const startISO = new Date(`${draft.date}T${draft.startTime}:00`).toISOString();
    const endISO = draft.endTime
      ? new Date(`${draft.date}T${draft.endTime}:00`).toISOString()
      : startISO;

    // IMPORTANT: Vi bruker den nye DB-strukturen (activity_sessions)
    // og lar server-route gjøre det riktige.
    const payload = {
      id: editingId || undefined,
      activity_id: activityId,
      title: draft.title || "Økt",
      start_at: startISO,
      end_at: endISO,
      location: draft.location || null,
      note: draft.note || null,

      // targets: Hvis deres upsert-route støtter targets, sender vi den.
      // Hvis ikke, ignorerer den bare feltet (trygt).
      targets: Array.isArray(props.enrolledIds) ? props.enrolledIds : [],
    };

    setBusy("save");
    try {
      await apiUpsert(payload);

      const list = await apiList(activityId);
      setSessions(list);
      lsSaveSessions(activityId, list);
      mirrorSessionsToCalendar(activityId, activityName, list);

      resetDraft();
    } catch (e: any) {
      alert(e?.message || "Kunne ikke lagre økt i databasen.");
    } finally {
      setBusy(null);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Er du sikker på at du vil slette denne økten?")) return;

    setBusy(id);
    try {
      await apiDelete(id);

      const list = await apiList(activityId);
      setSessions(list);
      lsSaveSessions(activityId, list);
      mirrorSessionsToCalendar(activityId, activityName, list);

      if (editingId === id) resetDraft();
    } catch (e: any) {
      alert(e?.message || "Kunne ikke slette økt i databasen.");
    } finally {
      setBusy(null);
    }
  };

  const prettyTime = (iso: string) => {
    try {
      return new Date(iso).toLocaleTimeString("nb-NO", { hour: "2-digit", minute: "2-digit" });
    } catch {
      return iso;
    }
  };

  const prettyDateTime = (iso: string) => {
    try {
      return new Date(iso).toLocaleString("nb-NO");
    } catch {
      return iso;
    }
  };

  const normalizedSessions = useMemo(() => {
    // Støtt både start_at/end_at og start/end
    return (sessions || []).map((s) => ({
      ...s,
      start_at: S(s.start_at ?? s.start ?? ""),
      end_at: S(s.end_at ?? s.end ?? s.start_at ?? s.start ?? ""),
    }));
  }, [sessions]);

  return (
    <div className="space-y-6">
      {/* Info / status (DESIGN uendret fra din fil, men tekst oppdatert) */}
      <div className="rounded-xl border border-neutral-800 bg-neutral-950/60 p-4 text-sm text-neutral-200">
        <p className="font-semibold mb-1">Økter for denne aktiviteten</p>
        <p className="text-neutral-400">
          Økter hentes nå fra databasen (Supabase) via /api/sessions/list. Hvis databasen ikke svarer, brukes lokal fallback.
        </p>
        {loading && (
          <p className="mt-2 text-xs text-yellow-400">Laster økter…</p>
        )}
      </div>

      {/* Liste over økter */}
      <div className="rounded-xl border border-neutral-800 bg-neutral-950/60 p-4">
        <h2 className="mb-3 text-base font-semibold text-neutral-100">
          Planlagte økter
        </h2>

        {normalizedSessions.length === 0 ? (
          <p className="text-sm text-neutral-400">
            Ingen økter registrert ennå.
          </p>
        ) : (
          <div className="space-y-3">
            {normalizedSessions.map((s) => (
              <div
                key={String(s.id ?? `${s.start_at}-${s.title}`)}
                className="flex flex-col gap-2 rounded-lg border border-neutral-800 bg-neutral-900/60 p-3 md:flex-row md:items-center md:justify-between"
              >
                <div className="space-y-1">
                  <div className="text-sm font-semibold text-neutral-100">
                    {s.title || "Økt"}
                  </div>
                  <div className="text-xs text-neutral-300">
                    {s.start_at ? prettyDateTime(s.start_at) : "Ukjent tidspunkt"}
                    {s.end_at ? ` – ${prettyTime(s.end_at)}` : null}
                  </div>
                  {(s.location || s.note) && (
                    <div className="text-xs text-neutral-400">
                      {s.location ? <span>Sted: {s.location}. </span> : null}
                      {s.note ? <span>Notat: {s.note}</span> : null}
                    </div>
                  )}
                </div>

                <div className="flex flex-wrap gap-2 text-xs">
                  <button
                    type="button"
                    onClick={() => handleEdit(s)}
                    className="rounded-full border border-neutral-600 px-3 py-1 hover:border-red-500 hover:text-red-300"
                    disabled={!!busy}
                  >
                    Rediger
                  </button>
                  <button
                    type="button"
                    onClick={() => handleDelete(String(s.id))}
                    className="rounded-full border border-neutral-700 px-3 py-1 text-red-300 hover:border-red-600 hover:bg-red-900/30 disabled:opacity-60"
                    disabled={busy === String(s.id) || busy === "save"}
                  >
                    {busy === String(s.id) ? "Sletter…" : "Slett"}
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Skjema for ny / redigert økt (DESIGN uendret) */}
      <div className="rounded-xl border border-neutral-800 bg-neutral-950/60 p-4">
        <h2 className="mb-3 text-base font-semibold text-neutral-100">
          {editingId ? "Rediger økt" : "Ny økt"}
        </h2>

        <div className="grid gap-3 md:grid-cols-2">
          <div className="space-y-1">
            <label className="text-xs font-medium text-neutral-300">Tittel</label>
            <input
              className="w-full rounded-md border border-neutral-700 bg-neutral-900 px-2 py-1 text-sm text-neutral-100 outline-none focus:border-red-500"
              value={draft.title}
              onChange={(e) => setDraft((d) => ({ ...d, title: e.target.value }))}
              placeholder="F.eks. Prøve, gjennomgang, forestilling ..."
            />
          </div>

          <div className="space-y-1">
            <label className="text-xs font-medium text-neutral-300">Dato</label>
            <input
              type="date"
              className="w-full rounded-md border border-neutral-700 bg-neutral-900 px-2 py-1 text-sm text-neutral-100 outline-none focus:border-red-500"
              value={draft.date}
              onChange={(e) => setDraft((d) => ({ ...d, date: e.target.value }))}
            />
          </div>

          <div className="space-y-1">
            <label className="text-xs font-medium text-neutral-300">Starttid</label>
            <input
              type="time"
              className="w-full rounded-md border border-neutral-700 bg-neutral-900 px-2 py-1 text-sm text-neutral-100 outline-none focus:border-red-500"
              value={draft.startTime}
              onChange={(e) => setDraft((d) => ({ ...d, startTime: e.target.value }))}
            />
          </div>

          <div className="space-y-1">
            <label className="text-xs font-medium text-neutral-300">Sluttid (valgfritt)</label>
            <input
              type="time"
              className="w-full rounded-md border border-neutral-700 bg-neutral-900 px-2 py-1 text-sm text-neutral-100 outline-none focus:border-red-500"
              value={draft.endTime}
              onChange={(e) => setDraft((d) => ({ ...d, endTime: e.target.value }))}
            />
          </div>

          <div className="space-y-1">
            <label className="text-xs font-medium text-neutral-300">Sted (valgfritt)</label>
            <input
              className="w-full rounded-md border border-neutral-700 bg-neutral-900 px-2 py-1 text-sm text-neutral-100 outline-none focus:border-red-500"
              value={draft.location}
              onChange={(e) => setDraft((d) => ({ ...d, location: e.target.value }))}
              placeholder="F.eks. Follies, sal 1"
            />
          </div>

          <div className="space-y-1 md:col-span-2">
            <label className="text-xs font-medium text-neutral-300">Notat (valgfritt)</label>
            <textarea
              className="w-full rounded-md border border-neutral-700 bg-neutral-900 px-2 py-1 text-sm text-neutral-100 outline-none focus:border-red-500"
              rows={3}
              value={draft.note}
              onChange={(e) => setDraft((d) => ({ ...d, note: e.target.value }))}
              placeholder="Ekstra info til deg selv/lederne."
            />
          </div>
        </div>

        <div className="mt-4 flex flex-wrap gap-2">
          <button
            type="button"
            onClick={handleSave}
            disabled={busy === "save"}
            className="rounded-full bg-red-600 px-4 py-1.5 text-sm font-semibold text-white hover:bg-red-500 disabled:opacity-60"
          >
            {busy === "save" ? "Lagrer…" : editingId ? "Lagre endringer" : "Legg til økt"}
          </button>

          {editingId && (
            <button
              type="button"
              onClick={resetDraft}
              className="rounded-full border border-neutral-600 px-4 py-1.5 text-sm text-neutral-200 hover:border-red-500 hover:text-red-300"
            >
              Avbryt redigering
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
