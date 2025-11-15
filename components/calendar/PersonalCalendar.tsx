"use client";

/**
 * Kalender – fullbredde, Apple-inspirert rutevisning + klikkbare økter
 *
 * • Fullbreddelayout styres av app/(protected)/calendar/page.tsx (full-bleed wrapper).
 * • Rutevisning:
 *    – Bredt grid (gap-1), kortere celler, dato øverst til høyre (Apple-stil)
 *    – Hendelse = prikk + klokkeslett (fet) + tittel (wrap, 2 linjer)
 *    – Maks 4 rader per rute (+ “+N til” når flere)
 * • Sidepanel (Valgt dag / Kommende) – uendret logikk
 * • Klikk:
 *    – Klikk på hendelse i ruten → hvis `session_id` finnes: router til /sessions/[id]
 *    – Sidepanel: “Gå til økt” vises når `session_id` finnes
 *
 * NB: All data/filtrering (Mine/Alle, avledede eventer) er identisk med din nåværende logikk.
 */

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createClientComponentClient } from "@/lib/supabase/browser";

/* ------------------------- Typer og LS-nøkler ------------------------- */

type AnyObj = Record<string, any>;
type CalItem = {
  id: string;
  member_id: string;
  title: string;
  start: string; // ISO
  end: string;   // ISO
  source?: "session" | "admin" | "event" | string;
  activity_id?: string;
  session_id?: string; // <-- nytt: for klikk til /sessions/[id]
};

type ActivityLite = {
  id: string;
  name: string;
  type?: string | null;
  start?: string | null;
  end?: string | null;
};

const CAL_LS   = "follies.calendar.v1";
const ENR_LS   = "follies.enrollments.v1";
const LS_ACT_V1 = "follies.activities.v1";
const LS_ACT_OLD = "follies.activities";
const LS_MEM_V1 = "follies.members.v1";
const LS_MEM_OLD = "follies.members";

const safeJSON = <T,>(s: string | null): T | null => { try { return s ? (JSON.parse(s) as T) : null; } catch { return null; } };

/* -------------------------- Readers / helpers -------------------------- */

function readCalendar(): CalItem[] {
  const raw = safeJSON<CalItem[]>(localStorage.getItem(CAL_LS)) ?? [];
  const norm = raw
    .filter(Boolean)
    .map((e, i) => ({
      id: String(e.id ?? `cal-${i}-${Math.random()}`),
      member_id: String(e.member_id ?? ""),
      title: String(e.title ?? "Hendelse"),
      start: String(e.start ?? new Date().toISOString()),
      end: String(e.end ?? new Date().toISOString()),
      source: (e.source as any) ?? "session",
      activity_id: e.activity_id ? String(e.activity_id) : undefined,
      session_id: e.session_id ? String(e.session_id) : undefined,
    }))
    .sort((a, b) => +new Date(a.start) - +new Date(b.start));
  return norm;
}

function readActivitiesLS(): ActivityLite[] {
  const v1  = safeJSON<any[]>(localStorage.getItem(LS_ACT_V1))  ?? [];
  const old = safeJSON<any[]>(localStorage.getItem(LS_ACT_OLD)) ?? [];
  const merged = [...old, ...v1];
  const out: ActivityLite[] = merged.map((a, i) => ({
    id: String(a?.id ?? a?.uuid ?? a?._id ?? `a-${i}`),
    name: String(a?.name ?? a?.title ?? a?.navn ?? `Aktivitet ${i}`),
    type: a?.type ?? a?.category ?? a?.kategori ?? null,
    start: a?.start ?? a?.start_at ?? null,
    end:   a?.end   ?? a?.end_at   ?? null,
  }));
  const map = new Map<string, ActivityLite>();
  for (const a of out) map.set(a.id, a);
  return Array.from(map.values());
}
function readActivitiesIndex(): Record<string, ActivityLite> {
  const idx: Record<string, ActivityLite> = {};
  for (const a of readActivitiesLS()) idx[a.id] = a;
  return idx;
}

function readMembersAll(): AnyObj[] {
  const v1 = safeJSON<any[]>(localStorage.getItem(LS_MEM_V1)) ?? [];
  const old = safeJSON<any[]>(localStorage.getItem(LS_MEM_OLD)) ?? [];
  const keyOf = (m: any) => String(m?.id ?? m?.uuid ?? m?.memberId ?? m?._id ?? "");
  const map = new Map<string, AnyObj>();
  for (const m of [...old, ...v1]) map.set(keyOf(m), m);
  return Array.from(map.values());
}

function memberIdByEmail(email: string | null | undefined, all: AnyObj[]): string | null {
  if (!email) return null;
  const e = email.toLowerCase();
  const hit = all.find((m) => {
    const cand = m.email || m.contact_email || m.mail || m.epost || m.primary_email || null;
    return cand && String(cand).toLowerCase() === e;
  }) || null;
  if (!hit) return null;
  return String(hit.id ?? hit.uuid ?? hit.memberId ?? hit._id ?? "");
}

function enrollForActivityFromLS(activityId: string): { leaders: string[]; participants: string[] } {
  const all = safeJSON<Record<string, { leaders?: string[]; participants?: string[] }>>(localStorage.getItem(ENR_LS)) ?? {};
  const cur = all[activityId] ?? { leaders: [], participants: [] };
  return {
    leaders: Array.from(new Set((cur.leaders ?? []).map(String))),
    participants: Array.from(new Set((cur.participants ?? []).map(String))),
  };
}

/* -------------------------- Avledede "eventer" -------------------------- */
/**
 * Lager midlertidige (ikke-persistente) kalender-elementer for activities.type='event'
 * der aktiviteten har start/end i LS og har påmeldte i enrollments (LS).
 * – Disse blandes inn i visningen (skrives ikke til LS).
 */
function deriveEventsFromActivities(): CalItem[] {
  const acts = readActivitiesLS().filter((a) => String(a.type ?? "").toLowerCase().includes("event"));
  const out: CalItem[] = [];
  for (const a of acts) {
    if (!a.start) continue; // minst start
    const start = new Date(a.start);
    const end   = a.end ? new Date(a.end) : new Date(start.getTime() + 60 * 60000);
    const enr   = enrollForActivityFromLS(String(a.id));
    const targets = Array.from(new Set<string>([...enr.participants, ...enr.leaders]));
    for (const mid of targets) {
      out.push({
        id: `derived-event-${a.id}-${mid}-${a.start}`,
        member_id: String(mid),
        title: a.name,
        start: start.toISOString(),
        end: end.toISOString(),
        source: "event",
        activity_id: a.id,
      });
    }
  }
  return out;
}

/* --------------------------- Fargekoder / stil --------------------------- */

type Kind = "forestilling" | "event" | "offer" | "admin" | "personal" | "unknown";

/** Bestem type på kalender-element via activity.type eller source */
function kindFor(e: CalItem, actIndex: Record<string, ActivityLite>): Kind {
  const t = (e.activity_id && actIndex[e.activity_id]?.type) ? String(actIndex[e.activity_id]!.type).toLowerCase() : "";
  if (t.includes("forest")) return "forestilling";
  if (t.includes("event"))  return "event";
  if (t.includes("offer") || t.includes("tilbud")) return "offer";
  const s = String(e.source ?? "").toLowerCase();
  if (s === "admin")   return "admin";
  if (s === "session") return e.activity_id ? "offer" : "personal";
  return "unknown";
}

function dotColor(kind: Kind) {
  switch (kind) {
    case "forestilling": return "bg-violet-600";
    case "event":        return "bg-blue-600";
    case "offer":        return "bg-red-600";
    case "admin":        return "bg-neutral-900";
    case "personal":     return "bg-neutral-500";
    default:             return "bg-neutral-400";
  }
}

/* --------------------------- Dato/grid helpers --------------------------- */

function yyyymmddLocal(d: Date) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}
function groupByDateLocal(items: CalItem[]): Record<string, CalItem[]> {
  const out: Record<string, CalItem[]> = {};
  for (const it of items) {
    const d = new Date(it.start);
    const key = yyyymmddLocal(d);
    (out[key] ||= []).push(it);
  }
  return out;
}
function monthLabel(d: Date) {
  return d.toLocaleDateString("nb-NO", { month: "long", year: "numeric" });
}
function fmtDateLong(dateIso: string) {
  const d = new Date(dateIso);
  return d.toLocaleDateString("nb-NO", { weekday: "long", day: "2-digit", month: "long", year: "numeric" });
}
function fmtTime(dateIso: string) {
  const d = new Date(dateIso);
  return d.toLocaleTimeString("nb-NO", { hour: "2-digit", minute: "2-digit" });
}
function buildMonthGrid(viewBase: Date): Date[] {
  const first = new Date(viewBase.getFullYear(), viewBase.getMonth(), 1);
  const day = first.getDay(); // 0= søn ... 6=lør
  const daysToMonday = (day + 6) % 7; // mandag-start
  const start = new Date(first);
  start.setDate(first.getDate() - daysToMonday);
  const days: Date[] = [];
  for (let i = 0; i < 42; i++) {
    const d = new Date(start);
    d.setDate(start.getDate() + i);
    days.push(d);
  }
  return days;
}
const WEEKDAYS = ["Man", "Tir", "Ons", "Tor", "Fre", "Lør", "Søn"];
function isSameDay(a: Date, b: Date) { return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate(); }

/* -------------------------------- Komponent ------------------------------- */

export default function PersonalCalendar() {
  const router = useRouter();
  const supabase = createClientComponentClient();

  // identitet
  const [loading, setLoading] = useState(true);
  const [meMemberId, setMeMemberId] = useState<string | null>(null);
  const [meError, setMeError] = useState<string | null>(null);
  const [isAdmin, setIsAdmin] = useState<boolean>(false);

  // kalenderdata
  const [allEventsLS, setAllEventsLS] = useState<CalItem[]>([]);
  const [showMine, setShowMine] = useState(true); // kun admin kan toggle
  const [search, setSearch] = useState("");

  const [monthOffset, setMonthOffset] = useState(0);
  const [selectedDay, setSelectedDay] = useState<string | null>(yyyymmddLocal(new Date()));
  const [rightTab, setRightTab] = useState<"day" | "upcoming">("day");

  const today = new Date();
  const lastJsonRef = useRef<string>("");

  const membersAll = useMemo(() => readMembersAll(), []);
  const actIndex   = useMemo(() => readActivitiesIndex(), []);

  // init auth + kal
  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        setLoading(true);
        let myId: string | null = null;

        try {
          const { data } = await supabase.auth.getUser();
          const email = data?.user?.email ?? null;
          myId = memberIdByEmail(email, membersAll);
          setIsAdmin((data?.user?.app_metadata?.role || "").toString().toLowerCase() === "admin");
        } catch {}

        if (!alive) return;
        setMeMemberId(myId);
        if (!myId) setMeError("Fant ingen medlem knyttet til din e-post. 'Mine' filtrerer når bruker er koblet til et medlem.");

        const list = readCalendar();
        setAllEventsLS(list);
        lastJsonRef.current = JSON.stringify(list);
      } finally {
        if (alive) setLoading(false);
      }
    })();

    const onStorage = () => {
      const list = readCalendar();
      setAllEventsLS(list);
      lastJsonRef.current = JSON.stringify(list);
    };
    window.addEventListener("storage", onStorage);

    const poll = setInterval(() => {
      try {
        const list = readCalendar();
        const cur = JSON.stringify(list);
        if (cur !== lastJsonRef.current) {
          setAllEventsLS(list);
          lastJsonRef.current = cur;
        }
      } catch {}
    }, 600);

    return () => {
      window.removeEventListener("storage", onStorage);
      clearInterval(poll);
      alive = false;
    };
  }, [supabase, membersAll]);

  // bland inn avledede event-aktiviteter (type='event' med start/end) for påmeldte
  const allEventsMixed = useMemo(() => {
    const derived = deriveEventsFromActivities();
    return [...allEventsLS, ...derived].sort((a, b) => +new Date(a.start) - +new Date(b.start));
  }, [allEventsLS]);

  // filtrering
  const filteredBase = useMemo(() => {
    const q = search.trim().toLowerCase();
    let list = allEventsMixed;

    // Vanlig bruker: alltid "Mine". Admin: kan vise alle.
    if (meMemberId && (showMine || !isAdmin)) {
      list = list.filter((e) => String(e.member_id) === String(meMemberId));
    }
    if (q) list = list.filter((e) => e.title.toLowerCase().includes(q));

    return list;
  }, [allEventsMixed, showMine, meMemberId, search, isAdmin]);

  const grouped = useMemo(() => groupByDateLocal(filteredBase), [filteredBase]);

  if (loading) {
    return (
      <main className="w-full px-3 sm:px-6 py-6 text-neutral-900">
        <h1 className="text-2xl font-semibold">Kalender</h1>
        <p className="mt-3 text-neutral-700">Laster kalender…</p>
      </main>
    );
  }

  const viewBase = new Date(today.getFullYear(), today.getMonth() + monthOffset, 1);
  const days     = buildMonthGrid(viewBase);
  const selectedEvents = selectedDay ? (grouped[selectedDay] ?? []) : [];
  const upcomingKeys   = Object.keys(grouped).filter((k) => +new Date(k) >= +new Date(yyyymmddLocal(today))).sort();
  const upcomingFlat   = upcomingKeys.flatMap((k) => (grouped[k] ?? []).map((e) => ({ key: k, e })));

  const MAX_ROWS = 4; // brede ruter → fire linjer holder fint

  return (
    <div className="bg-neutral-50 w-full">
      <main className="w-full px-3 sm:px-6 py-6 text-neutral-900">
        {/* HERO */}
        <div
          className="rounded-2xl border border-black/10 p-4 shadow-md md:p-5"
          style={{ background: "linear-gradient(90deg,#6b0f1a 0%,#b91c1c 50%,#dc2626 100%)" }}
        >
          <div className="flex items-center justify-between gap-3">
            <div>
              <h1 className="text-2xl md:text-3xl font-semibold tracking-tight text-white">Kalender</h1>
              <p className="mt-0.5 text-xs md:text-sm text-white/90">
                Månedsvisning + sidepanel. {(!isAdmin || showMine) ? "Mine hendelser" : "Alle hendelser"}
                {search.trim() ? " · Søk aktiv" : ""}
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              {isAdmin && (
                <button
                  onClick={() => setShowMine((v) => !v)}
                  className="rounded-lg bg-white/15 px-3 py-1.5 text-sm font-semibold text-white ring-1 ring-white/40 hover:bg-white/25"
                  title={meError || undefined}
                >
                  {showMine ? "Vis alle" : "Vis mine"}
                </button>
              )}
            </div>
          </div>
        </div>

        {/* Verktøylinje */}
        <div className="mt-4 flex flex-col md:flex-row md:items-center md:justify-between gap-3">
          <div className="flex items-center gap-2 text-sm">
            <button onClick={() => setMonthOffset((o) => o - 1)} className="rounded-lg bg-white px-3 py-1.5 ring-1 ring-neutral-200 shadow-sm hover:bg-neutral-50">← Forrige</button>
            <div className="rounded-lg bg-white px-3 py-1.5 ring-1 ring-neutral-200 shadow-sm font-medium">{monthLabel(viewBase)}</div>
            <button onClick={() => setMonthOffset((o) => o + 1)} className="rounded-lg bg-white px-3 py-1.5 ring-1 ring-neutral-200 shadow-sm hover:bg-neutral-50">Neste →</button>
            <button onClick={() => { setMonthOffset(0); setSelectedDay(yyyymmddLocal(new Date())); }} className="rounded-lg bg-white px-3 py-1.5 ring-1 ring-neutral-200 shadow-sm hover:bg-neutral-50">I dag</button>
          </div>

          <div className="flex items-center gap-2">
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Søk i titler…"
              className="w-full md:w-72 rounded-lg bg-white text-neutral-900 px-3 py-2 border border-neutral-300 focus:outline-none focus:border-red-600"
            />
          </div>
        </div>

        {/* Fullbreddelayout: venstre = kalender, høyre = 360px sidepanel */}
        <div className="mt-4 grid grid-cols-1 xl:[grid-template-columns:minmax(0,1fr)_360px] gap-4 w-full">
          {/* Venstre: månedsgitter */}
          <section className="rounded-2xl border border-zinc-200 bg-white p-3 shadow-sm md:p-4">
            {/* Ukedager */}
            <div className="grid grid-cols-7 gap-1 text-[12px] md:text-[13px] font-semibold text-neutral-700 px-1">
              {WEEKDAYS.map((w) => (<div key={w} className="text-center">{w}</div>))}
            </div>

            {/* Dager – mindre gap → bredere ruter */}
            <div className="mt-2 grid grid-cols-7 gap-1">
              {days.map((d) => {
                const key = yyyymmddLocal(d);
                const inMonth = d.getMonth() === viewBase.getMonth();
                const isToday = isSameDay(d, today);
                const events   = grouped[key] ?? [];
                const rows     = events.slice(0, MAX_ROWS);
                const more     = events.length - rows.length;
                const selected = selectedDay === key;

                return (
                  <button
                    key={key}
                    onClick={() => { setSelectedDay(key); setRightTab("day"); }}
                    className={`group relative min-h-[120px] md:min-h-[140px] lg:min-h-[160px] rounded-xl border px-2.5 py-2 text-left transition ${
                      inMonth ? "bg-white border-neutral-300" : "bg-neutral-100 border-neutral-300/60"
                    } ${selected ? "ring-2 ring-red-600 shadow" : "hover:border-red-400 hover:shadow-sm"}`}
                    style={{ boxShadow: selected ? "0 2px 10px rgba(0,0,0,0.06)" : undefined }}
                  >
                    {/* Dato i øvre høyre hjørne */}
                    <div className="absolute right-2 top-2 text-xs md:text-sm font-semibold text-neutral-900 opacity-80">
                      {d.getDate()}
                    </div>
                    {/* "I dag"-prikk i øvre venstre */}
                    {isToday && <span className="absolute left-2 top-2 inline-block h-2.5 w-2.5 rounded-full bg-red-600" title="I dag" />}

                    {/* Hendelser: prikk + klokke + tittel (2 linjer) – KLIKKBAR hvis session_id */}
                    <div className="mt-6 space-y-1">
                      {rows.map((e) => {
                        const k = kindFor(e, actIndex);
                        const dot = dotColor(k);
                        return (
                          <button
                            key={e.id}
                            onClick={(ev) => {
                              ev.stopPropagation();
                              if (e.session_id) router.push(`/sessions/${encodeURIComponent(String(e.session_id))}`);
                            }}
                            className="w-full rounded px-1.5 py-1 text-left hover:bg-neutral-50"
                            title={`${fmtTime(e.start)} · ${e.title}`}
                          >
                            <div className="flex items-start gap-1.5">
                              <span className={`mt-[3px] inline-block h-2 w-2 rounded-full ${dot}`} />
                              <div className="min-w-0">
                                <div className="text-[12px] font-semibold leading-4">{fmtTime(e.start)}</div>
                                <div
                                  className="text-[12px] text-neutral-800 leading-4"
                                  style={{
                                    display: "-webkit-box",
                                    WebkitLineClamp: 2,
                                    WebkitBoxOrient: "vertical",
                                    overflow: "hidden",
                                  }}
                                >
                                  {e.title}
                                </div>
                              </div>
                            </div>
                          </button>
                        );
                      })}
                      {more > 0 && (
                        <div
                          className="text-[11px] text-neutral-500 hover:text-neutral-800 cursor-pointer"
                          onClick={(ev) => { ev.stopPropagation(); setSelectedDay(key); setRightTab("day"); }}
                          title="Vis flere for denne dagen"
                        >
                          +{more} til
                        </div>
                      )}
                    </div>
                  </button>
                );
              })}
            </div>
          </section>

          {/* Høyre: panel (Valgt dag / Kommende) */}
          <aside className="rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm">
            <SidePanel
              selectedDay={selectedDay}
              selectedEvents={selectedEvents}
              upcomingFlat={upcomingFlat}
              actIndex={actIndex}
              onOpenSession={(sid) => router.push(`/sessions/${encodeURIComponent(String(sid))}`)}
            />
          </aside>
        </div>
      </main>
    </div>
  );
}

/* --------------------------- Sidepanel --------------------------- */

function SidePanel({
  selectedDay,
  selectedEvents,
  upcomingFlat,
  actIndex,
  onOpenSession,
}:{
  selectedDay: string | null;
  selectedEvents: CalItem[];
  upcomingFlat: { key: string; e: CalItem }[];
  actIndex: Record<string, ActivityLite>;
  onOpenSession: (sid: string) => void;
}) {
  const fmtDateLong = (iso: string) => new Date(iso).toLocaleDateString("nb-NO", { weekday: "long", day: "2-digit", month: "long", year: "numeric" });
  const fmtTime = (iso: string) => new Date(iso).toLocaleTimeString("nb-NO", { hour: "2-digit", minute: "2-digit" });

  const renderItem = (e: CalItem, withDate?: string) => {
    const k = kindFor(e, actIndex);
    const badge =
      k === "offer" ? "bg-red-50 text-red-800 ring-red-200" :
      k === "event" ? "bg-blue-50 text-blue-800 ring-blue-200" :
      k === "forestilling" ? "bg-violet-50 text-violet-800 ring-violet-200" :
      k === "admin" ? "bg-neutral-900 text-white ring-neutral-700" :
      "bg-neutral-100 text-neutral-800 ring-neutral-300";
    return (
      <li key={e.id} className="py-3 flex items-start justify-between gap-3">
        <div className="min-w-0">
          {withDate ? <div className="text-xs text-neutral-500">{withDate}</div> : null}
          <span className={`inline-flex items-center gap-2 rounded-full px-2 py-0.5 text-[11px] ring-1 ${badge}`}>
            {k === "offer" ? "Tilbud" : k === "event" ? "Event" : k === "forestilling" ? "Forestilling" : k === "admin" ? "Admin" : "Personlig"}
          </span>
          <div className="mt-1 text-sm text-neutral-600">{fmtTime(e.start)} – {fmtTime(e.end)}</div>
          <div className="mt-0.5 text-[15px] font-medium text-neutral-900 break-words">{e.title}</div>

          {/* Lenker */}
          <div className="mt-0.5 flex flex-wrap items-center gap-2">
            {e.activity_id ? (
              <Link href={`/activities/${e.activity_id}`} className="text-sm text-red-700 hover:text-red-800 underline underline-offset-2">
                Gå til aktivitet
              </Link>
            ) : null}
            {e.session_id ? (
              <button
                onClick={() => onOpenSession(e.session_id!)}
                className="text-sm text-red-700 hover:text-red-800 underline underline-offset-2"
              >
                Gå til økt
              </button>
            ) : null}
          </div>
        </div>
      </li>
    );
  };

  const selected =
    selectedEvents.length === 0 ? (
      <div className="mt-2 text-neutral-700">Ingen hendelser.</div>
    ) : (
      <ul className="mt-2 divide-y divide-neutral-200">
        {selectedEvents.slice().sort((a, b) => +new Date(a.start) - +new Date(b.start)).map((e) => renderItem(e))}
      </ul>
    );

  const upcoming =
    upcomingFlat.length === 0 ? (
      <div className="text-neutral-700">Ingen kommende hendelser.</div>
    ) : (
      <ul className="divide-y divide-neutral-200">
        {upcomingFlat.map(({ key, e }) => renderItem(e, fmtDateLong(key)))}
      </ul>
    );

  const [tab, setTab] = useState<"day" | "upcoming">("day");

  useEffect(() => { setTab("day"); }, [selectedDay]);

  return (
    <>
      <div className="flex items-center justify-between">
        <div className="flex gap-2">
          <button onClick={() => setTab("day")} className={`rounded-md px-3 py-1.5 text-sm font-semibold ${tab === "day" ? "bg-red-600 text-white" : "bg-neutral-100 text-neutral-800 hover:bg-neutral-200"}`}>Valgt dag</button>
          <button onClick={() => setTab("upcoming")} className={`rounded-md px-3 py-1.5 text-sm font-semibold ${tab === "upcoming" ? "bg-red-600 text-white" : "bg-neutral-100 text-neutral-800 hover:bg-neutral-200"}`}>Kommende</button>
        </div>
      </div>

      <div className="mt-3">
        {tab === "day"
          ? (<><div className="text-xs text-neutral-600">{selectedDay ? new Date(selectedDay).toLocaleDateString("nb-NO", { weekday: "long", day: "2-digit", month: "long", year: "numeric" }) : "Ingen dato valgt"}</div>{selected}</>)
          : upcoming}
      </div>
    </>
  );
}
