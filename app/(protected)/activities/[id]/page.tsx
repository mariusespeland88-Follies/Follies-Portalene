"use client";

/**
 * Aktivitetsdetaljer
 * - UENDRET look for hero/faner/deltakere/ledere.
 * - Fane "Økter": viser økter for aktiviteten + knapp "Lag ny økt" (går til /activities/[id]/sessions/new).
 * - Klikk på en økt åpner /sessions/[id].
 * - NYTT: Per-aktivitet valg av hvilke faner som vises ("Tilpass visning").
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { createClientComponentClient } from "@/lib/supabase/browser";

import {
  fetchActivity,
  fetchActivities,
  Activity as DbActivity,
} from "../../../../lib/activitiesClient";
import GuestsTab from "./GuestsTab";
import AttendanceTab from "./AttendanceTab";
import VolunteersTab from "./VolunteersTab";
import TasksTab from "./TasksTab";

type AnyObj = Record<string, any>;
type Tab =
  | "oversikt"
  | "deltakere"
  | "ledere"
  | "okter"
  | "filer"
  | "meldinger"
  | "gjester"
  | "innsjekk"
  | "frivillige"
  | "oppgaver";

type Visuals = { coverUrl: string | null; accent: string | null };

const LS_ACT_V1 = "follies.activities.v1";
const LS_ACT_OLD = "follies.activities";
const CAL_LS = "follies.calendar.v1";
const SESS_LS = "follies.activitySessions.v1";
const LS_MEM_V1 = "follies.members.v1";
const LS_MEM_OLD = "follies.members";
const LS_ACTIVITY_TABS = "follies.activityTabs.v1";

const safeJSON = <T,>(s: string | null): T | null => {
  try {
    return s ? (JSON.parse(s) as T) : null;
  } catch {
    return null;
  }
};
const S = (v: any) => String(v ?? "");

const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function pickActivityDbId(
  activity: DbActivity | null,
  fallback: string | null | undefined
): string | null {
  const fallbackValue = fallback ? String(fallback) : null;
  const candidates: (string | null | undefined)[] = [
    activity?.id,
    (activity as any)?.activity_id,
    (activity as any)?.activityId,
    (activity as any)?.db_id,
    (activity as any)?.dbId,
    (activity as any)?.supabase_id,
    (activity as any)?.supabaseId,
    (activity as any)?.raw?.id,
    (activity as any)?.raw?.activity_id,
    fallbackValue,
  ];

  for (const candidate of candidates) {
    if (!candidate) continue;
    const value = String(candidate);
    if (UUID_REGEX.test(value)) return value;
  }

  if (fallbackValue && UUID_REGEX.test(fallbackValue)) {
    return fallbackValue;
  }

  return null;
}

/* ----------------------------- UI helpers ----------------------------- */
const labelForType = (t?: string | null) => {
  const v = String(t ?? "").toLowerCase();
  if (v.includes("forest")) return "Forestilling";
  if (v.includes("event") || v.includes("arrangement")) return "Event";
  if (v.includes("offer") || v.includes("tilbud")) return "Tilbud";
  if (v === "forestilling") return "Forestilling";
  if (v === "event") return "Event";
  if (v === "tilbud") return "Tilbud";
  return "Tilbud";
};

const typeClass = (t?: string | null) => {
  const lbl = labelForType(t);
  if (lbl === "Forestilling") return "bg-purple-700";
  if (lbl === "Event") return "bg-red-700";
  return "bg-red-700"; // Tilbud
};

const gradientFor = (accent?: string | null, t?: string | null) => {
  if (accent)
    return `linear-gradient(90deg, ${accent} 0%, ${accent}CC 50%, ${accent}99 100%)`;
  const lbl = labelForType(t);
  if (lbl === "Forestilling")
    return "linear-gradient(90deg,#6d28d9 0%,#a21caf 50%,#d946ef 100%)";
  if (lbl === "Event")
    return "linear-gradient(90deg,#450a0a 0%,#7f1d1d 45%,#b91c1c 100%)";
  return "linear-gradient(90deg,#2b0000 0%,#7f1d1d 45%,#b91c1c 100%)";
};

const initials = (name?: string) =>
  ((name ?? "")
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase() ?? "")
    .join("")) || "A";

function pickImageFlexible(a: any): string | null {
  return (
    a?.coverUrl ||
    a?.cover_url ||
    a?.cover ||
    a?.image_url ||
    a?.image ||
    a?.bannerUrl ||
    a?.banner_url ||
    a?.thumb ||
    a?.thumbnail ||
    a?.avatar ||
    a?.logo ||
    a?.icon ||
    a?.media?.cover ||
    a?.media?.image ||
    a?.image?.url ||
    a?.cover?.url ||
    a?.assets?.cover ||
    a?.assets?.image ||
    null
  );
}
function pickAccentFlexible(a: any): string | null {
  const v =
    a?.accent ||
    a?.accentColor ||
    a?.color ||
    a?.themeColor ||
    a?.primary_color ||
    a?.style?.accent ||
    null;
  return v ? String(v) : null;
}

function visualsFromLocalStorage(activityId: string): Visuals {
  const v1 = safeJSON<any[]>(localStorage.getItem(LS_ACT_V1)) ?? [];
  const old = safeJSON<any[]>(localStorage.getItem(LS_ACT_OLD)) ?? [];
  const all = [...old, ...v1];
  const hit = all.find((a) => S(a?.id ?? a?.uuid ?? a?._id) === S(activityId));
  if (!hit) return { coverUrl: null, accent: null };
  return { coverUrl: pickImageFlexible(hit), accent: pickAccentFlexible(hit) };
}

/* -------------------------- LS roster fallbacks -------------------------- */
function lsMembersMap(): Record<string, AnyObj> {
  const v1 = safeJSON<AnyObj[]>(localStorage.getItem(LS_MEM_V1)) ?? [];
  const old = safeJSON<AnyObj[]>(localStorage.getItem(LS_MEM_OLD)) ?? [];
  const all = [...old, ...v1];
  const map: Record<string, AnyObj> = {};
  for (const m of all) {
    const id = S(m?.id ?? m?.uuid ?? m?.memberId ?? m?._id);
    if (id) map[id] = m;
  }
  return map;
}

function lsRosterByRole(activityId: string) {
  const v1 = safeJSON<AnyObj[]>(localStorage.getItem(LS_ACT_V1)) ?? [];
  const old = safeJSON<AnyObj[]>(localStorage.getItem(LS_ACT_OLD)) ?? [];
  const all = [...old, ...v1];
  const hit = all.find((a) => S(a?.id ?? a?.uuid ?? a?._id) === S(activityId));
  const participants: string[] = Array.isArray(hit?.participants)
    ? hit!.participants
    : [];
  const leaders: string[] = Array.isArray(hit?.leaders) ? hit!.leaders : [];
  const mem = lsMembersMap();
  const mapToMember = (ids: string[]) => ids.map((id) => mem[id]).filter(Boolean);
  return { participants: mapToMember(participants), leaders: mapToMember(leaders) };
}

/* ------------------------------- Økter (LS) -------------------------------- */
function lsLoadSessions(activityId: string): any[] {
  const all = safeJSON<Record<string, any[]>>(localStorage.getItem(SESS_LS)) ?? {};
  return all[activityId] ?? [];
}

/* ---------------------------- Tabs-konfig (LS) ---------------------------- */

type TabsConfig = {
  [activityId: string]: Tab[];
};

const DEFAULT_TABS: Tab[] = [
  "oversikt",
  "deltakere",
  "ledere",
  "okter",
  "gjester",
  "innsjekk",
  "frivillige",
  "oppgaver",
  "filer",
  "meldinger",
];

function loadActivityTabs(activityId: string, fallback: Tab[]): Tab[] {
  if (typeof window === "undefined") return fallback;
  const raw = window.localStorage.getItem(LS_ACTIVITY_TABS);
  const parsed = safeJSON<TabsConfig>(raw);
  if (!parsed) return fallback;

  const found = parsed[activityId];
  if (!found || !found.length) return fallback;

  // Filtrer ut tabs som ikke lenger eksisterer i koden
  const validSet = new Set<Tab>(DEFAULT_TABS);
  const cleaned = found.filter((t) => validSet.has(t));
  return cleaned.length ? cleaned : fallback;
}

function saveActivityTabs(activityId: string, tabs: Tab[]) {
  if (typeof window === "undefined") return;
  const raw = window.localStorage.getItem(LS_ACTIVITY_TABS);
  const parsed = safeJSON<TabsConfig>(raw) ?? {};
  parsed[activityId] = tabs;
  window.localStorage.setItem(LS_ACTIVITY_TABS, JSON.stringify(parsed));
}

/* ------------------------ DB-hent i to steg ------------------------ */
// NB: supabase er ANY for å unngå generics-krangling i Vercel/TS
async function fetchPeopleForRole(
  supabase: any,
  activityId: string,
  role: "participant" | "leader"
) {
  const { data: rows, error } = await supabase
    .from("enrollments")
    .select("member_id")
    .eq("activity_id", activityId)
    .eq("role", role);

  if (error) return { list: [] as AnyObj[], error };

  const ids = Array.from(
    new Set((rows || []).map((r: any) => r?.member_id).filter(Boolean))
  );
  if (ids.length === 0) return { list: [] as AnyObj[], error: null };

  const { data: members, error: mErr } = await supabase
    .from("members")
    .select("id, first_name, last_name, email")
    .in("id", ids);

  if (mErr) return { list: (members || []) as AnyObj[], error: mErr };

  return { list: (members || []) as AnyObj[], error: null };
}

/* -------------------------------- Hoved -------------------------------- */
export default function ActivityDetailPage() {
  const params = useParams();
  const router = useRouter();
  const supabase = createClientComponentClient();

  const id = Array.isArray(params?.id)
    ? params.id[0]
    : (params?.id as string | undefined);
  const routeIdValue = String(id ?? "");

  const [tab, setTab] = useState<Tab>("oversikt");
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  const [act, setAct] = useState<DbActivity | null>(null);
  const [activityDbId, setActivityDbId] = useState<string | null>(null);
  const [vis, setVis] = useState<Visuals>({ coverUrl: null, accent: null });

  const [participants, setParticipants] = useState<any[]>([]);
  const [leaders, setLeaders] = useState<any[]>([]);
  const [sessions, setSessions] = useState<any[]>([]);
  const [imgOk, setImgOk] = useState(true);

  const [busyId, setBusyId] = useState<string | null>(null);

  const [showTabsConfig, setShowTabsConfig] = useState(false);
  const [enabledTabs, setEnabledTabs] = useState<Tab[]>(() =>
    loadActivityTabs(routeIdValue, DEFAULT_TABS)
  );

  const showGuestsTab = useMemo(() => {
    if (!act) return false;
    const t = String((act as any)?.type ?? "").toLowerCase();
    return t.includes("event") && Boolean((act as any)?.has_guests);
  }, [act]);

  const showAttendanceTab = useMemo(() => {
    if (!act) return false;
    const t = String((act as any)?.type ?? "").toLowerCase();
    return t.includes("event") && Boolean((act as any)?.has_attendance);
  }, [act]);

  const showVolunteersTab = useMemo(() => {
    if (!act) return false;
    return Boolean((act as any)?.has_volunteers);
  }, [act]);

  const showTasksTab = useMemo(() => {
    if (!act) return false;
    return Boolean((act as any)?.has_tasks);
  }, [act]);

  // Hvis aktiverte features endres, og vi står på en fane som ikke lenger finnes, hopp til oversikt
  useEffect(() => {
    if (tab === "gjester" && !showGuestsTab) setTab("oversikt");
    if (tab === "innsjekk" && !showAttendanceTab) setTab("oversikt");
    if (tab === "frivillige" && !showVolunteersTab) setTab("oversikt");
    if (tab === "oppgaver" && !showTasksTab) setTab("oversikt");
  }, [showAttendanceTab, showGuestsTab, showTasksTab, showVolunteersTab, tab]);

  // Hvis en fane skrus av i "Tilpass visning" og vi sto på den, hopp til oversikt
  useEffect(() => {
    if (!enabledTabs.includes(tab)) {
      setTab("oversikt");
    }
  }, [enabledTabs, tab]);

  const reloadRoster = useCallback(
    async (activityId: string | null) => {
      if (!activityId) {
        const { participants: lp, leaders: ll } = lsRosterByRole(routeIdValue);
        setParticipants(lp);
        setLeaders(ll);
        return;
      }
      const [pRes, lRes] = await Promise.all([
        fetchPeopleForRole(supabase, activityId, "participant"),
        fetchPeopleForRole(supabase, activityId, "leader"),
      ]);

      if (
        pRes.list.length === 0 &&
        lRes.list.length === 0 &&
        (pRes.error || lRes.error)
      ) {
        const { participants: lp, leaders: ll } = lsRosterByRole(routeIdValue);
        setParticipants(lp);
        setLeaders(ll);
        return;
      }

      setParticipants(pRes.list);
      setLeaders(lRes.list);
    },
    [routeIdValue, supabase]
  );

  const derivedActivityDbId = useMemo(
    () => pickActivityDbId(act, routeIdValue),
    [act, routeIdValue]
  );
  const effectiveActivityDbId = activityDbId ?? derivedActivityDbId ?? null;

  useEffect(() => {
    if (derivedActivityDbId !== activityDbId) {
      setActivityDbId(derivedActivityDbId ?? null);
    }
  }, [activityDbId, derivedActivityDbId]);

  useEffect(() => {
    setActivityDbId(null);
    let alive = true;
    (async () => {
      if (!routeIdValue) {
        setErr("Mangler aktivitets-ID i URLen.");
        setLoading(false);
        return;
      }
      try {
        setLoading(true);
        setErr(null);

        let a = await fetchActivity(routeIdValue);
        if (!a) {
          const res = await fetchActivities();
          a = res.data.find((x) => String(x.id) === routeIdValue) ?? null;
        }
        if (!alive) return;
        if (!a) {
          setErr(`Fant ikke aktiviteten (id: ${routeIdValue}).`);
          setLoading(false);
          return;
        }
        setAct(a);
        setVis(visualsFromLocalStorage(routeIdValue));

        const resolvedDbId = pickActivityDbId(a, routeIdValue);

        await reloadRoster(resolvedDbId);
        setSessions(lsLoadSessions(routeIdValue));
        setLoading(false);
      } catch (e) {
        console.error("Feil:", e);
        if (alive) {
          setErr("Noe gikk galt ved innlasting av aktiviteten.");
          setLoading(false);
        }
      }
    })();
    return () => {
      alive = false;
    };
  }, [reloadRoster, routeIdValue]);

  const typeLabel = useMemo(() => labelForType((act as any)?.type), [act]);

  const setRole = async (memberId: string, role: "participant" | "leader") => {
    const resolvedId = pickActivityDbId(
      act,
      effectiveActivityDbId ?? routeIdValue
    );
    if (!resolvedId) return;
    try {
      setBusyId(memberId);
      const res = await fetch("/api/admin/enrollments/update-role", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ activityId: resolvedId, memberId, role }),
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(j?.error || "Kunne ikke oppdatere rolle");
      await reloadRoster(resolvedId);
    } catch (e: any) {
      alert(e?.message || "Noe gikk galt ved oppdatering av rolle.");
    } finally {
      setBusyId(null);
    }
  };

  const preferredRouteId =
    routeIdValue || effectiveActivityDbId || String(act?.id || "");

  const updateTabs = (next: Tab[]) => {
    // Oversikt skal alltid være på
    if (!next.includes("oversikt")) {
      next = ["oversikt", ...next];
    }
    setEnabledTabs(next);
    saveActivityTabs(routeIdValue, next);
    if (!next.includes(tab)) {
      setTab("oversikt");
    }
  };

  if (loading)
    return <main className="px-4 py-6 text-neutral-900">Laster…</main>;
  if (err) {
    return (
      <main className="px-4 py-6 text-neutral-900">
        <div className="text-red-600 mb-3 font-semibold">Feil</div>
        <div className="text-red-700 text-sm mb-4">{err}</div>
        <button
          onClick={() => router.push("/activities")}
          className="rounded-lg bg-red-600 hover:bg-red-700 px-4 py-2 text-white text-sm font-semibold"
        >
          Tilbake til aktiviteter
        </button>
      </main>
    );
  }
  if (!act)
    return (
      <main className="px-4 py-6 text-neutral-900">
        Finner ikke aktiviteten.
      </main>
    );

  const gradient = gradientFor(vis.accent, (act as any)?.type);
  const avatar = vis.coverUrl || null;
  const initialsText = initials(act.name);

  type TabDef = { key: Tab; label: string };

  // Definisjon av alle potensielle faner for denne aktiviteten (inkl. counts)
  const allTabDefs: TabDef[] = [
    { key: "oversikt", label: "Oversikt" },
    {
      key: "deltakere",
      label: `Deltakere (${participants.length})`,
    },
    {
      key: "ledere",
      label: `Ledere (${leaders.length})`,
    },
    { key: "okter", label: "Økter" },
  ];

  if (showGuestsTab) {
    allTabDefs.push({ key: "gjester", label: "Gjester" });
  }
  if (showAttendanceTab) {
    allTabDefs.push({ key: "innsjekk", label: "Innsjekk" });
  }
  if (showVolunteersTab) {
    allTabDefs.push({ key: "frivillige", label: "Frivillige" });
  }
  if (showTasksTab) {
    allTabDefs.push({ key: "oppgaver", label: "Oppgaver" });
  }

  allTabDefs.push({ key: "filer", label: "Filer" });
  allTabDefs.push({ key: "meldinger", label: "Meldinger" });

  // Faner som faktisk skal vises (både enablet + faktisk mulig for denne aktiviteten)
  const visibleTabDefs = allTabDefs.filter((def) =>
    enabledTabs.includes(def.key)
  );

  return (
    <main className="mx-auto max-w-7xl px-4 py-8 text-neutral-900">
      {/* HERO */}
      <div
        className="mb-6 overflow-hidden rounded-2xl border border-zinc-300 bg-gradient-to-r from-red-800 to-red-600 shadow-lg text-white"
        style={{ background: gradient }}
      >
        <div className="border border-white/20 bg-white/10 p-5 backdrop-blur-sm md:p-6 lg:p-7">
          <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
            <div className="flex items-center gap-4">
              <div className="relative flex h-16 w-16 items-center justify-center overflow-hidden rounded-2xl bg-white/10 text-xl font-semibold text-white ring-1 ring-white/60 backdrop-blur-[1px]">
                {avatar && imgOk ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={avatar}
                    alt=""
                    className="h-full w-full object-cover"
                    onError={() => setImgOk(false)}
                  />
                ) : (
                  <span>{initialsText}</span>
                )}
              </div>
              <div>
                <div className="flex items-center gap-3">
                  <h1 className="text-3xl font-semibold tracking-tight text-white">
                    {act.name}
                  </h1>
                  <span
                    className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold text-white ${typeClass(
                      (act as any)?.type
                    )} ring-1 ring-white/40`}
                  >
                    {typeLabel}
                  </span>
                </div>
                <p className="mt-1 text-sm text:white/90">
                  {(act as any).start_date
                    ? `Start: ${(act as any).start_date}`
                    : "Start: —"}{" "}
                  ·{" "}
                  {(act as any).end_date
                    ? `Slutt: ${(act as any).end_date}`
                    : "Slutt: —"}
                </p>
              </div>
            </div>
            <div className="mt-4 flex items-center gap-2 md:mt-0">
              <Link
                href="/activities"
                className="rounded-lg bg-white/15 px-3.5 py-2 text-sm font-semibold text:white ring-1 ring-white/40 hover:bg-white/25"
              >
                Til oversikt
              </Link>
              <button
                onClick={() =>
                  router.push(
                    `/activities/${encodeURIComponent(preferredRouteId)}/edit`
                  )
                }
                className="rounded-lg bg:white px-3.5 py-2 text-sm font-semibold text-neutral-900 hover:bg:white/90"
              >
                Rediger
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Faner + Tilpass visning */}
      <div className="mt-6 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-zinc-300 bg-white/80 px-2 py-1 shadow-sm backdrop-blur-sm">
        <div className="flex flex-wrap items-center gap-2">
          {visibleTabDefs.map(({ key, label }) => (
            <button
              key={key}
              onClick={() => setTab(key)}
              className={`rounded-xl px-4 py-2 text-sm font-semibold transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white/40 ${
                tab === key
                  ? "bg-white text-zinc-900 shadow-sm"
                  : "text-zinc-500 hover:bg-white/70 hover:text-zinc-800"
              }`}
            >
              {label}
            </button>
          ))}
        </div>

        <div className="relative">
          <button
            type="button"
            onClick={() => setShowTabsConfig((v) => !v)}
            className="rounded-xl border border-zinc-300 bg:white px-3 py-1.5 text-xs font-semibold text-zinc-800 hover:bg-zinc-50"
          >
            Tilpass visning
          </button>
          {showTabsConfig && (
            <div className="absolute right-0 z-20 mt-2 w-64 rounded-xl border border-zinc-300 bg:white p-3 text-xs shadow-lg">
              <p className="mb-2 text-[11px] text-zinc-600">
                Velg hvilke kategorier som skal vises for{" "}
                <span className="font-semibold">{act.name}</span>. Lagres bare
                for denne aktiviteten.
              </p>
              <div className="max-h-64 space-y-1 overflow-auto pr-1">
                {allTabDefs.map(({ key, label }) => {
                  const checked = enabledTabs.includes(key);
                  const disabled = key === "oversikt";
                  return (
                    <label
                      key={key}
                      className="flex items-center gap-2 rounded-md px-1 py-0.5 text-xs text-zinc-800 hover:bg-zinc-50"
                    >
                      <input
                        type="checkbox"
                        className="h-3 w-3"
                        checked={checked}
                        disabled={disabled}
                        onChange={() => {
                          let next: Tab[];
                          if (checked) {
                            next = enabledTabs.filter((t) => t !== key);
                          } else {
                            next = [...enabledTabs, key];
                          }
                          updateTabs(next);
                        }}
                      />
                      <span>
                        {label}
                        {disabled ? " (alltid)" : ""}
                      </span>
                    </label>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Innhold */}
      <div className="mt-6 grid gap-6 lg:grid-cols-3">
        {/* Venstre */}
        <section className="lg:col-span-2 space-y-6">
          {tab === "oversikt" && (
            <div className="rounded-2xl border border-zinc-300 bg:white p-5 shadow-sm">
              <h2 className="text-lg font-semibold">Oversikt</h2>
              <p className="mt-2 text-[15px] text-neutral-800">
                {(act as any).description
                  ? (act as any).description
                  : "Ingen beskrivelse."}
              </p>
            </div>
          )}

          {tab === "deltakere" && (
            <PeoplePanel
              title="Deltakere"
              people={participants}
              emphasize={false}
              variant="participants"
              busyId={busyId}
              onPromote={async (mid) => await setRole(mid, "leader")}
            />
          )}

          {tab === "ledere" && (
            <PeoplePanel
              title="Ledere"
              people={leaders}
              emphasize={true}
              variant="leaders"
              busyId={busyId}
              onDemote={async (mid) => await setRole(mid, "participant")}
            />
          )}

          {tab === "frivillige" && showVolunteersTab && (
            effectiveActivityDbId ? (
              <VolunteersTab activityId={effectiveActivityDbId} />
            ) : (
              <MissingActivityDbIdNotice title="Frivillige" />
            )
          )}

          {tab === "okter" && (
            <div className="rounded-2xl border border-zinc-300 bg:white p-5 shadow-sm">
              <div className="flex items-center justify-between">
                <h2 className="text-lg font-semibold text-neutral-900">
                  Økter
                </h2>
                <Link
                  href={`/activities/${encodeURIComponent(
                    preferredRouteId
                  )}/sessions/new`}
                  className="rounded-lg bg-red-600 px-3.5 py-2 text-sm font-semibold text:white hover:bg-red-700"
                >
                  Lag ny økt
                </Link>
              </div>

              {sessions.length === 0 ? (
                <p className="mt-3 text-neutral-700">Ingen økter enda.</p>
              ) : (
                <ul className="mt-4 divide-y divide-neutral-200">
                  {sessions.map((s) => (
                    <li
                      key={s.id}
                      className="py-3 flex items-center justify-between gap-3"
                    >
                      <div className="min-w-0">
                        <div className="font-medium text-neutral-900 truncate">
                          {s.title}
                        </div>
                        <div className="text-sm text-neutral-600">
                          {new Date(s.start).toLocaleString("nb-NO")} –{" "}
                          {new Date(s.end).toLocaleTimeString("nb-NO")}
                          {s.location ? <> · Sted: {s.location}</> : null}
                        </div>
                      </div>
                      <Link
                        href={`/sessions/${encodeURIComponent(String(s.id))}`}
                        className="rounded-lg bg:white px-3 py-1.5 text-sm font-semibold text-neutral-900 ring-1 ring-neutral-300 hover:bg-neutral-100"
                      >
                        Åpne økt
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}

          {tab === "gjester" && showGuestsTab && (
            effectiveActivityDbId ? (
              <GuestsTab activityId={effectiveActivityDbId} />
            ) : (
              <MissingActivityDbIdNotice title="Gjester" />
            )
          )}

          {tab === "innsjekk" && showAttendanceTab && (
            effectiveActivityDbId ? (
              <AttendanceTab
                activityId={effectiveActivityDbId}
                activityName={act.name}
              />
            ) : (
              <MissingActivityDbIdNotice title="Innsjekk" />
            )
          )}

          {tab === "oppgaver" && showTasksTab && (
            effectiveActivityDbId ? (
              <TasksTab activityId={effectiveActivityDbId} />
            ) : (
              <MissingActivityDbIdNotice title="Oppgaver" />
            )
          )}

          {tab === "filer" && (
            <div className="rounded-2xl border border-zinc-300 bg:white p-5 shadow-sm text-neutral-700">
              Her kan vi senere legge opplasting/visning av filer
              (Bilder/Tekst/Musikk/Annet).
            </div>
          )}

          {tab === "meldinger" && (
            <div className="rounded-2xl border border-zinc-300 bg:white p-5 shadow-sm text-neutral-700">
              Her kan vi senere legge kunngjøringer/meldinger til
              deltakere/ledere.
            </div>
          )}
        </section>

        {/* Høyre – Info-kort */}
        <aside className="space-y-6">
          <div className="rounded-2xl border border-zinc-300 bg:white p-5 shadow-sm">
            <h3 className="text-sm font-semibold text-neutral-900">Info</h3>
            <dl className="mt-3 text-sm text-neutral-700 space-y-2">
              <div className="flex justify-between gap-4">
                <dt>Type</dt>
                <dd className="font-medium">
                  {labelForType((act as any)?.type)}
                </dd>
              </div>
              <div className="flex justify-between gap-4">
                <dt>Status</dt>
                <dd className="font-medium">
                  {(act as any)?.archived ? "Arkivert" : "Aktiv"}
                </dd>
              </div>
              <div className="flex justify_between gap-4">
                <dt>Start</dt>
                <dd className="font-medium">
                  {(act as any)?.start_date || "—"}
                </dd>
              </div>
              <div className="flex justify_between gap-4">
                <dt>Slutt</dt>
                <dd className="font-medium">
                  {(act as any)?.end_date || "—"}
                </dd>
              </div>
            </dl>
          </div>
        </aside>
      </div>
    </main>
  );
}

/* ------------------------------ Delkomponenter ------------------------------ */

function MissingActivityDbIdNotice({ title }: { title: string }) {
  return (
    <div className="rounded-2xl border border-zinc-300 bg:white p-5 shadow-sm">
      <h2 className="text-lg font-semibold text-neutral-900">{title}</h2>
      <p className="mt-2 text-sm text-neutral-700">
        Denne funksjonen krever at aktiviteten er koblet til Supabase med en
        gyldig ID. Ta kontakt med en administrator for å synkronisere
        aktiviteten dersom du forventer å se data her.
      </p>
    </div>
  );
}

function PeoplePanel({
  title,
  people,
  emphasize,
  variant,
  onPromote,
  onDemote,
  busyId,
}: {
  title: string;
  people: AnyObj[];
  emphasize?: boolean;
  variant: "participants" | "leaders";
  onPromote?: (memberId: string) => void | Promise<void>;
  onDemote?: (memberId: string) => void | Promise<void>;
  busyId?: string | null;
}) {
  return (
    <div className="rounded-2xl border border-zinc-300 bg:white p-5 shadow-sm">
      <div className="flex items-center justify_between">
        <h2 className="text-lg font-semibold text-neutral-900">{title}</h2>
        <span className="inline-flex items-center rounded-full bg:black/85 px-3 py-1 text-xs font-semibold text:white ring-1 ring-white/10">
          {people.length}
        </span>
      </div>

      {people.length === 0 ? (
        <p className="mt-3 text-[15px] text-neutral-800">Ingen registrert.</p>
      ) : (
        <ul className="mt-4 divide-y divide-neutral-200">
          {people.map((m) => {
            const mid = String(m?.id ?? m?.uuid ?? m?.memberId ?? m?._id);
            const name =
              `${m.first_name || ""} ${m.last_name || ""}`.trim() || "Uten navn";
            const email = m.email || null;
            const phone = m.phone || m.mobile || m.telephone || null;
            const isBusy = busyId === mid;

            return (
              <li
                key={mid}
                className="flex items-center justify_between gap-3 py-3"
              >
                <div>
                  <p className="text-[15px] font-medium text-neutral-900">
                    {name}
                  </p>
                  <p className="text-xs text-neutral-700">
                    {email ? (
                      <span>{email}</span>
                    ) : (
                      <span className="text-neutral-500">Ingen e-post</span>
                    )}
                    {phone ? <span> · {phone}</span> : null}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <Link
                    href={`/members/${mid}`}
                    className="rounded-lg bg:white px-3 py-1.5 text-sm font-semibold text-neutral-900 ring-1 ring-neutral-300 hover:bg-neutral-100"
                  >
                    Åpne
                  </Link>
                  <Link
                    href={`/members/${mid}/edit`}
                    className="rounded-lg bg-red-600 px-3 py-1.5 text-sm font-semibold text:white hover:bg-red-700"
                  >
                    Rediger
                  </Link>
                  {variant === "participants" && onPromote ? (
                    <button
                      disabled={isBusy}
                      onClick={() => onPromote(mid)}
                      className="rounded-lg bg-red-600 px-3 py-1.5 text-sm font-semibold text:white hover:bg-red-700 disabled:opacity-60"
                      title="Gjør til leder"
                    >
                      Gjør til leder
                    </button>
                  ) : null}
                  {variant === "leaders" && onDemote ? (
                    <button
                      disabled={isBusy}
                      onClick={() => onDemote(mid)}
                      className="rounded-lg bg:white px-3 py-1.5 text-sm font-semibold text-neutral-900 ring-1 ring-neutral-300 hover:bg-neutral-100 disabled:opacity-60"
                      title="Fjern som leder"
                    >
                      Fjern
                    </button>
                  ) : null}
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
