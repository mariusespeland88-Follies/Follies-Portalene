"use client";

import * as React from "react";

/**
 * Medlemmer – Indigo/Sky “Bold Glow”
 * DESIGN: badge ved avatar, navn/e-post lenger ned, større avstand mellom knapper.
 * LOGIKK: urørt (DB-first, LS-fallback, speiling, roller/filtrering).
 */

type AnyObj = Record<string, any>;

const MEM_V1 = "follies.members.v1";
const MEM_FB = "follies.members";
const PERMS  = "follies.perms.v1";

/* ---------------- utils (uendret) ---------------- */
function parseJSON<T>(raw: string | null, fallback: T): T {
  try { return raw ? (JSON.parse(raw) as T) : fallback; } catch { return fallback; }
}
function readLS(key: string): string | null {
  if (typeof window === "undefined") return null;
  return window.localStorage.getItem(key);
}
function writeLS(key: string, value: any) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(key, JSON.stringify(value));
}
function toStr(v: any): string {
  try { return v == null ? "" : String(v); } catch { return ""; }
}
function pick(o: AnyObj, keys: string[], fb: any = ""): any {
  for (const k of keys) if (o && o[k] !== undefined) return o[k];
  return fb;
}
function idAliases(o: AnyObj): string[] {
  return [o?.id, o?.uuid, o?._id, o?.memberId].map(toStr).filter(Boolean);
}
function matchesId(o: AnyObj, id: string): boolean {
  return idAliases(o).some((x) => x === id);
}
function memberId(m: AnyObj): string {
  return toStr(m.id ?? m.uuid ?? m._id ?? m.memberId);
}
function fullName(m: AnyObj): string {
  const fn = pick(m, ["first_name","firstName","fornavn"], "");
  const ln = pick(m, ["last_name","lastName","etternavn"], "");
  const full = pick(m, ["full_name","fullName","name","navn"], "");
  return (full ? String(full) : [fn, ln].filter(Boolean).join(" ").trim()) || "Uten navn";
}
function emailOf(m: AnyObj): string {
  return pick(m, ["email","epost","mail"], "");
}

/* --------------- data readers (LS) --------------- */
function readMembersLS(): AnyObj[] {
  const v1 = parseJSON<AnyObj[]>(readLS(MEM_V1), []);
  const fb = parseJSON<AnyObj[]>(readLS(MEM_FB), []);
  const all = [...fb, ...v1];
  const map = new Map<string, AnyObj>();
  for (const m of all) {
    const key = memberId(m);
    if (!key) continue;
    map.set(key, m);
  }
  return Array.from(map.values());
}
function writeMembersLS(list: AnyObj[]) {
  writeLS(MEM_V1, Array.isArray(list) ? list : []);
}
type Perms = Record<string, { roles?: string[] }>;
function readPermsLS(): Perms {
  const p = parseJSON<Perms>(readLS(PERMS), {});
  return p && typeof p === "object" ? p : {};
}
function writePermsLS(p: Perms) { writeLS(PERMS, p || {}); }

/* --------------- roles helpers (uendret) --------------- */
function rolesOfMember(perms: Perms, memberIdStr: string, fallbackMember?: AnyObj): string[] {
  const rec = perms[memberIdStr];
  if (rec && Array.isArray(rec.roles)) return rec.roles;
  const r = pick(fallbackMember || {}, ["roles","roller"], []);
  if (Array.isArray(r)) return r.map(toStr);
  const single = pick(fallbackMember || {}, ["role","rolle"], "");
  return single ? [toStr(single)] : [];
}
function isLeader(perms: Perms, member: AnyObj): boolean {
  const id = memberId(member);
  const roles = rolesOfMember(perms, id, member).map((x) => x.toLowerCase());
  return roles.includes("leader") || roles.includes("leder") || roles.includes("staff") || roles.includes("admin");
}
type TabKey = "members" | "leaders";

/* ----------------- UI bits (design) ----------------- */

function LightHeader({
  members, leaders, search, setSearch, me
}: {
  members: number; leaders: number;
  search: string; setSearch: (v: string) => void;
  me?: { id?: string; member?: AnyObj | null };
}) {
  return (
    <div className="relative overflow-hidden rounded-3xl border border-red-900/50 bg-gradient-to-r from-red-950 via-red-900 to-red-700 shadow-xl shadow-red-900/30 text-white">
      <div className="pointer-events-none absolute -top-32 -left-24 h-64 w-64 rounded-full bg-red-500/30 blur-3xl" />
      <div className="pointer-events-none absolute -bottom-28 -right-24 h-72 w-72 rounded-full bg-black/40 blur-3xl" />
      <div className="relative z-10 p-8">
        <div className="flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <h1 className="text-4xl font-extrabold tracking-tight text-white">Medlemmer</h1>
            <p className="mt-1 text-red-100/90">Administrer alle medlemmer og ledere i Follies.</p>
            <div className="mt-5 grid grid-cols-2 gap-3 sm:max-w-sm">
              <StatPill label="Medlemmer" value={members} />
              <StatPill label="Ledere" value={leaders} />
            </div>
          </div>
          <div className="flex w-full max-w-lg flex-col items-stretch gap-3">
            <Search value={search} onChange={setSearch} />
            <div className="flex gap-2">
              {me?.member ? (
                <a
                  href={`/members/${encodeURIComponent(memberId(me.member!))}/edit`}
                  className="inline-flex items-center justify-center rounded-xl border border-white/40 bg-white px-4 py-2.5 text-sm font-semibold text-red-800 transition hover:bg-white/90 hover:text-red-900"
                >
                  Rediger meg
                </a>
              ) : null}
              <a
                href="/members/new"
                className="inline-flex items-center justify-center rounded-xl bg-red-500 px-4 py-2.5 text-sm font-semibold text-white shadow shadow-black/20 transition hover:bg-red-400"
              >
                + Nytt medlem
              </a>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function StatPill({ label, value }: { label: string; value: number | string }) {
  return (
    <div className="rounded-2xl border border-red-700/40 bg-white/90 px-5 py-4 shadow-sm shadow-red-900/10 backdrop-blur">
      <p className="text-[11px] uppercase tracking-wider text-red-700/90">{label}</p>
      <p className="text-xl font-bold text-red-900">{value}</p>
    </div>
  );
}

function Tabs({ tab, setTab }: { tab: TabKey; setTab: (t: TabKey) => void }) {
  const btn = "px-5 py-2 rounded-2xl text-sm font-semibold transition";
  return (
    <div className="inline-flex items-center gap-1 rounded-2xl bg-white p-1 ring-1 ring-neutral-200 shadow-sm">
      {[
        { key: "members", label: "Medlemmer" },
        { key: "leaders", label: "Ledere" },
      ].map((t) => {
        const active = tab === (t.key as TabKey);
        return (
          <button
            key={t.key}
            onClick={() => setTab(t.key as TabKey)}
            className={
              active
                ? `${btn} bg-red-600 text-white shadow shadow-red-500/40`
                : `${btn} text-neutral-600 hover:text-neutral-900 hover:bg-neutral-100`
            }
          >
            {t.label}
          </button>
        );
      })}
    </div>
  );
}

function Search({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return (
    <div className="relative w-full">
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder="Søk navn, e-post eller rolle…"
        className="w-full rounded-2xl border border-white/40 bg-white/95 px-11 py-2.5 text-sm text-neutral-900 placeholder:text-neutral-500 outline-none focus:border-white focus:ring-2 focus:ring-red-300/80"
      />
      <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3">
        <svg width="16" height="16" viewBox="0 0 24 24" className="fill-red-500">
          <path d="M10 2a8 8 0 105.293 14.293l4.207 4.207 1.414-1.414-4.207-4.207A8 8 0 0010 2zm0 2a6 6 0 110 12A6 6 0 0110 4z" />
        </svg>
      </div>
    </div>
  );
}

function Avatar({ name }: { name: string }) {
  const letters = (name || "")
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((s) => s[0]?.toUpperCase() ?? "")
    .join("");
  return (
    <div className="relative">
      <div className="absolute -inset-1 rounded-3xl bg-gradient-to-br from-red-700 via-red-500 to-red-400 opacity-70 blur" />
      <div className="relative flex h-20 w-20 items-center justify-center rounded-3xl bg-white text-lg font-semibold text-neutral-800 ring-1 ring-red-500/40">
        {letters || "?"}
      </div>
    </div>
  );
}

function Badge({ leader, text }: { leader: boolean; text: string }) {
  return leader ? (
    <span className="inline-flex items-center rounded-full bg-red-600 px-3 py-1 text-[12px] font-semibold text-white shadow shadow-red-600/40">
      {text}
    </span>
  ) : (
    <span className="inline-flex items-center rounded-full border border-neutral-200 bg-white px-3 py-1 text-[12px] font-semibold text-neutral-700">
      {text}
    </span>
  );
}

/* ----------------- Component (LOGIKK uendret) ----------------- */
export default function MembersPage() {
  const [tab, setTab] = React.useState<TabKey>("members");
  const [search, setSearch] = React.useState("");

  // Kilder
  const [listLS, setListLS]   = React.useState<AnyObj[]>([]);
  const [permsLS, setPermsLS] = React.useState<Perms>({});
  const [listDB, setListDB]   = React.useState<AnyObj[]>([]);
  const [permsDB, setPermsDB] = React.useState<Perms>({});

  const [me, setMe] = React.useState<{ id?: string; email?: string; member?: AnyObj | null }>({});

  // Init: LS + identitet (uendret)
  React.useEffect(() => {
    const ms = readMembersLS();
    const p  = readPermsLS();
    setListLS(ms);
    setPermsLS(p);

    const id = toStr(parseJSON<string | null>(readLS("follies.currentMemberId"), null));
    const email =
      toStr(parseJSON<string | null>(readLS("follies.currentEmail"), null)) ||
      toStr(parseJSON<string | null>(readLS("follies.session.email"), null)) ||
      toStr(readLS("follies.session.email") ?? "");
    let member: AnyObj | null = null;
    if (id) member = ms.find((m) => matchesId(m, id)) ?? null;
    if (!member && email) {
      const lower = email.toLowerCase();
      member = ms.find((m) => emailOf(m)?.toLowerCase() === lower) ?? null;
    }
    setMe({ id, email, member });
  }, []);

  // Hent fra Supabase + speil DB → LS (uendret)
  async function loadFromSupabase() {
    try {
      const res = await fetch("/api/members/list", { cache: "no-store" });
      if (!res.ok) {
        setListDB([]);
        setPermsDB({});
        return;
      }

      const payload = await res.json().catch(() => ({}));
      const list = Array.isArray(payload?.members) ? (payload.members as AnyObj[]) : [];
      const rolesMap: Perms = payload?.roles && typeof payload.roles === "object" ? payload.roles : {};

      setListDB(list);
      setPermsDB(rolesMap);

      // SPEIL til LS (merge per id – DB vinner)
      const currentLS = readMembersLS();
      const lsMap = new Map(currentLS.map((m) => [memberId(m), m]));
      for (const m of list) {
        const id = memberId(m);
        if (!id) continue;
        const prev = lsMap.get(id) || {};
        lsMap.set(id, { ...prev, ...m });
      }
      const mergedLS = Array.from(lsMap.values());
      writeMembersLS(mergedLS);
      setListLS(mergedLS);

      // og roller
      const curPerms = readPermsLS();
      const nextPerms: Perms = { ...curPerms };
      for (const [id, value] of Object.entries(rolesMap)) {
        nextPerms[id] = { roles: Array.isArray(value?.roles) ? value.roles : [] };
      }
      writePermsLS(nextPerms);
      setPermsLS(nextPerms);

      try {
        window.dispatchEvent(new CustomEvent("follies:member-sync"));
      } catch {}
    } catch {
      setListDB([]);
      setPermsDB({});
    }
  }

  React.useEffect(() => {
    loadFromSupabase();
    const h = () => loadFromSupabase();
    try { window.addEventListener("follies:auth-sync", h); } catch {}
    return () => { try { window.removeEventListener("follies:auth-sync", h); } catch {} };
  }, []);

  // Velg kilde (uendret)
  const useDB = listDB.length > 0;
  const list  = useDB ? listDB : listLS;
  const perms = useDB ? permsDB : permsLS;

  const counts = React.useMemo(() => {
    let leaders = 0;
    for (const m of list) if (isLeader(perms, m)) leaders++;
    return { total: list.length, leaders, members: Math.max(0, list.length - leaders) };
  }, [list, perms]);

  const filtered = React.useMemo(() => {
    const q = search.trim().toLowerCase();
    const items = list.filter((m) => {
      const leader = isLeader(perms, m);
      if (tab === "leaders" && !leader) return false;
      if (tab === "members" && leader) return false;
      if (!q) return true;
      const nm = fullName(m).toLowerCase();
      const em = emailOf(m).toLowerCase();
      return nm.includes(q) || em.includes(q);
    });
    return items.sort((a, b) => fullName(a).localeCompare(fullName(b), "nb"));
  }, [list, perms, tab, search]);

  /* ---------------- UI ---------------- */
  return (
    <div className="mx-auto max-w-7xl space-y-6 p-6 text-neutral-900">
      <LightHeader
        members={counts.members}
        leaders={counts.leaders}
        search={search}
        setSearch={setSearch}
        me={me}
      />

      <div className="flex flex-col items-start gap-3 sm:flex-row sm:items-center sm:justify-between">
        <Tabs tab={tab} setTab={setTab} />
      </div>

      {/* Grid – brede kort */}
      {filtered.length === 0 ? (
        <div className="rounded-3xl border border-dashed border-red-500/50 bg-white p-10 text-center shadow-sm">
          <h3 className="text-lg font-semibold text-neutral-900">Ingen treff</h3>
          <p className="mt-1 text-neutral-600">
            {search ? `Fant ingen resultater for “${search}”.` : "Det ligger ingen personer i denne kategorien ennå."}
          </p>
          <a
            href="/members/new"
            className="mt-4 inline-flex rounded-xl bg-red-600 px-3.5 py-2.5 text-sm font-semibold text-white shadow shadow-red-500/40 transition hover:bg-red-500"
          >
            + Nytt medlem
          </a>
        </div>
      ) : (
        <ul className="grid grid-cols-1 gap-7 sm:grid-cols-2 lg:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
          {filtered.map((m) => {
            const id    = memberId(m);
            const name  = fullName(m);
            const email = emailOf(m);
            const leader = isLeader(perms, m);

            return (
              <li
                key={id}
                className="group relative flex min-h-[220px] flex-col justify-between overflow-hidden rounded-3xl border border-neutral-200 bg-white p-8 shadow-sm transition hover:-translate-y-0.5 hover:shadow-lg"
              >
                {/* toppstripe */}
                <div className="pointer-events-none absolute left-0 top-0 h-[4px] w-full bg-gradient-to-r from-red-600 via-red-500 to-red-600 opacity-95" />

                {/* øvre del: avatar + badge */}
                <div className="flex items-start justify-between gap-5">
                  <div className="flex items-start gap-5">
                    <Avatar name={name} />
                    <div className="flex flex-col">
                      <Badge leader={leader} text={leader ? "LEDER" : "MEDLEM"} />
                    </div>
                  </div>
                </div>

                {/* midtdel: LENGER NED (mer luft) */}
                <div className="mt-6">
                  <div className="text-xl font-semibold text-neutral-900 truncate" title={name}>
                    {name}
                  </div>
                  <p className="text-sm text-neutral-600 truncate">{email || "—"}</p>
                </div>

                {/* nederst: større mellomrom mellom knappene */}
                <div className="mt-7 flex flex-wrap items-center gap-4">
                  <a
                    href={`/members/${encodeURIComponent(id)}`}
                    className="inline-flex items-center gap-2 rounded-xl border border-neutral-300 bg-white px-3 py-1.5 text-sm font-semibold text-neutral-800 transition hover:border-red-400 hover:text-red-600"
                  >
                    Åpne
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                      <path d="M13 5l7 7-7 7v-4H4v-6h9V5z"/>
                    </svg>
                  </a>
                  <a
                    href={`/members/${encodeURIComponent(id)}/edit`}
                    className="inline-flex items-center rounded-xl bg-red-600 px-3 py-1.5 text-sm font-semibold text-white shadow shadow-red-500/40 transition hover:bg-red-500"
                  >
                    Rediger
                  </a>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
