"use client";

/**
 * Aktivitetsdetaljer (ERSTATT)
 * - Hero/faner som før (vinrød/lilla)
 * - Faner styres av activity.tab_config (DB) + has_*-feltene (fallback)
 * - Gjelder for ALLE typer (tilbud, event, forestilling)
 * - Fjerner høyre "Info"-kort (full bredde)
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import dynamic from "next/dynamic";
import { createClientComponentClient } from "@/lib/supabase/browser";

import {
  fetchActivity,
  fetchActivities,
  Activity as DbActivity,
} from "../../../../lib/activitiesClient";
import { getLeaders, getParticipants } from "../../../../lib/enrollmentsClient";

import GuestsTab from "./GuestsTab";
import AttendanceTab from "./AttendanceTab";
import VolunteersTab from "./VolunteersTab";
import TasksTab from "./TasksTab";

/* ----------------------------- Typer & constants ---------------------------- */

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
type LSEnroll = { leaders: string[]; participants: string[] };

const LS_ACT_V1 = "follies.activities.v1";
const LS_ACT_OLD = "follies.activities";
const LS_MEM_V1 = "follies.members.v1";
const LS_MEM_OLD = "follies.members";
const ENR_LS = "follies.enrollments.v1";

/* ------------------------------ Hjelpefunksjoner ---------------------------- */

const safeJSON = <T,>(s: string | null): T | null => {
  try {
    return s ? (JSON.parse(s) as T) : null;
  } catch {
    return null;
  }
};

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
  return "bg-red-700";
};

const gradientFor = (accent?: string | null, t?: string | null) => {
  if (accent)
    return `linear-gradient(90deg, ${accent} 0%, ${accent}CC 50%, ${accent}99 100%)`;
  const lbl = labelForType(t);
  if (lbl === "Forestilling")
    return "linear-gradient(90deg,#6d28d9 0%,#a21caf 50%,#d946ef 100%)";
  if (lbl === "Event")
    return "linear-gradient(90deg,#7f1d1d 0%,#991b1b 50%,#b91c1c 100%)";
  return "linear-gradient(90deg,#7f1d1d 0%,#b91c1c 50%,#dc2626 100%)";
};

const initials = (name?: string) =>
  ((name ?? "")
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase() ?? "")
    .join("")) || "A";

function uniquePeople(list: AnyObj[], keyFn: (m: AnyObj) => string) {
  const map = new Map<string, AnyObj>();
  for (const m of list) {
    const k = keyFn(m);
    if (k) map.set(k, m);
  }
  return Array.from(map.values());
}

/* Members (LS) */
function readMembersAll(): AnyObj[] {
  const v1 = safeJSON<any[]>(localStorage.getItem(LS_MEM_V1)) ?? [];
  const old = safeJSON<any[]>(localStorage.getItem(LS_MEM_OLD)) ?? [];
  const keyOf = (m: any) =>
    String(m?.id ?? m?.uuid ?? m?.memberId ?? m?._id ?? "");
  const map = new Map<string, AnyObj>();
  for (const m of [...old, ...v1]) map.set(keyOf(m), m);
  return Array.from(map.values());
}
function memberById(id: string, all: AnyObj[]): AnyObj | null {
  return (
    all.find(
      (m) =>
        String(m?.id ?? m?.uuid ?? m?.memberId ?? m?._id ?? "") === String(id)
    ) || null
  );
}
function memberIdByEmail(
  email: string | null | undefined,
  all: AnyObj[]
): string | null {
  if (!email) return null;
  const e = email.toLowerCase();
  const hit =
    all.find((m) => {
      const cand =
        m.email ||
        m.contact_email ||
        m.mail ||
        m.epost ||
        m.primary_email ||
        null;
      return cand && String(cand).toLowerCase() === e;
    }) || null;
  if (!hit) return null;
  return String(hit.id ?? hit.uuid ?? hit.memberId ?? hit._id ?? "");
}

/* Activity visuals (LS) */
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
  const hit = all.find(
    (a) => String(a?.id ?? a?.uuid ?? a?._id) === String(activityId)
  );
  if (!hit) return { coverUrl: null, accent: null };
  return { coverUrl: pickImageFlexible(hit), accent: pickAccentFlexible(hit) };
}

/* Enrollments (LS) */
function loadEnrollmentsLS(activityId: string): LSEnroll {
  const all =
    safeJSON<Record<string, LSEnroll>>(localStorage.getItem(ENR_LS)) ?? {};
  const cur = all[activityId] ?? { leaders: [], participants: [] };
  return {
    leaders: Array.from(new Set(cur.leaders.map(String))),
    participants: Array.from(new Set(cur.participants.map(String))),
  };
}
function saveEnrollmentsLS(activityId: string, data: LSEnroll) {
  const all =
    safeJSON<Record<string, LSEnroll>>(localStorage.getItem(ENR_LS)) ?? {};
  all[activityId] = {
    leaders: Array.from(new Set(data.leaders.map(String))),
    participants: Array.from(new Set(data.participants.map(String))),
  };
  localStorage.setItem(ENR_LS, JSON.stringify(all));
}
function addEnrollmentLS(
  activityId: string,
  memberId: string,
  role: "leader" | "participant"
) {
  const cur = loadEnrollmentsLS(activityId);
  if (role === "leader")
    cur.leaders = Array.from(new Set([...cur.leaders, String(memberId)]));
  else
    cur.participants = Array.from(
      new Set([...cur.participants, String(memberId)])
    );
  saveEnrollmentsLS(activityId, cur);
  return cur;
}

/* ------------------------ SessionsPanel – dynamisk klient ------------------- */

const SessionsPanel = dynamic(() => import("./SessionsPanel.client"), {
  ssr: false,
});

/* -------------------- Tab-oppsett fra DB (tab_config) -------------------- */

const ALL_TAB_KEYS: Tab[] = [
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

const TAB_SYNONYMS: Record<string, Tab> = {
  overview: "oversikt",
  oversikt: "oversikt",

  participants: "deltakere",
  participant: "deltakere",
  members: "deltakere",
  member: "deltakere",
  deltakere: "deltakere",

  leaders: "ledere",
  leader: "ledere",
  ledere: "ledere",

  sessions: "okter",
  session: "okter",
  okter: "okter",

  files: "filer",
  file: "filer",
  documents: "filer",
  docs: "filer",
  filer: "filer",

  messages: "meldinger",
  message: "meldinger",
  announcement: "meldinger",
  announcements: "meldinger",
  meldinger: "meldinger",

  guests: "gjester",
  guest: "gjester",
  gjester: "gjester",

  attendance: "innsjekk",
  checkin: "innsjekk",
  "check-in": "innsjekk",
  innsjekk: "innsjekk",

  volunteers: "frivillige",
  volunteer: "frivillige",
  frivillige: "frivillige",

  tasks: "oppgaver",
  task: "oppgaver",
  oppgaver: "oppgaver",
};

const normalizeTabKey = (raw: any): Tab | null => {
  if (raw == null) return null;
  const s = String(raw).trim().toLowerCase();
  if (!s) return null;
  if ((ALL_TAB_KEYS as string[]).includes(s)) return s as Tab;
  return TAB_SYNONYMS[s] ?? null;
};

function computeEnabledTabs(act: DbActivity | null): Tab[] {
  const fallbackBase: Tab[] = [
    "oversikt",
    "deltakere",
    "ledere",
    "okter",
    "filer",
    "meldinger",
  ];
  if (!act) return fallbackBase;

  const rawConfig = (act as any).tab_config as any;
  const validSet = new Set<Tab>(ALL_TAB_KEYS);
  const cleaned: Tab[] = [];

  if (Array.isArray(rawConfig)) {
    for (const entry of rawConfig) {
      const key = normalizeTabKey(entry);
      if (key && validSet.has(key) && !cleaned.includes(key)) cleaned.push(key);
    }
  } else if (rawConfig && typeof rawConfig === "object") {
    for (const [rk, val] of Object.entries(rawConfig)) {
      if (!val) continue;
      const key = normalizeTabKey(rk);
      if (key && validSet.has(key) && !cleaned.includes(key)) cleaned.push(key);
    }
  }

  if (cleaned.length) {
    if (!cleaned.includes("oversikt")) cleaned.unshift("oversikt");
    return cleaned;
  }

  const tabs = [...fallbackBase];
  if ((act as any).has_guests) tabs.push("gjester");
  if ((act as any).has_attendance) tabs.push("innsjekk");
  if ((act as any).has_volunteers) tabs.push("frivillige");
  if ((act as any).has_tasks) tabs.push("oppgaver");
  return tabs;
}

/* --------------------------------- Komponent -------------------------------- */

export default function ActivityDetailPage() {
  const params = useParams();
  const router = useRouter();
  const supabase = createClientComponentClient();

  const id = Array.isArray(params?.id)
    ? params.id[0]
    : (params?.id as string | undefined);

  const routeIdValue = String(id ?? "");

  const [tab, setTab] = useState<Tab>("oversikt");
  const [enabledTabs, setEnabledTabs] = useState<Tab[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  const [act, setAct] = useState<DbActivity | null>(null);
  const [vis, setVis] = useState<Visuals>({ coverUrl: null, accent: null });

  const [membersAll, setMembersAll] = useState<AnyObj[]>([]);
  const [participants, setParticipants] = useState<AnyObj[]>([]);
  const [leaders, setLeaders] = useState<AnyObj[]>([]);
  const [sessions, setSessions] = useState<any[]>([]);
  const [imgOk, setImgOk] = useState(true);

  const [meMemberId, setMeMemberId] = useState<string | null>(null);
  const [meError, setMeError] = useState<string | null>(null);
  const [enrLS, setEnrLS] = useState<LSEnroll>({
    leaders: [],
    participants: [],
  });

  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  const showGuestsTab = useMemo(() => Boolean((act as any)?.has_guests), [act]);
  const showAttendanceTab = useMemo(
    () => Boolean((act as any)?.has_attendance),
    [act]
  );
  const showVolunteersTab = useMemo(
    () => Boolean((act as any)?.has_volunteers),
    [act]
  );
  const showTasksTab = useMemo(() => Boolean((act as any)?.has_tasks), [act]);

  useEffect(() => {
    const next = computeEnabledTabs(act);
    setEnabledTabs(next);
    if (!next.includes(tab)) setTab("oversikt");
  }, [act, tab]);

  useEffect(() => {
    if (tab === "gjester" && !showGuestsTab) setTab("oversikt");
    if (tab === "innsjekk" && !showAttendanceTab) setTab("oversikt");
    if (tab === "frivillige" && !showVolunteersTab) setTab("oversikt");
    if (tab === "oppgaver" && !showTasksTab) setTab("oversikt");
  }, [showAttendanceTab, showGuestsTab, showTasksTab, showVolunteersTab, tab]);

  useEffect(() => {
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

        const allMembers = readMembersAll();
        setMembersAll(allMembers);

        const eLS = loadEnrollmentsLS(routeIdValue);
        setEnrLS(eLS);

        // Deltakere/ledere (DB-first) + LS-union
        try {
          const [pDB, lDB] = await Promise.all([
            getParticipants(routeIdValue),
            getLeaders(routeIdValue),
          ]);

          const byId = (m: any) =>
            String(m?.id ?? m?.uuid ?? m?.memberId ?? m?._id ?? "");

          const fromLS = (ids: string[]) =>
            ids
              .map((mid) => memberById(String(mid), allMembers))
              .filter(Boolean) as AnyObj[];

          setParticipants(
            uniquePeople([...(pDB || []), ...fromLS(eLS.participants)], byId)
          );
          setLeaders(uniquePeople([...(lDB || []), ...fromLS(eLS.leaders)], byId));
        } catch {
          const fromLS = (ids: string[]) =>
            ids
              .map((mid) => memberById(String(mid), allMembers))
              .filter(Boolean) as AnyObj[];
          setParticipants(fromLS(eLS.participants));
          setLeaders(fromLS(eLS.leaders));
        }

        // Sessions (LS)
        const SESS_LS = "follies.activitySessions.v1";
        const allSess =
          safeJSON<Record<string, any[]>>(localStorage.getItem(SESS_LS)) ?? {};
        setSessions(allSess[routeIdValue] ?? []);

        // Meg selv (Supabase → e-post → medlem)
        try {
          const { data } = await supabase.auth.getUser();
          const email = data?.user?.email ?? null;
          const myId = memberIdByEmail(email, allMembers);
          if (myId) {
            setMeMemberId(myId);
            setMeError(null);
          } else {
            setMeMemberId(null);
            setMeError(
              "Fant ingen medlem med din e-post. Opprett/lenk medlem først."
            );
          }
        } catch {
          // ikke kritisk
        }

        setLoading(false);
      } catch (e) {
        console.error(e);
        if (alive) {
          setErr("Noe gikk galt ved innlasting av aktiviteten.");
          setLoading(false);
        }
      }
    })();
    return () => {
      alive = false;
    };
  }, [routeIdValue]); // bevisst ikke supabase i deps

  const typeLabel = useMemo(() => labelForType((act as any)?.type), [act]);

  const enrolledIds: string[] = useMemo(() => {
    const idsFromPeople = [
      ...leaders.map((m) => String(m?.id ?? m?.uuid ?? m?.memberId ?? m?._id ?? "")),
      ...participants.map((m) =>
        String(m?.id ?? m?.uuid ?? m?.memberId ?? m?._id ?? "")
      ),
    ].filter(Boolean);

    const all = new Set<string>([
      ...idsFromPeople,
      ...enrLS.leaders.map(String),
      ...enrLS.participants.map(String),
    ]);
    return Array.from(all);
  }, [leaders, participants, enrLS]);

  if (!mounted) return null;
  if (loading)
    return <main className="px-4 py-6 text-neutral-900">Laster…</main>;
  if (err) {
    return (
      <main className="px-4 py-6 text-neutral-900">
        <div className="mb-3 font-semibold text-red-600">Feil</div>
        <div className="mb-4 text-sm text-red-700">{err}</div>
        <button
          onClick={() => router.push("/activities")}
          className="rounded-lg bg-red-600 px-4 py-2 text-sm font-semibold text-white hover:bg-red-700"
        >
          Tilbake til aktiviteter
        </button>
      </main>
    );
  }
  if (!act)
    return (
      <main className="px-4 py-6 text-neutral-900">Finner ikke aktiviteten.</main>
    );

  const gradient = gradientFor(vis.accent, (act as any)?.type);
  const avatar = vis.coverUrl || null;
  const initialsText = initials(act.name);

  const onAddMeAsLeader = () => {
    if (!meMemberId) {
      alert(meError || "Kunne ikke finne ditt medlem i medlemslisten.");
      return;
    }
    const updated = addEnrollmentLS(String(act.id), meMemberId, "leader");
    setEnrLS(updated);
    const meObj = memberById(meMemberId, membersAll);
    if (
      meObj &&
      !leaders.some((m) => String(m.id ?? m._id) === String(meMemberId))
    ) {
      setLeaders((prev) => [...prev, meObj]);
    }
  };

  // Tab-defs (viser kun de som er aktivert i enabledTabs + feature-flagg)
  type TabDef = { key: Tab; label: string };

  const baseDefs: TabDef[] = [
    { key: "oversikt", label: "Oversikt" },
    { key: "deltakere", label: `Deltakere (${participants.length})` },
    { key: "ledere", label: `Ledere (${leaders.length})` },
    { key: "okter", label: "Økter" },
  ];
  const extras: TabDef[] = [];
  if (showGuestsTab) extras.push({ key: "gjester", label: "Gjester" });
  if (showAttendanceTab) extras.push({ key: "innsjekk", label: "Innsjekk" });
  if (showVolunteersTab) extras.push({ key: "frivillige", label: "Frivillige" });
  if (showTasksTab) extras.push({ key: "oppgaver", label: "Oppgaver" });

  const tailDefs: TabDef[] = [
    { key: "filer", label: "Filer" },
    { key: "meldinger", label: "Meldinger" },
  ];

  const allDefs = [...baseDefs, ...extras, ...tailDefs];

  const isTabFeatureAvailable = (key: Tab) => {
    if (key === "gjester") return showGuestsTab;
    if (key === "innsjekk") return showAttendanceTab;
    if (key === "frivillige") return showVolunteersTab;
    if (key === "oppgaver") return showTasksTab;
    return true;
  };

  const visibleDefs = allDefs.filter(
    (d) => enabledTabs.includes(d.key) && isTabFeatureAvailable(d.key)
  );

  return (
    <main className="mx-auto max-w-7xl px-4 py-8 text-neutral-900">
      {/* HERO */}
      <div
        className="rounded-2xl border border-black/10 p-5 shadow-md md:p-6 lg:p-7"
        style={{ background: gradient }}
      >
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
              <p className="mt-1 text-sm text-white/90">
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

          <div className="flex flex-wrap items-center gap-2">
            <Link
              href="/activities"
              className="rounded-lg bg-white/15 px-3.5 py-2 text-sm font-semibold text-white ring-1 ring-white/40 hover:bg-white/25"
            >
              Til oversikt
            </Link>
            <button
              onClick={() => router.push(`/activities/${act.id}/edit`)}
              className="rounded-lg bg-white px-3.5 py-2 text-sm font-semibold text-neutral-900 hover:bg-white/90"
            >
              Rediger
            </button>
            <button
              onClick={onAddMeAsLeader}
              className="rounded-lg bg-white/15 px-3.5 py-2 text-sm font-semibold text-white ring-1 ring-white/40 hover:bg-white/25"
              title={meError || undefined}
            >
              Legg meg til som leder
            </button>
          </div>
        </div>
      </div>

      {/* Faner (pill-stil) */}
      <div className="mt-6 flex flex-wrap items-center gap-2 rounded-2xl border border-zinc-300 bg-white/80 p-1 shadow-sm backdrop-blur-sm">
        {visibleDefs.map(({ key, label }) => (
          <button
            key={key}
            onClick={() => setTab(key)}
            className={`rounded-xl px-4 py-2 text-sm font-semibold transition-colors ${
              tab === key
                ? "bg-white text-zinc-900 shadow-sm"
                : "text-zinc-500 hover:bg-white/70 hover:text-zinc-800"
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {/* Innhold (FULL bredde, ingen høyre aside) */}
      <div className="mt-6 space-y-6">
        {tab === "oversikt" && (
          <div className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm">
            <h2 className="text-lg font-semibold">Oversikt</h2>
            <p className="mt-2 text-[15px] text-neutral-800">
              {(act as any).description ? (act as any).description : "Ingen beskrivelse."}
            </p>
          </div>
        )}

        {tab === "deltakere" && (
          <PeoplePanel title="Deltakere" people={participants} />
        )}

        {tab === "ledere" && <PeoplePanel title="Ledere" people={leaders} />}

        {tab === "okter" && (
          <SessionsPanel
            activityId={String(act.id)}
            activityName={act.name}
            sessions={sessions}
            setSessions={setSessions}
            participants={participants}
            leaders={leaders}
            enrolledIds={enrolledIds}
          />
        )}

        {tab === "gjester" && showGuestsTab && (
          <GuestsTab activityId={String(act.id)} />
        )}

        {tab === "innsjekk" && showAttendanceTab && (
          <AttendanceTab activityId={String(act.id)} activityName={act.name} />
        )}

        {tab === "frivillige" && showVolunteersTab && (
          <VolunteersTab activityId={String(act.id)} />
        )}

        {tab === "oppgaver" && showTasksTab && (
          <TasksTab activityId={
