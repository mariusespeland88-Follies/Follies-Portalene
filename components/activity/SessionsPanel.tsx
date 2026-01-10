// PATH: components/SessionsPanel.tsx
"use client";

import { useEffect, useMemo, useState } from "react";
import { getLeaders, getParticipants } from "@/lib/enrollmentsClient";

type Person = { id: string; first_name?: string | null; last_name?: string | null; email?: string | null };
type Audience = "all" | "custom";

const CAL_LS = "follies.calendar.v1";
const SESS_LS = "follies.activitySessions.v1";

const safeJSON = <T,>(s: string | null): T | null => {
  try {
    return s ? (JSON.parse(s) as T) : null;
  } catch {
    return null;
  }
};

function loadCal(): any[] {
  return safeJSON<any[]>(localStorage.getItem(CAL_LS)) ?? [];
}
function saveCal(list: any[]) {
  try {
    localStorage.setItem(CAL_LS, JSON.stringify(list));
  } catch {}
}

function loadSessionsLS(activityId: string): any[] {
  const all = safeJSON<Record<string, any[]>>(localStorage.getItem(SESS_LS)) ?? {};
  return all[activityId] ?? [];
}
function saveSessionsLS(activityId: string, sessions: any[]) {
  const all = safeJSON<Record<string, any[]>>(localStorage.getItem(SESS_LS)) ?? {};
  all[activityId] = sessions;
  try {
    localStorage.setItem(SESS_LS, JSON.stringify(all));
  } catch {}
}

// --- API helpers (bruker din eksisterende route) ---
async function apiList(activityId: string): Promise<any[]> {
  const res = await fetch(`/api/sessions/list?activityId=${encodeURIComponent(activityId)}`, { cache: "no-store" });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(String((json as any)?.error || "Kunne ikke hente økter"));
  const list = Array.isArray((json as any)?.sessions) ? (json as any).sessions : [];
  return Array.isArray(list) ? list : [];
}

export default function SessionsPanel({ activityId, activityName }: { activityId: string; activityName: string }) {
  const [loading, setLoading] = useState(true);
  const [participants, setParticipants] = useState<Person[]>([]);
  const [leaders, setLeaders] = useState<Person[]>([]);
  const [sessions, setSessions] = useState<any[]>([]);

  // form
  const [title, setTitle] = useState("");
  const [date, setDate] = useState<string>("");
  const [time, setTime] = useState<string>("");
  const [duration, setDuration] = useState<number>(90);
  const [aud, setAud] = useState<Audience>("all");
  const [selection, setSelection] = useState<Record<string, boolean>>({});

  useEffect(() => {
    let alive = true;
    (async () => {
      setLoading(true);

      // People
      const [p, l] = await Promise.all([getParticipants(activityId), getLeaders(activityId)]);
      if (!alive) return;
      setParticipants(p);
      setLeaders(l);

      // Sessions: DB-first via API. Fallback LS.
      try {
        const rows = await apiList(activityId);
        if (!alive) return;

        // Normaliser til ditt format (start/end ISO)
        const mapped = rows.map((r: any) => ({
          id: String(r.id),
          activity_id: String(r.activity_id || activityId),
          title: String(r.title || "Økt"),
          start: String(r.start_at),
          end: String(r.end_at || r.start_at),
          location: r.location ?? "",
          note: r.note ?? "",
          targets: Array.isArray(r.targets) ? r.targets : [],
        }));

        setSessions(mapped);
        saveSessionsLS(activityId, mapped);
      } catch {
        const ls = loadSessionsLS(activityId);
        setSessions(ls);
      }

      setLoading(false);
    })();

    return () => {
      alive = false;
    };
  }, [activityId]);

  const allPeople = useMemo(() => [...leaders, ...participants], [leaders, participants]);

  const toggle = (id: string) =>
    setSelection((s) => ({
      ...s,
      [id]: !s[id],
    }));

  const onAdd = () => {
    if (!title || !date || !time) return;

    const isoStart = new Date(`${date}T${time}:00`).toISOString();
    const isoEnd = new Date(new Date(`${date}T${time}:00`).getTime() + duration * 60000).toISOString();

    const targets =
      aud === "all"
        ? allPeople.map((p) => p.id)
        : allPeople.filter((p) => selection[p.id]).map((p) => p.id);

    const sess = {
      id: crypto.randomUUID(),
      activity_id: activityId,
      title,
      start: isoStart,
      end: isoEnd,
      targets,
    };

    const next = [sess, ...sessions];
    setSessions(next);
    saveSessionsLS(activityId, next);

    // Speil til kalender-LS (så dashboard/kalender får det)
    const cal = loadCal();
    for (const memberId of targets) {
      cal.unshift({
        id: crypto.randomUUID(),
        member_id: memberId,
        title: `${activityName}: ${title}`,
        start: isoStart,
        end: isoEnd,
        source: "session",
        activity_id: activityId,
        session_id: sess.id,
      });
    }
    saveCal(cal);

    // reset
    setTitle("");
    setDate("");
    setTime("");
    setDuration(90);
    setAud("all");
    setSelection({});
  };

  if (loading) return <div className="text-neutral-300">Laster økter…</div>;

  return (
    <div className="space-y-6">
      <div className="rounded-xl border border-white/10 p-4 bg-black/40">
        <h3 className="font-semibold mb-3">Ny økt / øving</h3>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm text-neutral-300 mb-1">Tittel</label>
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="w-full rounded-xl bg-neutral-800 text-white px-3 py-2 border border-white/10 focus:border-red-500"
              placeholder="Øving – Scene 3"
            />
          </div>
          <div>
            <label className="block text-sm text-neutral-300 mb-1">Varighet (minutter)</label>
            <input
              type="number"
              min={15}
              max={480}
              value={duration}
              onChange={(e) => setDuration(Number(e.target.value))}
              className="w-full rounded-xl bg-neutral-800 text-white px-3 py-2 border border-white/10 focus:border-red-500"
            />
          </div>
          <div>
            <label className="block text-sm text-neutral-300 mb-1">Dato</label>
            <input
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              className="w-full rounded-xl bg-neutral-800 text-white px-3 py-2 border border-white/10 focus:border-red-500"
            />
          </div>
          <div>
            <label className="block text-sm text-neutral-300 mb-1">Tid</label>
            <input
              type="time"
              value={time}
              onChange={(e) => setTime(e.target.value)}
              className="w-full rounded-xl bg-neutral-800 text-white px-3 py-2 border border-white/10 focus:border-red-500"
            />
          </div>
        </div>

        <div className="mt-4">
          <label className="block text-sm text-neutral-300 mb-2">Hvem skal få denne økten?</label>
          <div className="flex gap-6">
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
            <div className="mt-3 grid grid-cols-1 md:grid-cols-2 gap-3">
              <div className="rounded-lg border border-white/10 p-3">
                <div className="font-medium mb-2">Ledere</div>
                <ul className="space-y-1">
                  {leaders.map((p) => (
                    <li key={p.id} className="flex items-center gap-2">
                      <input type="checkbox" checked={!!selection[p.id]} onChange={() => toggle(p.id)} />
                      <span>{p.first_name} {p.last_name}</span>
                    </li>
                  ))}
                </ul>
              </div>
              <div className="rounded-lg border border-white/10 p-3">
                <div className="font-medium mb-2">Deltakere</div>
                <ul className="space-y-1 max-h-60 overflow-auto pr-1">
                  {participants.map((p) => (
                    <li key={p.id} className="flex items-center gap-2">
                      <input type="checkbox" checked={!!selection[p.id]} onChange={() => toggle(p.id)} />
                      <span>{p.first_name} {p.last_name}</span>
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          )}
        </div>

        <div className="mt-4">
          <button onClick={onAdd} className="rounded-xl bg-red-600 hover:bg-red-700 px-4 py-2 font-semibold">
            Legg til økt
          </button>
        </div>
      </div>

      <div className="rounded-xl border border-white/10 p-4 bg-black/40">
        <h3 className="font-semibold mb-3">Planlagte økter</h3>
        {sessions.length === 0 ? (
          <div className="text-neutral-400">Ingen økter enda.</div>
        ) : (
          <ul className="space-y-2">
            {sessions.map((s) => (
              <li key={s.id} className="flex items-center justify-between rounded-lg border border-white/10 p-3">
                <div>
                  <div className="font-medium">{s.title}</div>
                  <div className="text-sm text-neutral-400">
                    {new Date(s.start).toLocaleString()} – {new Date(s.end).toLocaleTimeString()}
                    {" · "} mottakere: {Array.isArray(s.targets) ? s.targets.length : 0}
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
