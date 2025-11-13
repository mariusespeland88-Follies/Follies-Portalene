"use client";

import { useEffect, useState } from "react";

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

export default function SessionsPanel(props: Props) {
  const { activityId, activityName, sessions, setSessions } = props;

  const [draft, setDraft] = useState<SessionDraft>(emptyDraft);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [isLoadedFromLS, setIsLoadedFromLS] = useState(false);

  // Ved første mount: hvis sessions-prop er tom,
  // prøv å hente eksisterende økter fra localStorage.
  useEffect(() => {
    if (sessions && sessions.length > 0) {
      setIsLoadedFromLS(true);
      return;
    }
    const fromLs = lsLoadSessions(activityId);
    if (fromLs.length > 0) {
      setSessions(fromLs);
    }
    setIsLoadedFromLS(true);
  }, [activityId, sessions, setSessions]);

  const resetDraft = () => {
    setDraft(emptyDraft);
    setEditingId(null);
  };

  const handleSave = () => {
    if (!draft.date || !draft.startTime) {
      alert("Dato og starttid må fylles ut.");
      return;
    }

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
    resetDraft();
  };

  const handleEdit = (session: AnyObj) => {
    setDraft({
      id: session.id,
      title: session.title ?? "",
      date: session.date ?? "",
      startTime: session.startTime ?? "",
      endTime: session.endTime ?? "",
      location: session.location ?? "",
      note: session.note ?? "",
    });
    setEditingId(String(session.id));
  };

  const handleDelete = (id: string) => {
    if (!confirm("Er du sikker på at du vil slette denne økten?")) return;
    const updated = sessions.filter((s) => String(s.id) !== id);
    setSessions(updated);
    lsSaveSessions(activityId, updated);
    if (editingId === id) {
      resetDraft();
    }
  };

  const handleAddToCalendar = (session: AnyObj) => {
    addSessionToCalendar(activityId, activityName, session);
    alert("Økten er lagt til i kalender-utkastet.");
  };

  return (
    <div className="space-y-6">
      {/* Info / status */}
      <div className="rounded-xl border border-neutral-800 bg-neutral-950/60 p-4 text-sm text-neutral-200">
        <p className="font-semibold mb-1">Økter for denne aktiviteten</p>
        <p className="text-neutral-400">
          Her kan du legge inn prøveplan, forestillinger eller andre økter
          knyttet til aktiviteten. Alt lagres lokalt i nettleseren (og speiles
          til databasen via andre skjemaer etter hvert).
        </p>
        {!isLoadedFromLS && (
          <p className="mt-2 text-xs text-yellow-400">
            Laster tidligere økter fra nettleseren …
          </p>
        )}
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
