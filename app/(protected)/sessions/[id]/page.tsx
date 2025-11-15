// SNAPSHOT: 2025-09-07 – Follies Ansattportal
// Fiks: Duplikate påminnelser på dashboard etter “Send påminnelse”
// Tiltak (kun logikk, ingen designendring):
//  1) Dedup ved lagring i follies.reminders.v1 (unik på {to_member_id, session_id, title})
//  2) Klikk-vern (sending-guard) så knappen ikke kan trigges 2 ganger raskt

"use client";

import { useEffect, useMemo, useState, useRef } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { createClientComponentClient } from "@/lib/supabase/browser";

/** ---------- Typer ---------- */
type UUID = string;
type Role = "leader" | "participant";
type Member = { id: UUID; first_name: string; last_name: string; email?: string | null };

type CalendarItem = {
  id: UUID;
  member_id: UUID;
  title: string;
  start: string;
  end: string;
  source: "session";
  activity_id: UUID;
  session_id: UUID;
};

type RawMember = {
  id?: any;
  first_name?: any;
  last_name?: any;
  email?: any;
};

type EnrollmentRow = { member?: RawMember | RawMember[] | null };

/** ---------- LS-nøkler ---------- */
const LS_CAL_V1 = "follies.calendar.v1";
const LS_CAL_FALLBACK = "follies.calendar";
const LS_ENR_V1 = "follies.enrollments.v1";
const LS_MEM_V1 = "follies.members.v1";
const LS_REM_V1 = "follies.reminders.v1";

/** ---------- Utils ---------- */
const safeJSON = <T,>(s: string | null, fb: T): T => {
  try { return s ? (JSON.parse(s) as T) : fb; } catch { return fb; }
};
const readLS = <T,>(key: string, fb: T) => (typeof window === "undefined" ? fb : safeJSON<T>(localStorage.getItem(key), fb));
const writeLS = (key: string, value: any) => { try { localStorage.setItem(key, JSON.stringify(value)); } catch {} };
const S = (v: any) => String(v ?? "");

const normalizeMember = (value: RawMember | null | undefined): Member | null => {
  if (!value) return null;
  const id = S(value.id);
  if (!id) return null;
  return {
    id,
    first_name: S(value.first_name),
    last_name: S(value.last_name),
    email: value.email != null ? String(value.email) : null,
  };
};

const rowsToMembers = (rows: EnrollmentRow[] | null | undefined): Member[] => {
  if (!Array.isArray(rows)) return [];
  const out: Member[] = [];
  for (const row of rows) {
    const raw = Array.isArray(row?.member) ? row?.member?.[0] : row?.member;
    const member = normalizeMember(raw ?? null);
    if (member) out.push(member);
  }
  return out;
};

/** ---------- Side ---------- */
export default function SessionProfilePage() {
  const supabase = createClientComponentClient();
  const params = useParams<{ id: string }>();
  const sessionId = params?.id as UUID;

  const [meta, setMeta] = useState<{
    activity_id: UUID | null;
    title: string | null;
    startISO: string | null;
    endISO: string | null;
    note?: string | null;
    targets?: string[] | null;
  }>({ activity_id: null, title: null, startISO: null, endISO: null, note: null, targets: null });

  const [leaders, setLeaders] = useState<Member[]>([]);
  const [participants, setParticipants] = useState<Member[]>([]);
  const [sending, setSending] = useState(false); // ← klikk-vern

  /** ------ Slå opp økt via kalenderen (fra LS) ------ */
  useEffect(() => {
    // Finn en hvilken som helst kalender-entry med denne session_id
    const calAll = readLS<CalendarItem[]>(LS_CAL_V1, []);
    const any = calAll.find((c) => c.session_id === sessionId);
    if (!any) return;

    // Forsøk også å hente økten fra sessions-LS for note/targets (best effort)
    const map = readLS<Record<string, any[]>>("follies.activitySessions.v1", {});
    let note: string | null = null;
    let targets: string[] | null = null;
    outer: for (const arr of Object.values(map)) {
      for (const s of arr) {
        if (S(s?.id) === S(sessionId)) {
          note = s?.note ?? null;
          targets = Array.isArray(s?.targets) ? s.targets.map(S) : null;
          break outer;
        }
      }
    }

    setMeta({
      activity_id: any.activity_id,
      title: any.title,
      startISO: any.start,
      endISO: any.end,
      note,
      targets,
    });
  }, [sessionId]);

  /** ------ Hent rolle-lister DB-først (fall tilbake til LS) ------ */
  useEffect(() => {
    (async () => {
      if (!meta.activity_id) return;
      const actId = meta.activity_id;

      // DB: ledere
      const { data: leadRows, error: leadErr } = await supabase
        .from("enrollments")
        .select("member:members(id,first_name,last_name,email)")
        .eq("activity_id", actId)
        .eq("role", "leader");

      // DB: deltakere
      const { data: partRows, error: partErr } = await supabase
        .from("enrollments")
        .select("member:members(id,first_name,last_name,email)")
        .eq("activity_id", actId)
        .eq("role", "participant");

      if (!leadErr && Array.isArray(leadRows)) {
        const ls = rowsToMembers(leadRows);
        setLeaders(ls);
      } else {
        // LS fallback for ledere
        const enrArr = readLS<any[]>(LS_ENR_V1, []);
        const memIdx = Object.fromEntries(readLS<Member[]>(LS_MEM_V1, []).map(m => [S(m.id), m]));
        const ids = new Set<string>();
        for (const r of enrArr) if (S(r?.activity_id) === S(actId) && String(r?.role).toLowerCase().startsWith("lead")) ids.add(S(r?.member_id));
        setLeaders(Array.from(ids).map(id => memIdx[id]).filter(Boolean));
      }

      if (!partErr && Array.isArray(partRows)) {
        const ps = rowsToMembers(partRows);
        setParticipants(ps);
      } else {
        // LS fallback for deltakere (ekskl. ledere)
        const enrArr = readLS<any[]>(LS_ENR_V1, []);
        const memIdx = Object.fromEntries(readLS<Member[]>(LS_MEM_V1, []).map(m => [S(m.id), m]));
        const leadersSet = new Set(leaders.map(m => S(m.id)));
        const ids = new Set<string>();
        for (const r of enrArr) {
          if (S(r?.activity_id) !== S(actId)) continue;
          const role = String(r?.role ?? "").toLowerCase();
          const mid = S(r?.member_id);
          if (role !== "leader" && role !== "leder" && !leadersSet.has(mid)) ids.add(mid);
        }
        setParticipants(Array.from(ids).map(id => memIdx[id]).filter(Boolean));
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [meta.activity_id, supabase]);

  const startStr = useMemo(() => (meta.startISO ? new Date(meta.startISO).toLocaleString() : "—"), [meta.startISO]);
  const endStr = useMemo(() => (meta.endISO ? new Date(meta.endISO).toLocaleTimeString() : "—"), [meta.endISO]);

  /** ------ SIKKER lagring av påminnelser (dedup + klikk-vern) ------ */
  function sendReminder() {
    if (!meta.activity_id || !meta.title) return;
    if (sending) return; // klikk-vern
    setSending(true);

    try {
      const targets = Array.isArray(meta.targets) && meta.targets.length
        ? meta.targets
        : [...leaders, ...participants].map(m => S(m.id));

      if (!targets.length) { alert("Ingen mottakere for påminnelsen."); setSending(false); return; }

      // Les eksisterende
      const cur = readLS<any[]>(LS_REM_V1, []);
      const keyOf = (r: any) => `${S(r?.to_member_id)}::${S(r?.session_id)}::${S(r?.title)}`;

      const existingKeys = new Set(cur.map(keyOf));

      // Bygg batch
      const whenText = meta.startISO ? new Date(meta.startISO).toLocaleString("nb-NO") : "";
      const batch = targets.map((mid: string) => ({
        id: crypto.randomUUID(),
        to_member_id: S(mid),
        title: `Påminnelse: ${meta.title}`,
        note: meta.note ? String(meta.note) : (whenText ? `Husk økten ${whenText}` : "Husk økten"),
        created_at: new Date().toISOString(),
        activity_id: S(meta.activity_id),
        session_id: S(sessionId),
      }));

      // Filtrer bort duplikater (samme mottaker + samme økt + samme tittel)
      const unique = batch.filter((r) => !existingKeys.has(keyOf(r)));
      if (unique.length === 0) {
        alert("Påminnelsen finnes allerede for alle mottakere.");
        setSending(false);
        return;
      }

      // Skriv forrest (nyeste øverst)
      const next = [...unique, ...cur];
      writeLS(LS_REM_V1, next);

      alert(`Påminnelse sendt til ${unique.length} mottaker${unique.length === 1 ? "" : "e"}.`);
    } catch (e: any) {
      alert(e?.message || "Klarte ikke å sende påminnelse.");
    } finally {
      setSending(false);
    }
  }

  return (
    <main className="max-w-4xl mx-auto px-4 py-6">
      <h1 className="text-2xl font-bold">Økt</h1>

      <div className="mt-4 grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="md:col-span-2 rounded-xl border border-neutral-200 p-4">
          <div className="text-sm text-neutral-500">Tittel</div>
          <div className="text-base">{meta.title ?? "—"}</div>

          <div className="mt-4 grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <div className="text-sm text-neutral-500">Start</div>
              <div className="text-base">{startStr}</div>
            </div>
            <div>
              <div className="text-sm text-neutral-500">Slutt</div>
              <div className="text-base">{endStr}</div>
            </div>
          </div>
        </div>

        <div className="rounded-xl border border-neutral-200 p-4">
          <div className="text-sm text-neutral-500">Aktivitet</div>
          <div className="text-base">{meta.activity_id ?? "—"}</div>
        </div>
      </div>

      <section className="mt-6 rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm">
        <h2 className="text-lg font-semibold text-neutral-900">Plan / beskrivelse</h2>
        <div className="mt-2 text-[15px] text-neutral-900 whitespace-pre-line">
          {meta.note ? meta.note : "Ingen plan er lagt inn."}
        </div>
      </section>

      <section className="mt-6 rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold text-neutral-900">Ledere & deltakere</h2>
          <div className="flex items-center gap-2">
            <Link href={`/activities/${encodeURIComponent(S(meta.activity_id))}`} className="rounded-md bg-white px-3 py-1.5 text-sm font-semibold text-neutral-900 ring-1 ring-neutral-300 hover:bg-neutral-100">
              Gå til aktivitet
            </Link>
            <button
              onClick={sendReminder}
              disabled={sending}
              className="rounded-md bg-black px-3 py-1.5 text-sm font-semibold text-white hover:bg-neutral-800 disabled:opacity-60"
              title="Send påminnelse"
            >
              {sending ? "Sender…" : "Send påminnelse"}
            </button>
          </div>
        </div>

        <div className="mt-4 grid grid-cols-1 md:grid-cols-2 gap-6">
          <PeopleList title="Ledere" people={leaders} />
          <PeopleList title="Deltakere" people={participants} />
        </div>
      </section>
    </main>
  );
}

function PeopleList({ title, people }:{ title:string; people:Member[] }) {
  const S = (v:any)=>String(v ?? "");
  return (
    <div>
      <div className="flex items-center justify-between">
        <h3 className="text-base font-semibold text-neutral-900">{title}</h3>
        <span className="inline-flex items-center rounded-full bg-black/85 px-2.5 py-0.5 text-xs font-semibold text-white">
          {people.length}
        </span>
      </div>
      {people.length === 0 ? (
        <div className="mt-2 text-neutral-700">Ingen.</div>
      ) : (
        <ul className="mt-3 divide-y divide-neutral-200">
          {people.map((m) => {
            const name = `${m.first_name || ""} ${m.last_name || ""}`.trim() || "Uten navn";
            const email= m.email || null;
            return (
              <li key={S(m.id)} className="py-2">
                <div className="font-medium text-neutral-900 truncate">{name}</div>
                <div className="text-xs text-neutral-700">{email || "—"}</div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
