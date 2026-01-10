// PATH: app/(protected)/activities/[id]/SessionsPanel.client.tsx
"use client";

import { useEffect, useMemo, useState } from "react";
import {
  createActivitySession,
  deleteActivitySession,
  fetchActivitySessions,
  updateActivitySession,
  type ActivitySession,
} from "@/lib/activitySessionsClient";

type AnyObj = Record<string, any>;

interface Props {
  activityId: string;
  activityName: string;

  // Beholder props for kompatibilitet med eksisterende kall (ingen redesign / ingen refactor nødvendig)
  sessions?: AnyObj[];
  setSessions?: (s: AnyObj[]) => void;
  participants?: AnyObj[];
  leaders?: AnyObj[];
  enrolledIds?: string[];
}

const CAL_LS = "follies.calendar.v1";
const SESS_LS = "follies.activitySessions.v1"; // legacy fallback/cached map: { [activityId]: sessions[] }

const safeJSON = <T,>(s: string | null): T | null => {
  try {
    return s ? (JSON.parse(s) as T) : null;
  } catch {
    return null;
  }
};

function S(v: any) {
  return String(v ?? "");
}

type SessionDraft = {
  title: string;
  date: string; // YYYY-MM-DD
  startTime: string; // HH:mm
  endTime: string; // HH:mm
  location: string;
  note: string;
  audience: "all" | "custom";
  selected: Record<string, boolean>; // memberId -> true
};

const emptyDraft: SessionDraft = {
  title: "",
  date: "",
  startTime: "",
  endTime: "",
  location: "",
  note: "",
  audience: "all",
  selected: {},
};

function toDateParts(iso: string) {
  const d = new Date(iso);
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  const hh = String(d.getHours()).padStart(2, "0");
  const mi = String(d.getMinutes()).padStart(2, "0");
  return { date: `${yyyy}-${mm}-${dd}`, time: `${hh}:${mi}` };
}

function buildISO(date: string, time: string) {
  // NB: Dette lager en lokal tid og lagrer som ISO med timezone.
  // Det er bra – Supabase har timestamptz.
  return new Date(`${date}T${time}:00`).toISOString();
}

function lsLoadSessions(activityId: string): ActivitySession[] {
  const raw = safeJSON<Record<string, any[]>>(localStorage.getItem(SESS_LS)) ?? {};
  const list = raw[activityId] ?? [];
  // normaliser litt
  return (Array.isArray(list) ? list : []).map((x: any) => ({
    id: S(x.id),
    activity_id: S(x.activity_id ?? x.activityId ?? activityId),
    title: S(x.title) || "Økt",
    start_at: S(x.start_at ?? x.start ?? ""),
    end_at: S(x.end_at ?? x.end ?? ""),
    location: S(x.location ?? ""),
    note: S(x.note ?? ""),
    targets: Array.isArray(x.targets) ? x.targets.map(S) : [],
  }));
}

function lsSaveSessions(activityId: string, list: ActivitySession[]) {
  const raw = safeJSON<Record<string, any[]>>(localStorage.getItem(SESS_LS)) ?? {};
  raw[activityId] = list;
  localStorage.setItem(SESS_LS, JSON.stringify(raw));
}

/**
 * Speil økter til kalender-LS så eksisterende kalender (dashboard + kalender-side)
 * fortsatt viser økter uten redesign akkurat nå.
 *
 * Vi gjør dette "per aktivitet":
 * - fjerner gamle "session"-events for denne activity_id
 * - legger inn nye events basert på sessions + targets
 */
function mirrorSessionsToCalendarLS(activityId: string, activityName: string, sessions: ActivitySession[]) {
  const cur = safeJSON<any[]>(localStorage.getItem(CAL_LS)) ?? [];

  const keep = cur.filter((e) => {
    const src = String(e?.source ?? "");
    const aid = String(e?.activity_id ?? e?.activityId ?? "");
    // fjern tidligere session-speil for samme aktivitet
    if (src === "session" && aid === String(activityId)) return false;
    return true;
  });

  const next = [...keep];

  // bygg nye
  for (const s of sessions) {
    const targets = Array.from(new Set((s.targets || []).map(S).filter(Boolean)));
    for (const memberId of targets) {
      next.unshift({
        id: crypto.randomUUID(),
        member_id: memberId,
        title: `${activityName}: ${s.title}`,
        start: s.start_at,
        end: s.end_at,
        source: "session",
        activity_id: activityId,
        session_id: s.id,
      });
    }
  }

  localStorage.setItem(CAL_LS, JSON.stringify(next));
}

function uniqIdsFromPeople(list: AnyObj[] | undefined): string[] {
  const out: string[] = [];
  for (const m of list || []) {
    const id = S(m?.id ?? m?.uuid ?? m?.memberId ?? m?._id);
    if (id) out.push(id);
  }
  return Array.from(new Set(out));
}

export default function SessionsPanel(props: Props) {
  const { activityId, activityName } = props;

  const leaders = props.leaders ?? [];
  const participants = props.participants ?? [];
  const enrolledIdsFromProps = props.enrolledIds ?? [];

  const allPeopleIds = useMemo(() => {
    const fromLists = [...uniqIdsFromPeople(leaders), ...uniqIdsFromPeople(participants)];
    return Array.from(new Set([...fromLists, ...enrolledIdsFromProps.map(S).filter(Boolean)]));
  }, [leaders, participants, enrolledIdsFromProps]);

  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);

  const [sessions, setSessionsState] = useState<ActivitySession[]>([]);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draft, setDraft] = useState<SessionDraft>(emptyDraft);

  // Load: DB-first, LS-fallback
  useEffect(() => {
    let alive = true;

    (async () => {
      setLoading(true);
      try {
        const list = await fetchActivitySessions(activityId);
        if (!alive) return;

        setSessionsState(list);
        lsSaveSessions(activityId, list); // cache
        mirrorSessionsToCalendarLS(activityId, activityName, list);
      } catch {
        // fallback LS
        const ls = lsLoadSessions(activityId);
        if (!alive) return;
        setSessionsState(ls);
        // speil også (så kalender henger sammen lokalt)
        mirrorSessionsToCalendarLS(activityId, activityName, ls);
      } finally {
        if (alive) setLoading(false);
      }
    })();

    return () => {
      alive = false;
    };
  }, [activityId, activityName]);

  function resetDraft() {
    setDraft(emptyDraft);
    setEditingId(null);
  }

  function beginEdit(s: ActivitySession) {
    const start = toDateParts(s.start_at);
    const end = toDateParts(s.end_at);

    const selected: Record<string, boolean> = {};
    for (const id of s.targets || []) selected[String(id)] = true;

    setDraft({
      title: s.title || "Økt",
      date: start.date,
      startTime: start.time,
      endTime: end.time,
      location: s.location || "",
      note: s.note || "",
      audience: "custom", // når vi redigerer, vis som custom (gir kontroll)
      selected,
    });

    setEditingId(s.id);
  }

  async function save() {
    if (!draft.date || !draft.startTime) {
      alert("Dato og starttid må fylles ut.");
      return;
    }

    const title = draft.title.trim() || "Økt";
    const startISO = buildISO(draft.date, draft.startTime);
    const endISO = draft.endTime ? buildISO(draft.date, draft.endTime) : startISO;

    let targets: string[] = [];
    if (draft.audience === "all") {
      targets = allPeopleIds;
    } else {
      targets = Object.entries(draft.selected)
        .filter(([, v]) => !!v)
        .map(([k]) => String(k));
    }

    // Hvis ingen targets, gjør det tydelig
    if (targets.length === 0) {
      alert("Velg minst én mottaker (eller velg 'Alle').");
      return;
    }

    setBusy("save");
    try {
      if (editingId) {
        await updateActivitySession(editingId, {
          activity_id: activityId,
          title,
          start_at: startISO,
          end_at: endISO,
          location: draft.location.trim(),
          note: draft.note.trim(),
          targets,
        });
      } else {
        await createActivitySession({
          activity_id: activityId,
          title,
          start_at: startISO,
          end_at: endISO,
          location: draft.location.trim(),
          note: draft.note.trim(),
          targets,
        });
      }

      // refresh fra DB (sannhet)
      const list = await fetchActivitySessions(activityId);
      setSessionsState(list);
      lsSaveSessions(activityId, list);
      mirrorSessionsToCalendarLS(activityId, activityName, list);

      resetDraft();
    } catch (e: any) {
      // fallback: lagre lokalt (nødplan)
      const local: ActivitySession = {
        id: editingId || crypto.randomUUID(),
        activity_id: activityId,
        title,
        start_at: startISO,
        end_at: endISO,
        location: draft.location.trim(),
        note: draft.note.trim(),
        targets,
      };

      const prev = lsLoadSessions(activityId);
      const next = editingId
        ? prev.map((x) => (String(x.id) === String(editingId) ? local : x))
        : [local, ...prev];

      lsSaveSessions(activityId, next);
      setSessionsState(next);
      mirrorSessionsToCalendarLS(activityId, activityName, next);

      alert("Supabase svarte ikke – økten ble lagret lokalt som nødplan. Prøv igjen senere for å få den inn i databasen.");
      resetDraft();
    } finally {
      setBusy(null);
    }
  }

  async function remove(sessionId: string) {
    if (!confirm("Er du sikker på at du vil slette denne økten?")) return;

    setBusy(sessionId);
    try {
      await deleteActivitySession(sessionId);

      const list = await fetchActivitySessions(activityId);
      setSessionsState(list);
      lsSaveSessions(activityId, list);
      mirrorSessionsToCalendarLS(activityId, activityName, list);

      if (editingId === sessionId) resetDraft();
    } catch {
      // fallback: slett lokalt
      const prev = lsLoadSessions(activityId);
      const next = prev.filter((x) => String(x.id) !== String(sessionId));
      lsSaveSessions(activityId, next);
      setSessionsState(next);
      mirrorSessionsToCalendarLS(activityId, activityName, next);

      if (editingId === sessionId) resetDraft();
      alert("Supabase svarte ikke – økten ble slettet lokalt som nødplan. Prøv igjen senere for å rydde i databasen.");
    } finally {
      setBusy(null);
    }
  }

  const toggleSelected = (memberId: string) => {
    setDraft((d) => ({
      ...d,
      selected: { ...d.selected, [memberId]: !d.selected[memberId] },
    }));
  };

  // UI (samme “look & feel” som nå: mørke kort inni hvit side)
  if (loading) return <div className="text-neutral-600">Laster økter…</div>;

  return (
    <div className="space-y-6">
      {/* Info */}
      <div className="rounded-xl border border-neutral-200 bg-neutral-50 p-4 text-sm text-neutral-800">
        <p className="font-semibold mb-1">Økter for denne aktiviteten</p>
        <p className="text-neutral-600">
          Nå lagres økter i databasen (Supabase). Hvis databasen er nede, lagres de midlertidig lokalt og kan synkes senere.
        </p>
      </div>

      {/* Liste */}
      <div className="rounded-xl border border-neutral-200 bg-white p-4">
        <h2 className="mb-3 text-base font-semibold text-neutral-900">Planlagte økter</h2>

        {sessions.length === 0 ? (
          <p className="text-sm text-neutral-600">Ingen økter registrert ennå. Legg til den første økten i skjemaet under.</p>
        ) : (
          <div className="space-y-3">
            {sessions.map((s) => (
              <div
                key={s.id}
                className="flex flex-col gap-2 rounded-lg border border-neutral-200 bg-white p-3 md:flex-row md:items-center md:justify-between"
              >
                <div className="space-y-1 min-w-0">
                  <div className="text-sm font-semibold text-neutral-900 truncate">{s.title || "Økt"}</div>
                  <div className="text-xs text-neutral-700">
                    {new Date(s.start_at).toLocaleString("nb-NO")} – {new Date(s.end_at).toLocaleTimeString("nb-NO")}
                  </div>
                  {(s.location || s.note) && (
                    <div className="text-xs text-neutral-600">
                      {s.location ? <span>Sted: {s.location}. </span> : null}
                      {s.note ? <span>Notat: {s.note}</span> : null}
                    </div>
                  )}
                  <div className="text-xs text-neutral-500">
                    Mottakere: {(s.targets || []).length}
                  </div>
                </div>

                <div className="flex flex-wrap gap-2 text-xs">
                  <button
                    type="button"
                    onClick={() => beginEdit(s)}
                    disabled={busy === "save" || !!busy}
                    className="rounded-full border border-neutral-300 px-3 py-1 hover:border-red-500 hover:text-red-600"
                  >
                    Rediger
                  </button>
                  <button
                    type="button"
                    onClick={() => remove(s.id)}
                    disabled={busy === s.id || busy === "save"}
                    className="rounded-full border border-neutral-300 px-3 py-1 text-red-600 hover:border-red-500 hover:bg-red-50 disabled:opacity-60"
                  >
                    {busy === s.id ? "Sletter…" : "Slett"}
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Skjema */}
      <div className="rounded-xl border border-neutral-200 bg-white p-4">
        <h2 className="mb-3 text-base font-semibold text-neutral-900">
          {editingId ? "Rediger økt" : "Ny økt"}
        </h2>

        <div className="grid gap-3 md:grid-cols-2">
          <div className="space-y-1">
            <label className="text-xs font-medium text-neutral-700">Tittel</label>
            <input
              className="w-full rounded-md border border-neutral-300 bg-white px-2 py-1 text-sm text-neutral-900 outline-none focus:border-red-500"
              value={draft.title}
              onChange={(e) => setDraft((d) => ({ ...d, title: e.target.value }))}
              placeholder="F.eks. Øving – Scene 3"
            />
          </div>

          <div className="space-y-1">
            <label className="text-xs font-medium text-neutral-700">Dato</label>
            <input
              type="date"
              className="w-full rounded-md border border-neutral-300 bg-white px-2 py-1 text-sm text-neutral-900 outline-none focus:border-red-500"
              value={draft.date}
              onChange={(e) => setDraft((d) => ({ ...d, date: e.target.value }))}
            />
          </div>

          <div className="space-y-1">
            <label className="text-xs font-medium text-neutral-700">Starttid</label>
            <input
              type="time"
              className="w-full rounded-md border border-neutral-300 bg-white px-2 py-1 text-sm text-neutral-900 outline-none focus:border-red-500"
              value={draft.startTime}
              onChange={(e) => setDraft((d) => ({ ...d, startTime: e.target.value }))}
            />
          </div>

          <div className="space-y-1">
            <label className="text-xs font-medium text-neutral-700">Sluttid (valgfritt)</label>
            <input
              type="time"
              className="w-full rounded-md border border-neutral-300 bg-white px-2 py-1 text-sm text-neutral-900 outline-none focus:border-red-500"
              value={draft.endTime}
              onChange={(e) => setDraft((d) => ({ ...d, endTime: e.target.value }))}
            />
          </div>

          <div className="space-y-1">
            <label className="text-xs font-medium text-neutral-700">Sted (valgfritt)</label>
            <input
              className="w-full rounded-md border border-neutral-300 bg-white px-2 py-1 text-sm text-neutral-900 outline-none focus:border-red-500"
              value={draft.location}
              onChange={(e) => setDraft((d) => ({ ...d, location: e.target.value }))}
              placeholder="F.eks. Follies, sal 1"
            />
          </div>

          <div className="space-y-1 md:col-span-2">
            <label className="text-xs font-medium text-neutral-700">Notat (valgfritt)</label>
            <textarea
              className="w-full rounded-md border border-neutral-300 bg-white px-2 py-1 text-sm text-neutral-900 outline-none focus:border-red-500"
              rows={3}
              value={draft.note}
              onChange={(e) => setDraft((d) => ({ ...d, note: e.target.value }))}
              placeholder="Ekstra info"
            />
          </div>
        </div>

        {/* Mottakere */}
        <div className="mt-4 rounded-lg border border-neutral-200 bg-neutral-50 p-3">
          <div className="text-xs font-semibold text-neutral-900 mb-2">Hvem skal få denne økten?</div>
          <div className="flex flex-wrap gap-4 text-sm text-neutral-900">
            <label className="inline-flex items-center gap-2">
              <input
                type="radio"
                checked={draft.audience === "all"}
                onChange={() => setDraft((d) => ({ ...d, audience: "all" }))}
              />
              <span>Alle (ledere + deltakere)</span>
            </label>
            <label className="inline-flex items-center gap-2">
              <input
                type="radio"
                checked={draft.audience === "custom"}
                onChange={() => setDraft((d) => ({ ...d, audience: "custom" }))}
              />
              <span>Velg manuelt</span>
            </label>
          </div>

          {draft.audience === "custom" && (
            <div className="mt-3 grid grid-cols-1 md:grid-cols-2 gap-3">
              <div className="rounded-lg border border-neutral-200 bg-white p-3">
                <div className="font-medium mb-2 text-neutral-900">Ledere</div>
                <ul className="space-y-1">
                  {leaders.map((p) => {
                    const pid = S(p?.id ?? p?.uuid ?? p?.memberId ?? p?._id);
                    const name = `${p.first_name || ""} ${p.last_name || ""}`.trim() || "Uten navn";
                    if (!pid) return null;
                    return (
                      <li key={pid} className="flex items-center gap-2 text-sm text-neutral-900">
                        <input type="checkbox" checked={!!draft.selected[pid]} onChange={() => toggleSelected(pid)} />
                        <span>{name}</span>
                      </li>
                    );
                  })}
                  {leaders.length === 0 ? <li className="text-sm text-neutral-600">Ingen.</li> : null}
                </ul>
              </div>

              <div className="rounded-lg border border-neutral-200 bg-white p-3">
                <div className="font-medium mb-2 text-neutral-900">Deltakere</div>
                <ul className="space-y-1 max-h-60 overflow-auto pr-1">
                  {participants.map((p) => {
                    const pid = S(p?.id ?? p?.uuid ?? p?.memberId ?? p?._id);
                    const name = `${p.first_name || ""} ${p.last_name || ""}`.trim() || "Uten navn";
                    if (!pid) return null;
                    return (
                      <li key={pid} className="flex items-center gap-2 text-sm text-neutral-900">
                        <input type="checkbox" checked={!!draft.selected[pid]} onChange={() => toggleSelected(pid)} />
                        <span>{name}</span>
                      </li>
                    );
                  })}
                  {participants.length === 0 ? <li className="text-sm text-neutral-600">Ingen.</li> : null}
                </ul>
              </div>
            </div>
          )}
        </div>

        <div className="mt-4 flex flex-wrap gap-2">
          <button
            type="button"
            onClick={save}
            disabled={busy === "save"}
            className="rounded-full bg-red-600 px-4 py-1.5 text-sm font-semibold text-white hover:bg-red-700 disabled:opacity-60"
          >
            {busy === "save" ? "Lagrer…" : editingId ? "Lagre endringer" : "Legg til økt"}
          </button>

          {editingId && (
            <button
              type="button"
              onClick={resetDraft}
              className="rounded-full border border-neutral-300 px-4 py-1.5 text-sm text-neutral-800 hover:border-red-500 hover:text-red-600"
            >
              Avbryt redigering
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
