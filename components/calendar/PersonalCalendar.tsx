"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

type AnyObj = Record<string, any>;

type CalItem = {
  id: string;
  member_id: string;
  title: string;
  start: string;
  end: string;
  source: "session" | "manual" | "fallback" | string;
  activity_id?: string;
  session_id?: string;
  note?: string | null;
};

type ActivityLite = {
  id: string;
  name: string;
  type?: string | null;
};

const CAL_LS = "follies.calendar.v1";
const LS_ACT_V1 = "follies.activities.v1";
const LS_ACT_OLD = "follies.activities";

const safeJSON = <T,>(s: string | null): T | null => {
  try {
    return s ? (JSON.parse(s) as T) : null;
  } catch {
    return null;
  }
};

function readCalendarFallback(): CalItem[] {
  const raw = safeJSON<AnyObj[]>(localStorage.getItem(CAL_LS)) ?? [];
  return raw
    .map((item, index) => {
      const start = String(item?.start ?? item?.start_at ?? "");
      const end = String(item?.end ?? item?.end_at ?? start);
      if (!start) return null;
      return {
        id: String(item?.id ?? `fallback-${index}`),
        member_id: String(item?.member_id ?? ""),
        title: String(item?.title ?? "Hendelse"),
        start,
        end,
        source: "fallback",
        activity_id: item?.activity_id ? String(item.activity_id) : undefined,
        session_id: item?.session_id ? String(item.session_id) : undefined,
        note: typeof item?.note === "string" ? item.note : null,
      } as CalItem;
    })
    .filter(Boolean) as CalItem[];
}

function readActivitiesIndex(): Record<string, ActivityLite> {
  const old = safeJSON<AnyObj[]>(localStorage.getItem(LS_ACT_OLD)) ?? [];
  const v1 = safeJSON<AnyObj[]>(localStorage.getItem(LS_ACT_V1)) ?? [];
  const map: Record<string, ActivityLite> = {};

  for (const item of [...old, ...v1]) {
    const id = String(item?.id ?? item?.uuid ?? item?._id ?? "");
    if (!id) continue;
    map[id] = {
      id,
      name: String(item?.name ?? item?.title ?? item?.navn ?? "Aktivitet"),
      type: item?.type ?? item?.category ?? null,
    };
  }

  return map;
}

function yyyymmddLocal(date: Date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function groupByDateLocal(items: CalItem[]): Record<string, CalItem[]> {
  const out: Record<string, CalItem[]> = {};
  for (const item of items) {
    const key = yyyymmddLocal(new Date(item.start));
    (out[key] ||= []).push(item);
  }
  return out;
}

function monthLabel(d: Date) {
  return d.toLocaleDateString("nb-NO", { month: "long", year: "numeric" });
}

function fmtDateLong(dateIso: string) {
  const d = new Date(dateIso);
  return d.toLocaleDateString("nb-NO", {
    weekday: "long",
    day: "2-digit",
    month: "long",
    year: "numeric",
  });
}

function fmtTime(dateIso: string) {
  const d = new Date(dateIso);
  return d.toLocaleTimeString("nb-NO", { hour: "2-digit", minute: "2-digit" });
}

function buildMonthGrid(viewBase: Date): Date[] {
  const first = new Date(viewBase.getFullYear(), viewBase.getMonth(), 1);
  const day = first.getDay();
  const daysToMonday = (day + 6) % 7;
  const start = new Date(first);
  start.setDate(first.getDate() - daysToMonday);

  const days: Date[] = [];
  for (let i = 0; i < 42; i += 1) {
    const d = new Date(start);
    d.setDate(start.getDate() + i);
    days.push(d);
  }
  return days;
}

const WEEKDAYS = ["Man", "Tir", "Ons", "Tor", "Fre", "Lør", "Søn"];

function isSameDay(a: Date, b: Date) {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

function toDatetimeLocal(date: Date) {
  const pad = (v: number) => String(v).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function fromDatetimeLocal(value: string): string | null {
  if (!value) return null;
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString();
}

type Kind = "forestilling" | "event" | "offer" | "manual" | "fallback" | "unknown";

function kindFor(item: CalItem, activities: Record<string, ActivityLite>): Kind {
  const t =
    item.activity_id && activities[item.activity_id]?.type
      ? String(activities[item.activity_id]?.type).toLowerCase()
      : "";

  if (item.source === "manual") return "manual";
  if (item.source === "fallback") return "fallback";
  if (t.includes("forest")) return "forestilling";
  if (t.includes("event")) return "event";
  if (t.includes("offer") || t.includes("tilbud")) return "offer";
  if (item.source === "session") return "offer";
  return "unknown";
}

function dotColor(kind: Kind) {
  switch (kind) {
    case "forestilling":
      return "bg-violet-600";
    case "event":
      return "bg-blue-600";
    case "offer":
      return "bg-red-600";
    case "manual":
      return "bg-emerald-600";
    case "fallback":
      return "bg-neutral-400";
    default:
      return "bg-neutral-500";
  }
}

function badgeClass(kind: Kind) {
  switch (kind) {
    case "forestilling":
      return "bg-violet-50 text-violet-800 ring-violet-200";
    case "event":
      return "bg-blue-50 text-blue-800 ring-blue-200";
    case "offer":
      return "bg-red-50 text-red-800 ring-red-200";
    case "manual":
      return "bg-emerald-50 text-emerald-800 ring-emerald-200";
    case "fallback":
      return "bg-neutral-100 text-neutral-800 ring-neutral-300";
    default:
      return "bg-neutral-100 text-neutral-800 ring-neutral-300";
  }
}

function badgeLabel(kind: Kind) {
  switch (kind) {
    case "forestilling":
      return "Forestilling";
    case "event":
      return "Event";
    case "offer":
      return "Tilbud";
    case "manual":
      return "Manuell";
    case "fallback":
      return "Lokal";
    default:
      return "Hendelse";
  }
}

export default function PersonalCalendar() {
  const router = useRouter();

  const [loading, setLoading] = useState(true);
  const [statusText, setStatusText] = useState<string | null>(null);

  const [memberId, setMemberId] = useState<string | null>(null);
  const [manualEvents, setManualEvents] = useState<CalItem[]>([]);
  const [sessionEvents, setSessionEvents] = useState<CalItem[]>([]);
  const [fallbackEvents, setFallbackEvents] = useState<CalItem[]>([]);

  const [search, setSearch] = useState("");
  const [monthOffset, setMonthOffset] = useState(0);
  const [selectedDay, setSelectedDay] = useState<string>(yyyymmddLocal(new Date()));

  const [createTitle, setCreateTitle] = useState("");
  const [createNote, setCreateNote] = useState("");
  const [createStart, setCreateStart] = useState(() => {
    const now = new Date();
    now.setHours(now.getHours() + 1, 0, 0, 0);
    return toDatetimeLocal(now);
  });
  const [createEnd, setCreateEnd] = useState(() => {
    const now = new Date();
    now.setHours(now.getHours() + 2, 0, 0, 0);
    return toDatetimeLocal(now);
  });
  const [createBusy, setCreateBusy] = useState(false);
  const [deleteBusyId, setDeleteBusyId] = useState<string | null>(null);

  const activitiesIndex = useMemo(() => readActivitiesIndex(), []);

  const loadData = async () => {
    setLoading(true);
    setStatusText(null);

    const nextFallback = readCalendarFallback();
    setFallbackEvents(nextFallback);

    try {
      const [manualRes, sessionsRes] = await Promise.all([
        fetch("/api/calendar/events", { cache: "no-store" }),
        fetch("/api/dashboard/my-sessions?days=365", { cache: "no-store" }),
      ]);

      const manualJson = await manualRes.json().catch(() => ({}));
      if (!manualRes.ok) {
        throw new Error(String((manualJson as any)?.error || "Kunne ikke hente kalenderhendelser"));
      }

      const apiMemberId = String((manualJson as any)?.member_id ?? "").trim() || null;
      setMemberId(apiMemberId);

      const manual = Array.isArray((manualJson as any)?.events)
        ? ((manualJson as any).events as AnyObj[]).map((event) => ({
            id: String(event?.id ?? ""),
            member_id: String(event?.member_id ?? apiMemberId ?? ""),
            title: String(event?.title ?? "Hendelse"),
            start: String(event?.start_at ?? ""),
            end: String(event?.end_at ?? event?.start_at ?? ""),
            source: "manual" as const,
            note: typeof event?.note === "string" ? event.note : null,
          }))
        : [];

      setManualEvents(manual.filter((event) => event.id && event.start && event.end));

      if (!sessionsRes.ok) {
        setSessionEvents([]);
        setStatusText("Viser lokale kalenderdata som fallback.");
      } else {
        const sessionsJson = await sessionsRes.json().catch(() => ({}));
        const sessions = Array.isArray((sessionsJson as any)?.sessions)
          ? ((sessionsJson as any).sessions as AnyObj[]).map((session) => ({
              id: `session-${String(session?.id ?? "")}`,
              member_id: apiMemberId ?? "",
              title: String(session?.title ?? "Økt"),
              start: String(session?.start_at ?? ""),
              end: String(session?.end_at ?? session?.start_at ?? ""),
              source: "session" as const,
              activity_id: session?.activity_id ? String(session.activity_id) : undefined,
              session_id: session?.id ? String(session.id) : undefined,
            }))
          : [];

        setSessionEvents(sessions.filter((event) => event.start && event.end));
      }
    } catch (err: any) {
      setStatusText(err?.message || "Kunne ikke hente kalenderdata.");
      setManualEvents([]);
      setSessionEvents([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadData();
  }, []);

  const allEvents = useMemo(() => {
    const out = [...sessionEvents, ...manualEvents];
    if (out.length === 0) {
      return [...fallbackEvents];
    }
    return out;
  }, [fallbackEvents, manualEvents, sessionEvents]);

  const filteredEvents = useMemo(() => {
    const q = search.trim().toLowerCase();
    return allEvents
      .filter((event) => {
        if (memberId && event.member_id && event.member_id !== memberId) return false;
        if (!q) return true;
        return event.title.toLowerCase().includes(q);
      })
      .sort((a, b) => +new Date(a.start) - +new Date(b.start));
  }, [allEvents, memberId, search]);

  const grouped = useMemo(() => groupByDateLocal(filteredEvents), [filteredEvents]);

  const today = new Date();
  const viewBase = new Date(today.getFullYear(), today.getMonth() + monthOffset, 1);
  const days = buildMonthGrid(viewBase);

  const selectedEvents = selectedDay ? grouped[selectedDay] ?? [] : [];
  const upcoming = useMemo(() => {
    const nowKey = yyyymmddLocal(today);
    const keys = Object.keys(grouped)
      .filter((key) => key >= nowKey)
      .sort();

    return keys.flatMap((key) =>
      (grouped[key] ?? []).map((event) => ({ key, event }))
    );
  }, [grouped, today]);

  async function handleCreateManual() {
    const title = createTitle.trim();
    const startAt = fromDatetimeLocal(createStart);
    const endAt = fromDatetimeLocal(createEnd);

    if (!title || !startAt || !endAt) {
      setStatusText("Fyll inn tittel, start og slutt.");
      return;
    }

    if (new Date(endAt).getTime() < new Date(startAt).getTime()) {
      setStatusText("Sluttid kan ikke være før starttid.");
      return;
    }

    try {
      setCreateBusy(true);
      setStatusText(null);

      const res = await fetch("/api/calendar/events", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title,
          startAt,
          endAt,
          note: createNote.trim() || null,
        }),
      });

      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(String((json as any)?.error || "Kunne ikke lagre hendelsen"));
      }

      const event = (json as any)?.event as AnyObj | undefined;
      if (event) {
        const mapped: CalItem = {
          id: String(event?.id ?? ""),
          member_id: String(event?.member_id ?? memberId ?? ""),
          title: String(event?.title ?? "Hendelse"),
          start: String(event?.start_at ?? ""),
          end: String(event?.end_at ?? event?.start_at ?? ""),
          source: "manual",
          note: typeof event?.note === "string" ? event.note : null,
        };
        setManualEvents((prev) => [...prev, mapped]);
      } else {
        await loadData();
      }

      setCreateTitle("");
      setCreateNote("");
    } catch (err: any) {
      setStatusText(err?.message || "Kunne ikke lagre hendelsen.");
    } finally {
      setCreateBusy(false);
    }
  }

  async function handleDeleteManual(id: string) {
    try {
      setDeleteBusyId(id);
      setStatusText(null);

      const res = await fetch(`/api/calendar/events/${encodeURIComponent(id)}`, {
        method: "DELETE",
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(String((json as any)?.error || "Kunne ikke slette hendelsen"));
      }

      setManualEvents((prev) => prev.filter((event) => event.id !== id));
    } catch (err: any) {
      setStatusText(err?.message || "Kunne ikke slette hendelsen.");
    } finally {
      setDeleteBusyId(null);
    }
  }

  if (loading) {
    return (
      <main className="w-full px-3 py-6 text-neutral-900 sm:px-6">
        <h1 className="text-2xl font-semibold">Kalender</h1>
        <p className="mt-3 text-neutral-700">Laster kalender…</p>
      </main>
    );
  }

  const maxRows = 4;

  return (
    <div className="w-full bg-neutral-50">
      <main className="w-full px-3 py-6 text-neutral-900 sm:px-6">
        <div
          className="rounded-2xl border border-black/10 p-4 shadow-md md:p-5"
          style={{
            background:
              "linear-gradient(90deg,#6b0f1a 0%,#b91c1c 50%,#dc2626 100%)",
          }}
        >
          <div className="flex items-center justify-between gap-3">
            <div>
              <h1 className="text-2xl font-semibold tracking-tight text-white md:text-3xl">
                Kalender
              </h1>
              <p className="mt-0.5 text-xs text-white/90 md:text-sm">
                Min kalender med økter og manuelle hendelser
              </p>
            </div>
          </div>
        </div>

        <div className="mt-4 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div className="flex items-center gap-2 text-sm">
            <button
              onClick={() => setMonthOffset((offset) => offset - 1)}
              className="rounded-lg bg-white px-3 py-1.5 shadow-sm ring-1 ring-neutral-200 hover:bg-neutral-50"
            >
              ← Forrige
            </button>
            <div className="rounded-lg bg-white px-3 py-1.5 font-medium shadow-sm ring-1 ring-neutral-200">
              {monthLabel(viewBase)}
            </div>
            <button
              onClick={() => setMonthOffset((offset) => offset + 1)}
              className="rounded-lg bg-white px-3 py-1.5 shadow-sm ring-1 ring-neutral-200 hover:bg-neutral-50"
            >
              Neste →
            </button>
            <button
              onClick={() => {
                setMonthOffset(0);
                setSelectedDay(yyyymmddLocal(new Date()));
              }}
              className="rounded-lg bg-white px-3 py-1.5 shadow-sm ring-1 ring-neutral-200 hover:bg-neutral-50"
            >
              I dag
            </button>
          </div>

          <input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Søk i titler…"
            className="w-full rounded-lg border border-neutral-300 bg-white px-3 py-2 text-neutral-900 focus:border-red-600 focus:outline-none md:w-72"
          />
        </div>

        {statusText ? (
          <div className="mt-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
            {statusText}
          </div>
        ) : null}

        <div className="mt-4 grid w-full grid-cols-1 gap-4 xl:[grid-template-columns:minmax(0,1fr)_360px]">
          <section className="rounded-2xl border border-zinc-200 bg-white p-3 shadow-sm md:p-4">
            <div className="grid grid-cols-7 gap-1 px-1 text-[12px] font-semibold text-neutral-700 md:text-[13px]">
              {WEEKDAYS.map((weekday) => (
                <div key={weekday} className="text-center">
                  {weekday}
                </div>
              ))}
            </div>

            <div className="mt-2 grid grid-cols-7 gap-1">
              {days.map((day) => {
                const key = yyyymmddLocal(day);
                const inMonth = day.getMonth() === viewBase.getMonth();
                const isToday = isSameDay(day, today);
                const events = grouped[key] ?? [];
                const rows = events.slice(0, maxRows);
                const more = events.length - rows.length;
                const selected = selectedDay === key;

                return (
                  <button
                    key={key}
                    onClick={() => setSelectedDay(key)}
                    className={`group relative min-h-[120px] rounded-xl border px-2.5 py-2 text-left transition md:min-h-[140px] lg:min-h-[160px] ${
                      inMonth
                        ? "border-neutral-300 bg-white"
                        : "border-neutral-300/60 bg-neutral-100"
                    } ${
                      selected
                        ? "shadow ring-2 ring-red-600"
                        : "hover:border-red-400 hover:shadow-sm"
                    }`}
                  >
                    <div className="absolute right-2 top-2 text-xs font-semibold text-neutral-900 opacity-80 md:text-sm">
                      {day.getDate()}
                    </div>

                    {isToday ? (
                      <span
                        className="absolute left-2 top-2 inline-block h-2.5 w-2.5 rounded-full bg-red-600"
                        title="I dag"
                      />
                    ) : null}

                    <div className="mt-6 space-y-1">
                      {rows.map((event) => {
                        const kind = kindFor(event, activitiesIndex);
                        const dot = dotColor(kind);
                        return (
                          <button
                            key={event.id}
                            onClick={(e) => {
                              e.stopPropagation();
                              if (event.session_id) {
                                router.push(`/sessions/${encodeURIComponent(event.session_id)}`);
                              }
                            }}
                            className="w-full rounded px-1.5 py-1 text-left hover:bg-neutral-50"
                            title={`${fmtTime(event.start)} · ${event.title}`}
                          >
                            <div className="flex items-start gap-1.5">
                              <span className={`mt-[3px] inline-block h-2 w-2 rounded-full ${dot}`} />
                              <div className="min-w-0">
                                <div className="text-[12px] font-semibold leading-4">
                                  {fmtTime(event.start)}
                                </div>
                                <div
                                  className="text-[12px] leading-4 text-neutral-800"
                                  style={{
                                    display: "-webkit-box",
                                    WebkitLineClamp: 2,
                                    WebkitBoxOrient: "vertical",
                                    overflow: "hidden",
                                  }}
                                >
                                  {event.title}
                                </div>
                              </div>
                            </div>
                          </button>
                        );
                      })}

                      {more > 0 ? (
                        <div className="cursor-pointer text-[11px] text-neutral-500 hover:text-neutral-800">
                          +{more} til
                        </div>
                      ) : null}
                    </div>
                  </button>
                );
              })}
            </div>
          </section>

          <aside className="space-y-4">
            <section className="rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm">
              <h2 className="text-sm font-semibold text-neutral-900">Legg til hendelse</h2>
              <div className="mt-3 space-y-2">
                <input
                  value={createTitle}
                  onChange={(event) => setCreateTitle(event.target.value)}
                  placeholder="Tittel"
                  className="w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm text-neutral-900 focus:border-red-600 focus:outline-none"
                />
                <div className="grid grid-cols-1 gap-2">
                  <input
                    type="datetime-local"
                    value={createStart}
                    onChange={(event) => setCreateStart(event.target.value)}
                    className="w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm text-neutral-900 focus:border-red-600 focus:outline-none"
                  />
                  <input
                    type="datetime-local"
                    value={createEnd}
                    onChange={(event) => setCreateEnd(event.target.value)}
                    className="w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm text-neutral-900 focus:border-red-600 focus:outline-none"
                  />
                </div>
                <textarea
                  value={createNote}
                  onChange={(event) => setCreateNote(event.target.value)}
                  placeholder="Notat (valgfritt)"
                  rows={2}
                  className="w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm text-neutral-900 focus:border-red-600 focus:outline-none"
                />
                <button
                  onClick={handleCreateManual}
                  disabled={createBusy}
                  className="w-full rounded-lg bg-red-600 px-3 py-2 text-sm font-semibold text-white hover:bg-red-700 disabled:opacity-60"
                >
                  {createBusy ? "Lagrer…" : "Legg til i kalender"}
                </button>
              </div>
            </section>

            <section className="rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm">
              <div className="text-xs text-neutral-600">{fmtDateLong(selectedDay)}</div>
              {selectedEvents.length === 0 ? (
                <div className="mt-2 text-neutral-700">Ingen hendelser.</div>
              ) : (
                <ul className="mt-2 divide-y divide-neutral-200">
                  {selectedEvents
                    .slice()
                    .sort((a, b) => +new Date(a.start) - +new Date(b.start))
                    .map((event) => {
                      const kind = kindFor(event, activitiesIndex);
                      return (
                        <li key={event.id} className="py-3">
                          <span
                            className={`inline-flex items-center gap-2 rounded-full px-2 py-0.5 text-[11px] ring-1 ${badgeClass(kind)}`}
                          >
                            {badgeLabel(kind)}
                          </span>
                          <div className="mt-1 text-sm text-neutral-600">
                            {fmtTime(event.start)} – {fmtTime(event.end)}
                          </div>
                          <div className="mt-0.5 text-[15px] font-medium text-neutral-900 break-words">
                            {event.title}
                          </div>
                          {event.note ? (
                            <div className="mt-1 text-sm text-neutral-700">{event.note}</div>
                          ) : null}
                          <div className="mt-1 flex flex-wrap items-center gap-2">
                            {event.activity_id ? (
                              <Link
                                href={`/activities/${event.activity_id}`}
                                className="text-sm text-red-700 underline underline-offset-2 hover:text-red-800"
                              >
                                Gå til aktivitet
                              </Link>
                            ) : null}
                            {event.session_id ? (
                              <button
                                onClick={() =>
                                  router.push(`/sessions/${encodeURIComponent(event.session_id as string)}`)
                                }
                                className="text-sm text-red-700 underline underline-offset-2 hover:text-red-800"
                              >
                                Gå til økt
                              </button>
                            ) : null}
                            {event.source === "manual" ? (
                              <button
                                onClick={() => handleDeleteManual(event.id)}
                                disabled={deleteBusyId === event.id}
                                className="text-sm text-neutral-700 underline underline-offset-2 hover:text-neutral-900 disabled:opacity-60"
                              >
                                {deleteBusyId === event.id ? "Sletter…" : "Slett"}
                              </button>
                            ) : null}
                          </div>
                        </li>
                      );
                    })}
                </ul>
              )}
            </section>

            <section className="rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm">
              <h2 className="text-sm font-semibold text-neutral-900">Kommende</h2>
              {upcoming.length === 0 ? (
                <div className="mt-2 text-neutral-700">Ingen kommende hendelser.</div>
              ) : (
                <ul className="mt-2 divide-y divide-neutral-200">
                  {upcoming.slice(0, 10).map(({ key, event }) => (
                    <li key={`${key}-${event.id}`} className="py-3">
                      <div className="text-xs text-neutral-500">{fmtDateLong(key)}</div>
                      <div className="mt-0.5 text-sm text-neutral-600">
                        {fmtTime(event.start)} – {fmtTime(event.end)}
                      </div>
                      <div className="text-[15px] font-medium text-neutral-900">{event.title}</div>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          </aside>
        </div>
      </main>
    </div>
  );
}
