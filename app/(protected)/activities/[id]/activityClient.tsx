"use client";

/**
 * Klientside for aktivitetsdetaljer.
 * - Vinrød/lilla hero
 * - Faner (Oversikt, Deltakere, Ledere, Økter, ...)
 * - "Legg meg til som leder" (LS + Supabase e-post → medlemmer)
 * - DB-first + LS-fallback for deltakere/ledere
 * - Økter speiles til follies.calendar.v1
 */

import { useEffect, useMemo, useState } from "react";
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

/* ----------------------------- Typer & constants ---------------------------- */

type AnyObj = Record<string, any>;
type Tab = "oversikt" | "deltakere" | "ledere" | "okter" | "filer" | "meldinger";
type Visuals = { coverUrl: string | null; accent: string | null };
type LSEnroll = { leaders: string[]; participants: string[] };

const LS_ACT_V1 = "follies.activities.v1";
const LS_ACT_OLD = "follies.activities";
const LS_MEM_V1 = "follies.members.v1";
const LS_MEM_OLD = "follies.members";
const ENR_LS = "follies.enrollments.v1";

/* ------------------------------ Hjelpefunksjoner ---------------------------- */

const safeJSON = <T,>(s: string | null): T | null => {
  try { return s ? (JSON.parse(s) as T) : null; } catch { return null; }
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
  if (lbl === "Event") return "bg-rose-700";
  return "bg-red-700";
};

const gradientFor = (accent?: string | null, t?: string | null) => {
  if (accent) return `linear-gradient(90deg, ${accent} 0%, ${accent}CC 50%, ${accent}99 100%)`;
  const lbl = labelForType(t);
  if (lbl === "Forestilling") return "linear-gradient(90deg,#6d28d9 0%,#a21caf 50%,#d946ef 100%)";
  if (lbl === "Event") return "linear-gradient(90deg,#be123c 0%,#e11d48 50%,#f43f5e 100%)";
  return "linear-gradient(90deg,#7f1d1d 0%,#b91c1c 50%,#dc2626 100%)";
};

const initials = (name?: string) =>
  ((name ?? "").trim().split(/\s+/).slice(0, 2).map((p) => p[0]?.toUpperCase() ?? "").join("")) || "A";

function uniquePeople(list: AnyObj[], keyFn: (m: AnyObj) => string) {
  const map = new Map<string, AnyObj>();
  for (const m of list) { const k = keyFn(m); if (k) map.set(k, m); }
  return Array.from(map.values());
}

/* Members (LS) */
function readMembersAll(): AnyObj[] {
  const v1 = safeJSON<any[]>(localStorage.getItem(LS_MEM_V1)) ?? [];
  const old = safeJSON<any[]>(localStorage.getItem(LS_MEM_OLD)) ?? [];
  const keyOf = (m: any) => String(m?.id ?? m?.uuid ?? m?.memberId ?? m?._id ?? "");
  const map = new Map<string, AnyObj>();
  for (const m of [...old, ...v1]) map.set(keyOf(m), m);
  return Array.from(map.values());
}
function memberById(id: string, all: AnyObj[]): AnyObj | null {
  return all.find((m) => String(m?.id ?? m?.uuid ?? m?.memberId ?? m?._id ?? "") === String(id)) || null;
}
function memberIdByEmail(email: string | null | undefined, all: AnyObj[]): string | null {
  if (!email) return null;
  const e = email.toLowerCase();
  const hit =
    all.find((m) => {
      const cand = m.email || m.contact_email || m.mail || m.epost || m.primary_email || null;
      return cand && String(cand).toLowerCase() === e;
    }) || null;
  if (!hit) return null;
  return String(hit.id ?? hit.uuid ?? hit.memberId ?? hit._id ?? "");
}

/* Activity visuals (LS) */
function pickImageFlexible(a: any): string | null {
  return (
    a?.coverUrl || a?.cover_url || a?.cover || a?.image_url || a?.image || a?.bannerUrl || a?.banner_url ||
    a?.thumb || a?.thumbnail || a?.avatar || a?.logo || a?.icon || a?.media?.cover || a?.media?.image ||
    a?.image?.url || a?.cover?.url || a?.assets?.cover || a?.assets?.image || null
  );
}
function pickAccentFlexible(a: any): string | null {
  const v = a?.accent || a?.accentColor || a?.color || a?.themeColor || a?.primary_color || a?.style?.accent || null;
  return v ? String(v) : null;
}
function visualsFromLocalStorage(activityId: string): Visuals {
  const v1 = safeJSON<any[]>(localStorage.getItem(LS_ACT_V1)) ?? [];
  const old = safeJSON<any[]>(localStorage.getItem(LS_ACT_OLD)) ?? [];
  const all = [...old, ...v1];
  const hit = all.find((a) => String(a?.id ?? a?.uuid ?? a?._id) === String(activityId));
  if (!hit) return { coverUrl: null, accent: null };
  return { coverUrl: pickImageFlexible(hit), accent: pickAccentFlexible(hit) };
}

/* Enrollments (LS) */
function loadEnrollmentsLS(activityId: string): LSEnroll {
  const all = safeJSON<Record<string, LSEnroll>>(localStorage.getItem(ENR_LS)) ?? {};
  const cur = all[activityId] ?? { leaders: [], participants: [] };
  return {
    leaders: Array.from(new Set(cur.leaders.map(String))),
    participants: Array.from(new Set(cur.participants.map(String))),
  };
}
function saveEnrollmentsLS(activityId: string, data: LSEnroll) {
  const all = safeJSON<Record<string, LSEnroll>>(localStorage.getItem(ENR_LS)) ?? {};
  all[activityId] = {
    leaders: Array.from(new Set(data.leaders.map(String))),
    participants: Array.from(new Set(data.participants.map(String))),
  };
  localStorage.setItem(ENR_LS, JSON.stringify(all));
}
function addEnrollmentLS(activityId: string, memberId: string, role: "leader" | "participant") {
  const cur = loadEnrollmentsLS(activityId);
  if (role === "leader") cur.leaders = Array.from(new Set([...cur.leaders, String(memberId)]));
  else cur.participants = Array.from(new Set([...cur.participants, String(memberId)]));
  saveEnrollmentsLS(activityId, cur);
  return cur;
}

/* ------------------------ SessionsPanel – dynamisk klient ------------------- */

const SessionsPanel = dynamic(() => import("./SessionsPanel.client"), { ssr: false });

/* --------------------------------- Komponent -------------------------------- */

export default function ActivityClient() {
  const params = useParams();
  const router = useRouter();
  const supabase = createClientComponentClient();

  // NB: ingen tidlig return før hooks er definert
  const id = Array.isArray(params?.id) ? params.id[0] : (params?.id as string | undefined);

  const [tab, setTab] = useState<Tab>("oversikt");
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
  const [enrLS, setEnrLS] = useState<LSEnroll>({ leaders: [], participants: [] });

  // Monteringsvakt (eliminer SSR/HMR-diff): ikke strengt nødvendig her,
  // men gjør render-path identisk hver gang i dev.
  const [mounted, setMounted] = useState(false);
  useEffect(() => { setMounted(true); }, []);

  useEffect(() => {
    let alive = true;
    (async () => {
      if (!id) {
        setErr("Mangler aktivitets-ID i URLen.");
        setLoading(false);
        return;
      }
      try {
        setLoading(true);
        setErr(null);

        // Aktivitet
        let a = await fetchActivity(String(id));
        if (!a) {
          const res = await fetchActivities();
          a = res.data.find((x) => String(x.id) === String(id)) ?? null;
        }
        if (!alive) return;

        if (!a) {
          setErr(`Fant ikke aktiviteten (id: ${id}).`);
          setLoading(false);
          return;
        }
        setAct(a);
        setVis(visualsFromLocalStorage(String(id)));

        // Medlemmer (LS)
        const allMembers = readMembersAll();
        setMembersAll(allMembers);

        // Enrollments (LS)
        const eLS = loadEnrollmentsLS(String(id));
        setEnrLS(eLS);

        // Deltakere/ledere (DB-first) + LS-union
        try {
          const [pDB, lDB] = await Promise.all([getParticipants(String(id)), getLeaders(String(id))]);

          const byId = (m: any) => String(m?.id ?? m?.uuid ?? m?.memberId ?? m?._id ?? "");
          const fromLS = (ids: string[]) =>
            ids.map((mid) => memberById(String(mid), allMembers)).filter(Boolean) as AnyObj[];

          setParticipants(uniquePeople([...(pDB || []), ...fromLS(eLS.participants)], byId));
          setLeaders(uniquePeople([...(lDB || []), ...fromLS(eLS.leaders)], byId));
        } catch {
          const fromLS = (ids: string[]) =>
            ids.map((mid) => memberById(String(mid), allMembers)).filter(Boolean) as AnyObj[];
          setParticipants(fromLS(eLS.participants));
          setLeaders(fromLS(eLS.leaders));
        }

        // Sessions (LS)
        const SESS_LS = "follies.activitySessions.v1";
        const allSess = safeJSON<Record<string, any[]>>(localStorage.getItem(SESS_LS)) ?? {};
        setSessions(allSess[String(id)] ?? []);

        // Meg selv (Supabase → e-post → medlem)
        try {
          const { data } = await supabase.auth.getUser();
          const email = data?.user?.email ?? null;
          const myId = memberIdByEmail(email, allMembers);
          if (myId) { setMeMemberId(myId); setMeError(null); }
          else { setMeMemberId(null); setMeError("Fant ingen medlem med din e-post. Opprett/lenk medlem først."); }
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
    return () => { alive = false; };
  }, [id]); // bevisst ikke supabase i deps

  const typeLabel = useMemo(() => labelForType((act as any)?.type), [act]);

  const enrolledIds: string[] = useMemo(() => {
    const idsFromPeople = [
      ...leaders.map((m) =>
        String(m?.id ?? m?.uuid ?? m?.memberId ?? m?._id ?? "")
      ),
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

  if (!mounted) return null;                // ⬅️ sørger for ren CSR-path i dev
  if (loading) return <main className="px-4 py-6 text-neutral-900">Laster…</main>;
  if (err) {
    return (
      <main className="px-4 py-6 text-neutral-900">
        <div className="text-red-600 mb-3 font-semibold">Feil</div>
        <div className="text-red-700 text-sm mb-4">{err}</div>
        <button onClick={() => router.push("/activities")} className="rounded-lg bg-red-600 hover:bg-red-700 px-4 py-2 text-white text-sm font-semibold">
          Tilbake til aktiviteter
        </button>
      </main>
    );
  }
  if (!act) return <main className="px-4 py-6 text-neutral-900">Finner ikke aktiviteten.</main>;

  /* HERO */
  const gradient = gradientFor(vis.accent, (act as any)?.type);
  const avatar = vis.coverUrl || null;
  const initialsText = initials(act.name);

  const onAddMeAsLeader = () => {
    if (!meMemberId) { alert(meError || "Kunne ikke finne ditt medlem i medlemslisten."); return; }
    const updated = addEnrollmentLS(String(act.id), meMemberId, "leader");
    setEnrLS(updated);
    const meObj = memberById(meMemberId, membersAll);
    if (meObj && !leaders.some((m) => String(m.id ?? m._id) === String(meMemberId))) {
      setLeaders((prev) => [...prev, meObj]);
    }
  };

  return (
    <main className="mx-auto max-w-7xl px-4 py-8 text-neutral-900">
      {/* HERO */}
      <div
        className="rounded-2xl border border-black/10 p-5 shadow-md md:p-6 lg:p-7"
        style={{ background: gradient }}
      >
        <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div className="flex items-center gap-4">
            <div className="relative h-16 w-16 overflow-hidden rounded-2xl ring-1 ring-white/60 bg-white/10 backdrop-blur-[1px] flex items-center justify-center text-xl font-semibold text-white">
              {avatar ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={avatar} alt="" className="h-full w-full object-cover" onError={() => setImgOk(false)} />
              ) : (
                <span>{initialsText}</span>
              )}
            </div>
            <div>
              <div className="flex items-center gap-3">
                <h1 className="text-3xl font-semibold tracking-tight text-white">{act.name}</h1>
                <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold text-white ${typeClass((act as any)?.type)} ring-1 ring-white/40`}>
                  {typeLabel}
                </span>
              </div>
              <p className="mt-1 text-sm text-white/90">
                {act.start_date ? `Start: ${act.start_date}` : "Start: —"} · {act.end_date ? `Slutt: ${act.end_date}` : "Slutt: —"}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <Link href="/activities" className="rounded-lg bg-white/15 px-3.5 py-2 text-sm font-semibold text-white ring-1 ring-white/40 hover:bg-white/25">
              Til oversikt
            </Link>
            <button onClick={() => router.push(`/activities/${act.id}/edit`)} className="rounded-lg bg-white px-3.5 py-2 text-sm font-semibold text-neutral-900 hover:bg-white/90">
              Rediger
            </button>
            <button onClick={onAddMeAsLeader} className="rounded-lg bg-white/15 px-3.5 py-2 text-sm font-semibold text-white ring-1 ring-white/40 hover:bg-white/25" title={meError || undefined}>
              Legg meg til som leder
            </button>
          </div>
        </div>
      </div>

      {/* Faner */}
      <div className="mt-6 flex gap-6 border-b border-neutral-200">
        {([
          ["oversikt", "Oversikt"],
          ["deltakere", `Deltakere (${participants.length})`],
          ["ledere", `Ledere (${leaders.length})`],
          ["okter", "Økter"],
          ["filer", "Filer"],
          ["meldinger", "Meldinger"],
        ] as [Tab, string][]).map(([key, label]) => (
          <button
            key={key}
            onClick={() => setTab(key)}
            className={`-mb-px border-b-2 pb-2 transition-colors ${
              tab === key
                ? "border-zinc-900 text-zinc-900"
                : "border-transparent text-zinc-500 hover:text-zinc-700"
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {/* Innhold */}
      <div className="mt-6 grid gap-6 lg:grid-cols-3">
        <section className="lg:col-span-2 space-y-6">
          {tab === "oversikt" && (
            <div className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm">
              <h2 className="text-lg font-semibold">Oversikt</h2>
              <p className="mt-2 text-[15px] text-neutral-800">{act.description ? act.description : "Ingen beskrivelse."}</p>
            </div>
          )}

          {tab === "deltakere" && <PeoplePanel title="Deltakere" people={participants} />}
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

          {tab === "filer" && (
            <div className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm text-neutral-700">
              Her kan vi senere legge opplasting/visning av filer (Bilder/Tekst/Musikk/Annet).
            </div>
          )}

          {tab === "meldinger" && (
            <div className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm text-neutral-700">
              Her kan vi senere legge kunngjøringer/meldinger til deltakere/ledere.
            </div>
          )}
        </section>

        <aside className="space-y-6">
          <div className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm">
            <h3 className="text-sm font-semibold text-neutral-900">Info</h3>
            <dl className="mt-3 text-sm text-neutral-700 space-y-2">
              <div className="flex justify-between gap-4"><dt>Type</dt><dd className="font-medium">{typeLabel}</dd></div>
              <div className="flex justify-between gap-4"><dt>Status</dt><dd className="font-medium">{(act as any)?.archived ? "Arkivert" : "Aktiv"}</dd></div>
              <div className="flex justify-between gap-4"><dt>Start</dt><dd className="font-medium">{(act as any)?.start_date || "—"}</dd></div>
              <div className="flex justify-between gap-4"><dt>Slutt</dt><dd className="font-medium">{(act as any)?.end_date || "—"}</dd></div>
            </dl>
          </div>
        </aside>
      </div>
    </main>
  );
}

/* --- småkomponenter uten hooks --- */
function PeoplePanel({ title, people }: { title: string; people: AnyObj[] }) {
  return (
    <div className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold text-neutral-900">{title}</h2>
        <span className="inline-flex items-center rounded-full bg-black/85 px-3 py-1 text-xs font-semibold text-white ring-1 ring-white/10">
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
              `${m.first_name || m.fornavn || ""} ${m.last_name || m.etternavn || ""}`.trim() ||
              m.name || "Uten navn";
            const email = m.email || m.contact_email || null;
            const phone = m.phone || m.mobile || m.telephone || null;
            return (
              <li key={mid} className="flex items-center justify-between gap-3 py-3">
                <div>
                  <p className="text-[15px] font-medium text-neutral-900">{name}</p>
                  <p className="text-xs text-neutral-700">
                    {email ? <span>{email}</span> : <span className="text-neutral-500">Ingen e-post</span>}
                    {phone ? <span> · {phone}</span> : null}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <Link href={`/members/${mid}`} className="rounded-lg bg-white px-3 py-1.5 text-sm font-semibold text-neutral-900 ring-1 ring-neutral-300 hover:bg-neutral-100">
                    Åpne
                  </Link>
                  <Link href={`/members/${mid}/edit`} className="rounded-lg bg-red-600 px-3 py-1.5 text-sm font-semibold text-white hover:bg-red-700">
                    Rediger
                  </Link>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
