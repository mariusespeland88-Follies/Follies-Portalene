"use client";

import { useEffect, useMemo, useState } from "react";
import { createClientComponentClient } from "@/lib/supabase/browser";

type AnyObj = Record<string, any>;

interface Props {
  activityId: string;
  activityName: string;
  sessions: AnyObj[];
  setSessions: (s: AnyObj[]) => void;
  participants: AnyObj[];
  leaders: AnyObj[];
  enrolledIds: string[]; // union av ledere + deltakere (DB + LS)
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

type SessionDraft = {
  id?: string;
  title: string;
  date: string; // YYYY-MM-DD
  startTime: string; // HH:MM
  endTime: string; // HH:MM
  location: string;
  note: string;

  // NYTT: hvem økten gjelder for
  useAllEnrolled: boolean;
  targetIds: string[];
};

const emptyDraft: SessionDraft = {
  title: "",
  date: "",
  startTime: "",
  endTime: "",
  location: "",
  note: "",
  useAllEnrolled: true,
  targetIds: [],
};

function lsLoadSessions(activityId: string): AnyObj[] {
  if (typeof window === "undefined") return [];
  const raw = safeJSON<Record<string, AnyObj[]>>(localStorage.getItem(SESS_LS));
  if (!raw) return [];
  return raw[activityId] ?? [];
}

function lsSaveSessions(activityId: string, list: AnyObj[]) {
  if (typeof window === "undefined") return;
  const raw = safeJSON<Record<string, AnyObj[]>>(localStorage.getItem(SESS_LS)) ?? {};
  raw[activityId] = list;
  localStorage.setItem(SESS_LS, JSON.stringify(raw));
}

/**
 * Enkelt “legg i kalender”-oppsett.
 *  - Lagrer en liste med events per aktivitetId i follies.calendar.v1
 */
function addSessionToCalendar(activityId: string, activityName: string, session: AnyObj) {
  if (typeof window === "undefined") return;
  const raw = safeJSON<Record<string, AnyObj[]>>(localStorage.getItem(CAL_LS)) ?? {};
  const current = raw[activityId] ?? [];

  const merged = [
    ...current,
    {
      id: session.id ?? crypto.randomUUID(),
      activityId,
      activityName,
      sessionId: session.id,
      title: session.title ?? "Økt",
      date: session.date,
      startTime: session.startTime,
      endTime: session.endTime,
      location: session.location,
      note: session.note,
      createdAt: new Date().toISOString(),
    },
  ];

  raw[activityId] = merged;
  localStorage.setItem(CAL_LS, JSON.stringify(raw));
}

function toHHMM(d: Date) {
  const hh = String(d.getHours()).padStart(2, "0");
  const mm = String(d.getMinutes()).padStart(2, "0");
  return `${hh}:${mm}`;
}

function parseDbSession(row: any): AnyObj {
  const start = row?.start_at ? new Date(row.start_at) : null;
  const end = row?.end_at ? new Date(row.end_at) : null;

  const date = start ? start.toISOString().slice(0, 10) : "";
  const startTime = start ? toHHMM(start) : "";
  const endTime = end ? toHHMM(end) : "";

  const targets = Array.isArray(row?.activity_session_targets)
    ? row.activity_session_targets.map((t: any) => String(t.member_id)).filter(Boolean)
    : [];

  return {
    id: String(row.id),
    title: row.title ?? "",
    date,
    startTime,
    endTime,
    location: row.location ?? "",
    note: row.note ?? "",
    // for redigering
    targetIds: targets,
    useAllEnrolled: false,
  };
}

function buildStartEndISO(draft: SessionDraft) {
  // Lokal tid -> ISO (Supabase timestamptz)
  const start = new Date(`${draft.date}T${draft.startTime}:00`);
  const end = draft.endTime ? new Date(`${draft.date}T${draft.endTime}:00`) : null;
  return {
    start_at: start.toISOString(),
    end_at: end ? end.toISOString() : null,
  };
}

export default function SessionsPanel(props: Props) {
  const { activityId, activityName, sessions, setSessions, participants, leaders, enrolledIds } = props;

  const supabase = useMemo(() => createClientComponentClient(), []);

  const [draft, setDraft] = useState<SessionDraft>(emptyDraft);
  const [editingId, setEditingId] = useState<string | null>(null);

  const [isLoadedFromLS, setIsLoadedFromLS] = useState(false);
  const [dbStatus, setDbStatus] = useState<"idle" | "loading" | "ok" | "error">("idle");
  const [dbError, setDbError] = useState<string | null>(null);

  const enrolledMap = useMemo(() => {
    const m: Record<string, AnyObj> = {};
    for (const p of participants ?? []) {
      const id = String(p?.id ?? p?.member_id ?? "");
      if (id) m[id] = p;
    }
    for (const l of leaders ?? []) {
      const id = String(l?.id ?? l?.member_id ?? "");
      if (id) m[id] = l;
    }
    return m;
  }, [participants, leaders]);

  const labelForMember = (id: string) => {
    const x = enrolledMap[id];
    const name =
      x?.name ||
      [x?.first_name, x?.last_name].filter(Boolean).join(" ") ||
      x?.email ||
      id;
    return String(name);
  };

  // 1) Last fra DB først (hvis mulig). Hvis DB-feil: fall back til LS.
  useEffect(() => {
    let alive = true;

    (async () => {
      setDbStatus("loading");
      setDbError(null);

      try {
        const { data, error } = await supabase
          .from("activity_sessions")
          .select(
            "id, title, start_at, end_at, location, note, activity_session_targets(member_id)"
          )
          .eq("activity_id", activityId)
          .order("start_at", { ascending: true });

        if (error) throw error;

        const list = (data ?? []).map(parseDbSession);

        if (!alive) return;

        // Sett i state + behold LS som “backup speil”
        setSessions(list);
        lsSaveSessions(activityId, list);

        setDbStatus("ok");
        setDbError(null);
        setIsLoadedFromLS(true);
      } catch (e: any) {
        if (!alive) return;

        setDbStatus("error");
        setDbError(String(e?.message ?? e));

        // fallback LS hvis sessions er tomt
        if (!sessions || sessions.length === 0) {
          const fromLs = lsLoadSessions(activityId);
          if (fromLs.length > 0) setSessions(fromLs);
        }
        setIsLoadedFromLS(true);
      }
    })();

    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activityId]);

  const resetDraft = () => {
    setDraft(emptyDraft);
    setEditingId(null);
  };

  const refreshFromDb = async () => {
    setDbStatus("loading");
    setDbError(null);
    try {
      const { data, error } = await supabase
        .from("activity_sessions")
        .select("id, title, start_at, end_at, location, note, activity_session_targets(member_id)")
        .eq("activity_id", activityId)
        .order("start_at", { ascending: true });
      if (error) throw error;

      const list = (data ?? []).map(parseDbSession);
      setSessions(list);
      lsSaveSessions(activityId, list);

      setDbStatus("ok");
    } catch (e: any) {
      setDbStatus("error");
      setDbError(String(e?.message ?? e));
    }
  };

  const saveTargets = async (sessionId: string, targetIds: string[]) => {
    // slette gamle targets + legge til nye
    // (hvis RLS ikke har delete/update policy enda, vil dette feile – da sier vi ifra)
    const delRes = await supabase
      .from("activity_session_targets")
      .delete()
      .eq("session_id", sessionId);

    if (delRes.error) {
      // Ikke stopp alt – men gi tydelig feilmelding.
      throw delRes.error;
    }

    if (targetIds.length === 0) return;

    const rows = targetIds.map((mid) => ({ session_id: sessionId, member_id: mid }));
    const insRes = await supabase.from("activity_session_targets").insert(rows);
    if (insRes.error) throw insRes.error;
  };

  const handleSave = async () => {
    if (!draft.date || !draft.startTime) {
      alert("Dato og starttid må fylles ut.");
      return;
    }

    // Hvem gjelder økten for?
    const chosenTargets = draft.useAllEnrolled
      ? (enrolledIds ?? []).map(String).filter(Boolean)
      : (draft.targetIds ?? []).map(String).filter(Boolean);

    // Bygg DB payload
    const { start_at, end_at } = buildStartEndISO(draft);

    const payload = {
      activity_id: activityId,
      title: draft.title || "Økt",
      start_at,
      end_at,
      location: draft.location || null,
      note: draft.note || null,
    };

    try {
      setDbStatus("loading");
      setDbError(null);

      if (editingId) {
        // UPDATE eksisterende (krever policy). Hvis feiler, fall back til LS.
        const up = await supabase.from("activity_sessions").update(payload).eq("id", editingId);
        if (up.error) throw up.error;

        // oppdater targets (krever delete/insert policy)
        await saveTargets(editingId, chosenTargets);

        // refresh fra DB for å være 100% riktig
        await refreshFromDb();
      } else {
        const ins = await supabase.from("activity_sessions").insert(payload).select("id").single();
        if (ins.error) throw ins.error;

        const newId = String(ins.data.id);
        await saveTargets(newId, chosenTargets);

        await refreshFromDb();
      }

      // Skriv også til kalender-utkastet (lokalt) slik dere har hatt
      const newest = editingId
        ? sessions.find((s) => String(s.id) === editingId)
        : null;

      // ikke automatisk add-to-calendar; bruk knappen per økt som før.

      setDbStatus("ok");
      resetDraft();
    } catch (e: any) {
      setDbStatus("error");
      setDbError(String(e?.message ?? e));

      // FALLBACK: behold gammel LS-lagring så du ikke mister arbeidet ditt
      const base: AnyObj = {
        ...draft,
      };

      let updatedSessions: AnyObj[];

      if (editingId) {
        updatedSessions = sessions.map((s) =>
          String(s.id) === editingId ? { ...s, ...base } : s
        );
      } else {
        const id = crypto.randomUUID();
        updatedSessions = [
          ...sessions,
          {
            id,
            ...base,
          },
        ];
      }

      setSessions(updatedSessions);
      lsSaveSessions(activityId, updatedSessions);

      alert(
        "Kunne ikke lagre til databasen (RLS/policy mangler sannsynligvis). Økten er lagret lokalt i nettleseren som backup."
      );
      resetDraft();
    }
  };

  const handleEdit = (session: AnyObj) => {
    const targetIds = Array.isArray(session.targetIds) ? session.targetIds.map(String) : [];
    const useAll = targetIds.length === 0; // hvis tom: anta “alle” som standard i UI
    setDraft({
      id: session.id,
      title: session.title ?? "",
      date: session.date ?? "",
      startTime: session.startTime ?? "",
      endTime: session.endTime ?? "",
      location: session.location ?? "",
      note: session.note ?? "",
      useAllEnrolled: useAll,
      targetIds: useAll ? [] : targetIds,
    });
    setEditingId(String(session.id));
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Er du sikker på at du vil slette denne økten?")) return;

    // Prøv DB først
    try {
      setDbStatus("loading");
      setDbError(null);

      // slette targets først (forutsatt policy)
      const delT = await supabase.from("activity_session_targets").delete().eq("session_id", id);
      if (delT.error) throw delT.error;

      const delS = await supabase.from("activity_sessions").delete().eq("id", id);
      if (delS.error) throw delS.error;

      await refreshFromDb();
      setDbStatus("ok");
    } catch (e: any) {
      setDbStatus("error");
      setDbError(String(e?.message ?? e));

      // fallback LS
      const updated = sessions.filter((s) => String(s.id) !== id);
      setSessions(updated);
      lsSaveSessions(activityId, updated);

      alert(
        "Kunne ikke slette fra databasen (RLS/policy mangler sannsynligvis). Den ble fjernet lokalt som backup."
      );
    }

    if (editingId === id) resetDraft();
  };

  const handleAddToCalendar = (session: AnyObj) => {
    addSessionToCalendar(activityId, activityName, session);
    alert("Økten er lagt til i kalender-utkastet.");
  };

  const toggleTarget = (memberId: string) => {
    setDraft((d) => {
      const set = new Set((d.targetIds ?? []).map(String));
      if (set.has(memberId)) set.delete(memberId);
      else set.add(memberId);
      return { ...d, targetIds: Array.from(set) };
    });
  };

  return (
    <div className="space-y-6">
      {/* Info / status */}
      <div className="rounded-xl border border-neutral-800 bg-neutral-950/60 p-4 text-sm text-neutral-200">
        <p className="font-semibold mb-1">Økter for denne aktiviteten</p>
        <p className="text-neutral-400">
          Her kan du legge inn prøveplan, forestillinger eller andre økter
          knyttet til aktiviteten. Nå lagres øktene i databasen (Supabase).
        </p>

        {!isLoadedFromLS && (
          <p className="mt-2 text-xs text-yellow-400">
            Laster økter …
          </p>
        )}

        {dbStatus === "error" && dbError ? (
          <div className="mt-3 rounded-lg border border-red-800 bg-red-950/30 p-3 text-xs text-red-200">
            <div className="font-semibold">DB-feil</div>
            <div className="mt-1 text-red-200/80">{dbError}</div>
            <button
              type="button"
              onClick={refreshFromDb}
              className="mt-2 rounded-full border border-neutral-600 px-3 py-1 hover:border-red-500 hover:text-red-300"
            >
              Prøv igjen
            </button>
            <div className="mt-2 text-neutral-400">
              (Du mister ikke data – vi bruker localStorage som backup hvis DB ikke er klar.)
            </div>
          </div>
        ) : null}

        {dbStatus === "ok" ? (
          <div className="mt-3 flex flex-wrap gap-2 text-xs">
            <span className="rounded-full border border-green-800 bg-green-950/30 px-3 py-1 text-green-200">
              Lagret i database
            </span>
            <button
              type="button"
              onClick={refreshFromDb}
              className="rounded-full border border-neutral-600 px-3 py-1 hover:border-red-500 hover:text-red-300"
            >
              Oppdater
            </button>
          </div>
        ) : null}
      </div>

      {/* Liste over økter */}
      <div className="rounded-xl border border-neutral-800 bg-neutral-950/60 p-4">
        <h2 className="mb-3 text-base font-semibold text-neutral-100">
          Planlagte økter
        </h2>

        {sessions.length === 0 ? (
          <p className="text-sm text-neutral-400">
            Ingen økter registrert ennå. Legg til den første økten i skjemaet
            under.
          </p>
        ) : (
          <div className="space-y-3">
            {sessions.map((s) => (
              <div
                key={String(s.id ?? `${s.date}-${s.startTime}-${s.title}`)}
                className="flex flex-col gap-2 rounded-lg border border-neutral-800 bg-neutral-900/60 p-3 md:flex-row md:items-center md:justify-between"
              >
                <div className="space-y-1">
                  <div className="text-sm font-semibold text-neutral-100">
                    {s.title || "Økt"}
                  </div>
                  <div className="text-xs text-neutral-300">
                    {s.date || "Ukjent dato"}{" "}
                    {s.startTime && (
                      <>
                        kl. {s.startTime}
                        {s.endTime ? `–${s.endTime}` : null}
                      </>
                    )}
                  </div>
                  {(s.location || s.note) && (
                    <div className="text-xs text-neutral-400">
                      {s.location && <span>Sted: {s.location}. </span>}
                      {s.note && <span>Notat: {s.note}</span>}
                    </div>
                  )}
                </div>

                <div className="flex flex-wrap gap-2 text-xs">
                  <button
                    type="button"
                    onClick={() => handleEdit(s)}
                    className="rounded-full border border-neutral-600 px-3 py-1 hover:border-red-500 hover:text-red-300"
                  >
                    Rediger
                  </button>
                  <button
                    type="button"
                    onClick={() => handleDelete(String(s.id))}
                    className="rounded-full border border-neutral-700 px-3 py-1 text-red-300 hover:border-red-600 hover:bg-red-900/30"
                  >
                    Slett
                  </button>
                  <button
                    type="button"
                    onClick={() => handleAddToCalendar(s)}
                    className="rounded-full border border-neutral-600 px-3 py-1 hover:border-red-500 hover:text-red-300"
                  >
                    Legg i kalender-utkast
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Skjema for ny / redigert økt */}
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
              onChange={(e) =>
                setDraft((d) => ({ ...d, title: e.target.value }))
              }
              placeholder="F.eks. Prøve, gjennomgang, forestilling ..."
            />
          </div>

          <div className="space-y-1">
            <label className="text-xs font-medium text-neutral-300">Dato</label>
            <input
              type="date"
              className="w-full rounded-md border border-neutral-700 bg-neutral-900 px-2 py-1 text-sm text-neutral-100 outline-none focus:border-red-500"
              value={draft.date}
              onChange={(e) =>
                setDraft((d) => ({ ...d, date: e.target.value }))
              }
            />
          </div>

          <div className="space-y-1">
            <label className="text-xs font-medium text-neutral-300">
              Starttid
            </label>
            <input
              type="time"
              className="w-full rounded-md border border-neutral-700 bg-neutral-900 px-2 py-1 text-sm text-neutral-100 outline-none focus:border-red-500"
              value={draft.startTime}
              onChange={(e) =>
                setDraft((d) => ({ ...d, startTime: e.target.value }))
              }
            />
          </div>

          <div className="space-y-1">
            <label className="text-xs font-medium text-neutral-300">
              Sluttid (valgfritt)
            </label>
            <input
              type="time"
              className="w-full rounded-md border border-neutral-700 bg-neutral-900 px-2 py-1 text-sm text-neutral-100 outline-none focus:border-red-500"
              value={draft.endTime}
              onChange={(e) =>
                setDraft((d) => ({ ...d, endTime: e.target.value }))
              }
            />
          </div>

          <div className="space-y-1">
            <label className="text-xs font-medium text-neutral-300">
              Sted (valgfritt)
            </label>
            <input
              className="w-full rounded-md border border-neutral-700 bg-neutral-900 px-2 py-1 text-sm text-neutral-100 outline-none focus:border-red-500"
              value={draft.location}
              onChange={(e) =>
                setDraft((d) => ({ ...d, location: e.target.value }))
              }
              placeholder="F.eks. Follies, sal 1"
            />
          </div>

          <div className="space-y-1 md:col-span-2">
            <label className="text-xs font-medium text-neutral-300">
              Notat (valgfritt)
            </label>
            <textarea
              className="w-full rounded-md border border-neutral-700 bg-neutral-900 px-2 py-1 text-sm text-neutral-100 outline-none focus:border-red-500"
              rows={3}
              value={draft.note}
              onChange={(e) =>
                setDraft((d) => ({ ...d, note: e.target.value }))
              }
              placeholder="Ekstra info til deg selv/lederne."
            />
          </div>

          {/* NYTT: hvem økten gjelder for */}
          <div className="space-y-2 md:col-span-2">
            <div className="flex items-center justify-between gap-3">
              <label className="text-xs font-medium text-neutral-300">
                Hvem gjelder økten for?
              </label>

              <label className="flex items-center gap-2 text-xs text-neutral-300">
                <input
                  type="checkbox"
                  checked={draft.useAllEnrolled}
                  onChange={(e) =>
                    setDraft((d) => ({
                      ...d,
                      useAllEnrolled: e.target.checked,
                      targetIds: e.target.checked ? [] : d.targetIds,
                    }))
                  }
                />
                Alle påmeldte
              </label>
            </div>

            {!draft.useAllEnrolled ? (
              <div className="grid gap-2 rounded-lg border border-neutral-800 bg-neutral-900/50 p-3 md:grid-cols-2">
                {(enrolledIds ?? []).map((id) => {
                  const mid = String(id);
                  const checked = (draft.targetIds ?? []).includes(mid);
                  return (
                    <label key={mid} className="flex items-center gap-2 text-xs text-neutral-200">
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={() => toggleTarget(mid)}
                      />
                      <span className="truncate">{labelForMember(mid)}</span>
                    </label>
                  );
                })}
              </div>
            ) : (
              <p className="text-xs text-neutral-400">
                Standard: alle som er påmeldt aktiviteten.
              </p>
            )}
          </div>
        </div>

        <div className="mt-4 flex flex-wrap gap-2">
          <button
            type="button"
            onClick={handleSave}
            className="rounded-full bg-red-600 px-4 py-1.5 text-sm font-semibold text-white hover:bg-red-500"
          >
            {editingId ? "Lagre endringer" : "Legg til økt"}
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
