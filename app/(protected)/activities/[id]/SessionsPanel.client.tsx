// SNAPSHOT: 2025-08-31 – Follies Ansattportal
// Endring: kalender-innskriving for økter fikk `session_id: sess.id` (logikkfix; ingen designendring)

"use client";

import { useState } from "react";

type AnyObj = Record<string, any>;

interface Props {
  activityId: string;
  activityName: string;
  sessions: any[];
  setSessions: (s: any[]) => void;
  participants: AnyObj[];
  leaders: AnyObj[];
  enrolledIds: string[]; // union av ledere + deltakere (DB + LS)
}

const CAL_LS = "follies.calendar.v1";
const SESS_LS = "follies.activitySessions.v1";

const safeJSON = <T,>(s: string | null): T | null => {
  try { return s ? (JSON.parse(s) as T) : null; } catch { return null; }
};

function lsSaveSessions(activityId: string, list: any[]) {
  const all = safeJSON<Record<string, any[]>>(localStorage.getItem(SESS_LS)) ?? {};
  all[activityId] = list;
  localStorage.setItem(SESS_LS, JSON.stringify(all));
}
function lsLoadCalendar(): any[] {
  return safeJSON<any[]>(localStorage.getItem(CAL_LS)) ?? [];
}
function lsSaveCalendar(list: any[]) {
  localStorage.setItem(CAL_LS, JSON.stringify(list));
}

export default function SessionsPanel({
  activityId,
  activityName,
  sessions,
  setSessions,
  participants,
  leaders,
  enrolledIds,
}: Props) {
  // Stabil hook-rekkefølge
  const [title, setTitle] = useState("");
  const [date, setDate] = useState<string>("");
  const [time, setTime] = useState<string>("");
  const [duration, setDuration] = useState<number>(90);
  const [aud, setAud] = useState<"all" | "custom">("all");
  const [selection, setSelection] = useState<Record<string, boolean>>({});

  const allPeople = [
    ...leaders.map((p) => ({ ...p, _role: "leder" })),
    ...participants.map((p) => ({ ...p, _role: "deltaker" })),
  ];

  const toggle = (id: string) => setSelection((s) => ({ ...s, [id]: !s[id] }));

  const onAdd = () => {
    if (!title || !date || !time) return;

    const start = new Date(`${date}T${time}:00`);
    const end = new Date(start.getTime() + duration * 60000);

    let targets: string[];
    if (aud === "all") {
      targets = [...new Set(enrolledIds.map(String))];
      if (targets.length === 0) {
        alert("Ingen deltakere/ledere er påmeldt denne aktiviteten ennå. Legg til noen først.");
        return;
      }
    } else {
      targets = allPeople
        .filter((p) => selection[String(p.id ?? p.uuid ?? p.memberId ?? p._id)])
        .map((p) => String(p.id ?? p.uuid ?? p.memberId ?? p._id));
      if (targets.length === 0) {
        alert("Velg minst én mottaker.");
        return;
      }
    }

    const sess = {
      id: crypto.randomUUID(),
      activity_id: activityId,
      title,
      start: start.toISOString(),
      end: end.toISOString(),
      targets,
    };

    const next = [sess, ...sessions];
    setSessions(next);
    lsSaveSessions(activityId, next);

    const cal = lsLoadCalendar();
    for (const memberId of targets) {
      cal.unshift({
        id: crypto.randomUUID(),
        member_id: memberId,
        title: `${activityName}: ${title}`,
        start: start.toISOString(),
        end: end.toISOString(),
        source: "session",
        activity_id: activityId,
        // ⬇⬇ NYTT: gjør kalender-element klikkbart til /sessions/[id]
        session_id: sess.id,
      });
    }
    lsSaveCalendar(cal);

    setTitle("");
    setDate("");
    setTime("");
    setDuration(90);
    setAud("all");
    setSelection({});
  };

  return (
    <div className="rounded-2xl bg-white p-5 shadow-sm ring-1 ring-black/5">
      <h2 className="text-lg font-semibold text-neutral-900">Økter / øvinger</h2>

      {/* Skjema */}
      <div className="mt-4 grid grid-cols-1 md:grid-cols-2 gap-4">
        <div>
          <label className="block text-sm text-neutral-700 mb-1">Tittel</label>
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            className="w-full rounded-lg bg-white text-neutral-900 px-3 py-2 border border-neutral-300 focus:outline-none focus:border-red-600"
            placeholder="Øving – Scene 3"
          />
        </div>
        <div>
          <label className="block text-sm text-neutral-700 mb-1">Varighet (minutter)</label>
          <input
            type="number"
            min={15}
            max={480}
            value={duration}
            onChange={(e) => setDuration(Number(e.target.value))}
            className="w-full rounded-lg bg-white text-neutral-900 px-3 py-2 border border-neutral-300 focus:outline-none focus:border-red-600"
          />
        </div>
        <div>
          <label className="block text-sm text-neutral-700 mb-1">Dato</label>
          <input
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            className="w-full rounded-lg bg-white text-neutral-900 px-3 py-2 border border-neutral-300 focus:outline-none focus:border-red-600"
          />
        </div>
        <div>
          <label className="block text-sm text-neutral-700 mb-1">Tid</label>
          <input
            type="time"
            value={time}
            onChange={(e) => setTime(e.target.value)}
            className="w-full rounded-lg bg-white text-neutral-900 px-3 py-2 border border-neutral-300 focus:outline-none focus:border-red-600"
          />
        </div>
      </div>

      {/* Mottakere */}
      <div className="mt-4">
        <label className="block text-sm text-neutral-700 mb-2">Hvem skal få denne økten?</label>
        <div className="flex gap-6 text-neutral-800">
          <label className="flex items-center gap-2">
            <input type="radio" name="aud" checked={aud === "all"} onChange={() => setAud("all")} />
            <span>Alle (ledere + deltakere)</span>
          </label>
          <label className="flex items-center gap-2">
            <input type="radio" name="aud" checked={aud === "custom"} onChange={() => setAud("custom")} />
            <span>Velg manuelt</span>
          </label>
        </div>

        {aud === "custom" && (
          <div className="mt-3 grid grid-cols-1 md:grid-cols-2 gap-6">
            <div>
              <div className="font-medium mb-2">Ledere</div>
              <ul className="space-y-1">
                {leaders.map((p) => {
                  const pid = String(p?.id ?? p?.uuid ?? p?.memberId ?? p?._id);
                  return (
                    <li key={pid} className="flex items-center gap-2">
                      <input type="checkbox" checked={!!selection[pid]} onChange={() => toggle(pid)} />
                      <span>{(p.first_name || p.fornavn || "") + " " + (p.last_name || p.etternavn || "")}</span>
                    </li>
                  );
                })}
              </ul>
            </div>
            <div>
              <div className="font-medium mb-2">Deltakere</div>
              <ul className="space-y-1 max-h-60 overflow-auto pr-1">
                {participants.map((p) => {
                  const pid = String(p?.id ?? p?.uuid ?? p?.memberId ?? p?._id);
                  return (
                    <li key={pid} className="flex items-center gap-2">
                      <input type="checkbox" checked={!!selection[pid]} onChange={() => toggle(pid)} />
                      <span>{(p.first_name || p.fornavn || "") + " " + (p.last_name || p.etternavn || "")}</span>
                    </li>
                  );
                })}
              </ul>
            </div>
          </div>
        )}
      </div>

      <div className="mt-4">
        <button onClick={onAdd} className="rounded-lg bg-red-600 hover:bg-red-700 px-4 py-2 text-white font-semibold">
          Legg til økt
        </button>
      </div>

      {/* Liste over økter */}
      <div className="mt-6">
        <h3 className="font-semibold text-neutral-900 mb-3">Planlagte økter</h3>
        {sessions.length === 0 ? (
          <div className="text-neutral-700">Ingen økter enda.</div>
        ) : (
          <ul className="space-y-2">
            {sessions.map((s) => (
              <li key={s.id} className="flex items-center justify-between">
                <div>
                  <div className="font-medium text-neutral-900">{s.title}</div>
                  <div className="text-sm text-neutral-600">
                    {new Date(s.start).toLocaleString()} – {new Date(s.end).toLocaleTimeString()} · mottakere: {s.targets.length}
                  </div>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
