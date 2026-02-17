// PATH: app/(protected)/activities/[id]/sessions/new/page.tsx
"use client";

// SNAPSHOT: 2026-01-08 – Økter til DB (Supabase) + LS fallback
// - Ingen designendring (samme layout/klasser)
// - DB-først: activity_sessions + activity_session_targets
// - LS fallback beholdt: follies.activitySessions.v1 + follies.calendar.v1
// - Proffere input: start + varighet (timer/min) → end beregnes

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { getLeaders, getParticipants } from "@/lib/enrollmentsClient"; // eksisterer hos dere

type AnyObj = Record<string, any>;

const SESS_LS = "follies.activitySessions.v1";
const CAL_LS  = "follies.calendar.v1";

const ACT_V1  = "follies.activities.v1";
const ACT_FB  = "follies.activities";

const INPUT =
  "w-full rounded-lg border border-neutral-300 bg-white px-3 py-2 text-sm text-neutral-900 " +
  "placeholder:text-neutral-500 focus:outline-none focus:ring-2 focus:ring-red-600";
const TEXTAREA = INPUT;

const safeJSON = <T,>(s: string | null): T | null => { try { return s ? (JSON.parse(s) as T) : null; } catch { return null; } };
const S = (v:any)=>String(v ?? "");

function loadActivityName(aid: string): string {
  const v1 = safeJSON<any[]>(localStorage.getItem(ACT_V1)) ?? [];
  const old= safeJSON<any[]>(localStorage.getItem(ACT_FB)) ?? [];
  const all= [...old, ...v1];
  const hit= all.find(a => S(a?.id ?? a?.uuid ?? a?._id) === S(aid));
  return hit ? (hit.name || hit.title || hit.navn || "Aktivitet") : "Aktivitet";
}

function minutesToLabel(total: number) {
  const h = Math.floor(total / 60);
  const m = total % 60;
  if (h <= 0) return `${m} min`;
  if (m === 0) return `${h} t`;
  return `${h} t ${m} min`;
}

function toISO(date: string, time: string) {
  // Local -> ISO string
  const d = new Date(`${date}T${time}:00`);
  return d.toISOString();
}

function addMinutes(iso: string, minutes: number) {
  const d = new Date(iso);
  d.setMinutes(d.getMinutes() + minutes);
  return d.toISOString();
}

function fmtNb(iso: string) {
  const d = new Date(iso);
  return Number.isNaN(+d) ? iso : d.toLocaleString("nb-NO");
}

type MemberLite = {
  id: string;
  first_name?: string | null;
  last_name?: string | null;
  email?: string | null;
  name?: string | null;
  full_name?: string | null;
};

function fullName(m: MemberLite) {
  const fromFields = `${m.first_name || ""} ${m.last_name || ""}`.trim();
  const fromAlt = m.full_name || m.name || "";
  return (fromFields || fromAlt || m.email || "Uten navn").trim();
}

type LsSession = {
  id: string;
  activityId: string;
  title: string;
  start: string; // ISO
  end: string;   // ISO
  location?: string;
  note?: string;
  targets?: string[]; // member ids (optional)
};

type LsCalItem = {
  id: string;
  activity_id: string;
  session_id: string;
  title: string;
  start: string; // ISO
  end: string;   // ISO
};

function readLsSessionsMap(): Record<string, LsSession[]> {
  return safeJSON<Record<string, LsSession[]>>(localStorage.getItem(SESS_LS)) ?? {};
}
function writeLsSessionsMap(map: Record<string, LsSession[]>) {
  localStorage.setItem(SESS_LS, JSON.stringify(map));
}
function readLsCalendar(): LsCalItem[] {
  return safeJSON<LsCalItem[]>(localStorage.getItem(CAL_LS)) ?? [];
}
function writeLsCalendar(items: LsCalItem[]) {
  localStorage.setItem(CAL_LS, JSON.stringify(items));
}

export default function NewSessionPage() {
  const { id: activityId } = useParams() as { id: string };
  const router = useRouter();

  const [activityName, setActivityName] = useState("Aktivitet");

  const [leaders, setLeaders] = useState<MemberLite[]>([]);
  const [participants, setParticipants] = useState<MemberLite[]>([]);
  const enrolled = useMemo(() => {
    const map = new Map<string, MemberLite>();
    [...leaders, ...participants].forEach((m) => map.set(String(m.id), m));
    return Array.from(map.values());
  }, [leaders, participants]);

  // Form
  const [title, setTitle] = useState("");
  const [date, setDate] = useState<string>("");
  const [startTime, setStartTime] = useState<string>("");

  // Proffere: varighet i timer + minutter
  const [durHours, setDurHours] = useState<number>(2);
  const [durMinutes, setDurMinutes] = useState<number>(0);

  const durationTotal = useMemo(() => Math.max(0, durHours * 60 + durMinutes), [durHours, durMinutes]);

  const [location, setLocation] = useState("");
  const [note, setNote] = useState("");

  // Målgruppe
  const [allEnrolled, setAllEnrolled] = useState(true);
  const [targetIds, setTargetIds] = useState<string[]>([]);

  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [dbInfo, setDbInfo] = useState<string | null>(null);

  useEffect(() => {
    setActivityName(loadActivityName(activityId));
  }, [activityId]);

  // Hent rolle-lister DB-først (samme som resten av portalen)
  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const [ls, ps] = await Promise.all([
          getLeaders(activityId),
          getParticipants(activityId),
        ]);
        if (!alive) return;
        setLeaders((ls ?? []) as any);
        setParticipants((ps ?? []) as any);
      } catch {
        // Hvis dette feiler i din miljø: la det være tomt, men ikke krasj.
        if (!alive) return;
        setLeaders([]);
        setParticipants([]);
      }
    })();
    return () => { alive = false; };
  }, [activityId]);

  const preview = useMemo(() => {
    if (!date || !startTime || durationTotal <= 0) return null;
    const startIso = toISO(date, startTime);
    const endIso = addMinutes(startIso, durationTotal);
    return { startIso, endIso };
  }, [date, startTime, durationTotal]);

  function toggleTarget(id: string) {
    setTargetIds((prev) => {
      const set = new Set(prev.map(String));
      if (set.has(String(id))) set.delete(String(id));
      else set.add(String(id));
      return Array.from(set);
    });
  }

  async function onSave() {
    setErr(null);
    setDbInfo(null);

    if (!date) return setErr("Velg dato.");
    if (!startTime) return setErr("Velg starttid.");
    if (durationTotal <= 0) return setErr("Varighet må være minst 1 minutt.");

    const startIso = toISO(date, startTime);
    const endIso = addMinutes(startIso, durationTotal);

    const chosenTargets = allEnrolled
      ? enrolled.map((m) => String(m.id))
      : targetIds.map(String);

    if (!allEnrolled && chosenTargets.length === 0) {
      return setErr("Velg minst én person, eller huk av for “Alle påmeldte”.");
    }

    setSaving(true);

    // LS fallback snapshot (så du aldri mister økten)
    const lsSessionId = crypto?.randomUUID?.() ?? `s-${Date.now()}`;
    const lsSession: LsSession = {
      id: lsSessionId,
      activityId,
      title: title.trim() || "Økt",
      start: startIso,
      end: endIso,
      location: location.trim() || undefined,
      note: note.trim() || undefined,
      targets: allEnrolled ? undefined : chosenTargets,
    };

    try {
      // DB via server-endepunkt (leder-auth + service role), unngår RLS-feil i nettleserklient.
      const res = await fetch("/api/sessions/upsert", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          activity_id: activityId,
          title: lsSession.title,
          start_at: startIso,
          end_at: endIso,
          location: lsSession.location ?? null,
          note: lsSession.note ?? null,
          targets: chosenTargets,
        }),
      });

      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(String((json as any)?.error || `HTTP ${res.status}`));
      }

      const dbSessionId = String((json as any)?.id || "");
      if (!dbSessionId) {
        throw new Error("Manglet session-id fra server.");
      }

      // ✅ DB OK → speil også til LS for resten av portalen som fortsatt leser LS
      const map = readLsSessionsMap();
      const prev = map[activityId] ?? [];
      map[activityId] = [
        ...prev,
        {
          ...lsSession,
          id: dbSessionId, // bruk DB-id så link /sessions/[id] gir mening
        },
      ];
      writeLsSessionsMap(map);

      const cal = readLsCalendar();
      cal.push({
        id: crypto?.randomUUID?.() ?? `c-${Date.now()}`,
        activity_id: activityId,
        session_id: dbSessionId,
        title: lsSession.title,
        start: startIso,
        end: endIso,
      });
      writeLsCalendar(cal);

      setDbInfo(`Lagret i Supabase ✅ (${dbSessionId})`);

      // Gå til økt-side
      router.push(`/sessions/${encodeURIComponent(dbSessionId)}`);
    } catch (e: any) {
      // ❗ DB feilet → lagre lokalt så du ikke mister det
      const map = readLsSessionsMap();
      const prev = map[activityId] ?? [];
      map[activityId] = [...prev, lsSession];
      writeLsSessionsMap(map);

      const cal = readLsCalendar();
      cal.push({
        id: crypto?.randomUUID?.() ?? `c-${Date.now()}`,
        activity_id: activityId,
        session_id: lsSession.id,
        title: lsSession.title,
        start: startIso,
        end: endIso,
      });
      writeLsCalendar(cal);

      setErr(`DB-feil: ${String(e?.message ?? e)} (økt lagret lokalt som backup)`);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="mx-auto max-w-3xl px-4 py-8">
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight text-black">Ny økt</h1>
          <p className="mt-1 text-sm text-neutral-600">
            {activityName}
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={onSave}
            disabled={saving}
            className="rounded-lg bg-red-600 px-3.5 py-2 text-sm font-semibold text-white hover:bg-red-700 disabled:opacity-50"
          >
            {saving ? "Lagrer…" : "Lagre økt"}
          </button>
          <Link
            href={`/activities/${encodeURIComponent(activityId)}`}
            className="rounded-lg px-3.5 py-2 text-sm font-semibold text-neutral-900 ring-1 ring-neutral-300 hover:bg-neutral-900 hover:text-white"
          >
            Avbryt
          </Link>
        </div>
      </div>

      {err ? (
        <div className="mb-4 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800">
          {err}
        </div>
      ) : null}

      {dbInfo ? (
        <div className="mb-4 rounded-lg border border-green-200 bg-green-50 p-3 text-sm text-green-800">
          {dbInfo}
        </div>
      ) : null}

      <div className="space-y-5 rounded-2xl border border-neutral-200 bg-white p-5 shadow-sm">
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label className="text-sm font-medium text-neutral-800">Tittel</label>
            <input
              className={INPUT}
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="F.eks. Prøve, gjennomgang, forestilling…"
            />
          </div>

          <div>
            <label className="text-sm font-medium text-neutral-800">Dato</label>
            <input
              type="date"
              className={INPUT}
              value={date}
              onChange={(e) => setDate(e.target.value)}
            />
          </div>

          <div>
            <label className="text-sm font-medium text-neutral-800">Start</label>
            <input
              type="time"
              className={INPUT}
              value={startTime}
              onChange={(e) => setStartTime(e.target.value)}
            />
          </div>

          <div>
            <label className="text-sm font-medium text-neutral-800">Varighet</label>
            <div className="mt-1 grid grid-cols-2 gap-2">
              <select
                className={INPUT}
                value={durHours}
                onChange={(e) => setDurHours(Number(e.target.value))}
              >
                {Array.from({ length: 9 }).map((_, i) => (
                  <option key={i} value={i}>{i} t</option>
                ))}
              </select>

              <select
                className={INPUT}
                value={durMinutes}
                onChange={(e) => setDurMinutes(Number(e.target.value))}
              >
                {[0, 15, 30, 45].map((m) => (
                  <option key={m} value={m}>{m} min</option>
                ))}
              </select>
            </div>

            <div className="mt-1 text-xs text-neutral-500">
              {durationTotal > 0 ? `= ${minutesToLabel(durationTotal)}` : null}
            </div>
          </div>

          <div>
            <label className="text-sm font-medium text-neutral-800">Sted (valgfritt)</label>
            <input
              className={INPUT}
              value={location}
              onChange={(e) => setLocation(e.target.value)}
              placeholder="F.eks. Follies – Sal 1"
            />
          </div>
        </div>

        <div>
          <label className="text-sm font-medium text-neutral-800">Notat (valgfritt)</label>
          <textarea
            className={TEXTAREA + " min-h-[120px]"}
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="Kort info til deltakerne: hva skal vi gjøre, hva må de ta med, osv."
          />
        </div>

        {/* Målgruppe */}
        <div className="rounded-xl border border-neutral-200 bg-neutral-50 p-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <div className="text-sm font-semibold text-neutral-900">Hvem gjelder økten for?</div>
              <div className="mt-1 text-xs text-neutral-600">
                Velg “Alle påmeldte” eller velg spesifikke personer.
              </div>
            </div>

            <label className="flex items-center gap-2 text-sm font-medium text-neutral-800">
              <input
                type="checkbox"
                checked={allEnrolled}
                onChange={(e) => {
                  setAllEnrolled(e.target.checked);
                  if (e.target.checked) setTargetIds([]);
                }}
              />
              Alle påmeldte
            </label>
          </div>

          {!allEnrolled ? (
            <div className="mt-3 grid gap-2 sm:grid-cols-2">
              {enrolled.map((m) => {
                const mid = String(m.id);
                const checked = targetIds.includes(mid);
                return (
                  <label
                    key={mid}
                    className="flex items-center gap-2 rounded-lg border border-neutral-200 bg-white px-3 py-2 text-sm text-neutral-800"
                  >
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={() => toggleTarget(mid)}
                    />
                    <span className="truncate">{fullName(m)}</span>
                  </label>
                );
              })}
              {enrolled.length === 0 ? (
                <div className="text-sm text-neutral-600">
                  Fant ingen deltakere/ledere å velge – sjekk enrollments.
                </div>
              ) : null}
            </div>
          ) : null}
        </div>

        {/* Forhåndsvisning */}
        <div className="rounded-xl border border-neutral-200 bg-white p-4">
          <div className="text-sm font-semibold text-neutral-900">Forhåndsvisning</div>
          {preview ? (
            <div className="mt-2 text-sm text-neutral-700">
              <div className="font-medium text-neutral-900">{title.trim() || "Økt"}</div>
              <div className="mt-1">
                {fmtNb(preview.startIso)} – {new Date(preview.endIso).toLocaleTimeString("nb-NO")}
                {location.trim() ? <> · <span className="text-neutral-600">Sted:</span> {location.trim()}</> : null}
              </div>
              {!allEnrolled ? (
                <div className="mt-1 text-xs text-neutral-600">
                  Målgruppe: {targetIds.length} valgt
                </div>
              ) : (
                <div className="mt-1 text-xs text-neutral-600">
                  Målgruppe: alle påmeldte
                </div>
              )}
            </div>
          ) : (
            <div className="mt-2 text-sm text-neutral-500">Fyll inn dato + start + varighet for å se forhåndsvisning.</div>
          )}
        </div>
      </div>
    </div>
  );
}
