"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { createClientComponentClient } from "@supabase/auth-helpers-nextjs";

/**
 * Dashboard – “Min side” + Beskjed-panel (slide-over)
 * DESIGN URØRT.
 * Henter "Mine aktiviteter" via server-rute (e-post/navn) med fallback på LS-kandidater.
 */

type AnyObj = Record<string, any>;

const MEMBERS_KEY = "follies.members.v1";
const MEMBERS_FALLBACK = "follies.members";
const ACTIVITIES_KEY = "follies.activities.v1";
const CAL_V1 = "follies.calendar.v1";
const CAL_FB = "follies.calendar";
const REMINDERS_KEY = "follies.reminders.v1";
const MESSAGES_KEY = "follies.messages.v1";
const PERMS_KEY = "follies.perms.v1";

/* ---------- utils ---------- */
function parseJSON<T>(raw: string | null, fallback: T): T {
  try { if (!raw) return fallback; const d = JSON.parse(raw); return (d ?? fallback) as T; } catch { return fallback; }
}
function readLS(key: string): string | null { if (typeof window === "undefined") return null; return window.localStorage.getItem(key); }
function writeLS(key: string, value: any) { if (typeof window === "undefined") return; window.localStorage.setItem(key, JSON.stringify(value)); }
function toStr(v: any): string { try { return v == null ? "" : String(v); } catch { return ""; } }
function pick(o: AnyObj, keys: string[], fb: any = ""): any { for (const k of keys) if (o && o[k] !== undefined) return o[k]; return fb; }
function idAliases(o: AnyObj): string[] { return [o?.id, o?.uuid, o?._id, o?.memberId].map(toStr).filter(Boolean); }
function matchesId(o: AnyObj, id: string): boolean { return idAliases(o).some((x) => x === id); }

function fullName(m: AnyObj): string {
  const fn = pick(m, ["first_name","firstName","fornavn"], "");
  const ln = pick(m, ["last_name","lastName","etternavn"], "");
  const full = pick(m, ["full_name","fullName","name","navn"], "");
  return (full ? String(full) : [fn, ln].filter(Boolean).join(" ").trim()) || "Uten navn";
}
function memberEmail(m: AnyObj): string { return pick(m, ["email","epost","mail"], ""); }

function readMembers(): AnyObj[] {
  const p = parseJSON<AnyObj[]>(readLS(MEMBERS_KEY), []);
  return Array.isArray(p) && p.length ? p : parseJSON<AnyObj[]>(readLS(MEMBERS_FALLBACK), []);
}
function readActivities(): AnyObj[] { return parseJSON<AnyObj[]>(readLS(ACTIVITIES_KEY), []); }
function readCalendar(): AnyObj[] { const v1 = parseJSON<AnyObj[]>(readLS(CAL_V1), []); const fb = parseJSON<AnyObj[]>(readLS(CAL_FB), []); return [...v1, ...fb]; }
function readReminders(): AnyObj[] { return parseJSON<AnyObj[]>(readLS(REMINDERS_KEY), []); }
function readMessages(): AnyObj[] { return parseJSON<AnyObj[]>(readLS(MESSAGES_KEY), []); }
function readPerms(): AnyObj { return parseJSON<AnyObj>(readLS(PERMS_KEY), {}); }

function getCurrentIdentity(members: AnyObj[]) {
  const id = toStr(parseJSON<string | null>(readLS("follies.currentMemberId"), null));
  const email =
    toStr(parseJSON<string | null>(readLS("follies.currentEmail"), null)) ||
    toStr(parseJSON<string | null>(readLS("follies.session.email"), null)) ||
    toStr(readLS("follies.session.email") ?? "");
  let member: AnyObj | null = null;
  if (id) member = members.find((m) => matchesId(m, id)) ?? null;
  if (!member && email) {
    const lower = email.toLowerCase();
    member = members.find((m) => memberEmail(m)?.toLowerCase() === lower) ?? null;
  }
  return { id, email, member };
}

/* ---------- activities helpers for dashboard ---------- */
function activityTitle(a: AnyObj): string { return pick(a, ["title","tittel","name","navn"], "Uten tittel") || "Uten tittel"; }
function activityTypeLabel(a: AnyObj): string {
  const t = String(pick(a, ["type","kategori"], "offer")).toLowerCase();
  if (t === "event") return "Event";
  if (t === "show" || t.includes("forest")) return "Forestilling";
  return "Tilbud";
}
function activityId(a: AnyObj): string { return toStr(a?.id ?? a?.uuid ?? a?._id); }
function isUserInActivity(a: AnyObj, me: { id?: string; email?: string }) {
  const raw = pick(a, ["participants","deltakere","members","enrollments","registrations","påmeldte","paameldte"], []);
  const email = (me.email || "").trim().toLowerCase();
  const myId = (me.id || "").trim();
  if (!Array.isArray(raw)) return false;
  for (const item of raw) {
    if (typeof item === "string" || typeof item === "number") { if (myId && toStr(item) === myId) return true; }
    else if (item && typeof item === "object") {
      const mid = toStr(item?.memberId ?? item?.id ?? item?.uuid ?? item?._id);
      const mem = toStr(item?.email ?? item?.epost ?? item?.mail).trim().toLowerCase();
      if (myId && mid && mid === myId) return true;
      if (email && mem && mem === email) return true;
    }
  }
  return false;
}

/* ---------- leder-tilganger fra perms (LS) ---------- */
function leaderActivityIdsFromPerms(perms: AnyObj, myId: string): Set<string> {
  const out = new Set<string>();
  if (!perms) return out;
  const isLeaderLevel = (val: any) => {
    const s = String(val ?? "").toLowerCase();
    return s === "admin" || s === "edit" || s === "leder" || s === "leader";
  };
  if (perms.perOffer && typeof perms.perOffer === "object") {
    for (const [aid, map] of Object.entries<any>(perms.perOffer)) {
      if (map && typeof map === "object") {
        const lvl = map[myId]?.level ?? map[myId];
        if (isLeaderLevel(lvl)) out.add(String(aid));
      }
    }
  }
  if (perms.byUser && typeof perms.byUser === "object") {
    const amap = perms.byUser[myId];
    if (amap && typeof amap === "object") {
      for (const [aid, lvl] of Object.entries<any>(amap)) {
        const level = (lvl as any)?.level ?? lvl;
        if (isLeaderLevel(level)) out.add(aid);
      }
    }
  }
  const arr: any[] = Array.isArray(perms?.entries) ? perms.entries : Array.isArray(perms) ? perms : [];
  for (const r of arr) {
    const uid = toStr(r?.memberId ?? r?.userId ?? r?.uid ?? r?.ownerId ?? r?.who ?? "");
    const aid = toStr(r?.activityId ?? r?.offerId ?? r?.resourceId ?? r?.id ?? "");
    const lvl = r?.perm ?? r?.role ?? r?.level ?? r?.access ?? r?.type ?? "";
    if (uid && aid && uid === myId && isLeaderLevel(lvl)) out.add(aid);
  }
  return out;
}

/* ========================================================================== */

export default function DashboardPage() {
  const router = useRouter();
  const supabase = React.useMemo(() => createClientComponentClient(), []);

  const [members, setMembers] = React.useState<AnyObj[]>([]);
  const [activities, setActivities] = React.useState<AnyObj[]>([]);
  const [calendar, setCalendar] = React.useState<AnyObj[]>([]);
  const [reminders, setReminders] = React.useState<AnyObj[]>([]);
  const [messages, setMessages] = React.useState<AnyObj[]>([]);
  const [me, setMe] = React.useState<{ id?: string; email?: string; member?: AnyObj | null }>({});
  const [msgOpen, setMsgOpen] = React.useState(false);

  const [myDbActivities, setMyDbActivities] = React.useState<AnyObj[]>([]);

  // LS-init (beholder eksisterende design/flow)
  React.useEffect(() => {
    const ms = readMembers();
    const acts = readActivities();
    const cal = readCalendar();
    const rem = readReminders();
    const msgs = readMessages();
    const ident = getCurrentIdentity(ms);
    setMembers(ms);
    setActivities(acts);
    setCalendar(cal);
    setReminders(rem);
    setMessages(msgs);
    setMe({ id: ident.id, email: ident.email, member: ident.member });
  }, []);

  // Kandidater fra LS (participants + leder-perms)
  const candidateActivityIds = React.useMemo(() => {
    const acts = readActivities();
    const perms = readPerms();
    const myId = (me.id || "").trim();

    const inRosterIds = new Set(
      acts.filter((a) => isUserInActivity(a, { id: me.id, email: me.email })).map((a) => activityId(a))
    );
    const leaderIds = myId ? leaderActivityIdsFromPerms(perms, myId) : new Set<string>();

    return Array.from(new Set<string>([...inRosterIds, ...leaderIds]));
  }, [me.id, me.email]);

  // Hent mine aktiviteter via server (e-post + navn + kandidater)
  React.useEffect(() => {
    let alive = true;
    (async () => {
      const email = (me.email || "").trim();
      if (!email) return;
      const displayName =
        (me.member && (fullName(me.member) || `${me.member.first_name || ""} ${me.member.last_name || ""}`.trim())) ||
        "";

      const qs = new URLSearchParams();
      qs.set("email", email);
      qs.set("displayName", displayName);
      if (candidateActivityIds.length) qs.set("candidates", candidateActivityIds.join(","));

      try {
        const res = await fetch(`/api/dashboard/my-activities?${qs.toString()}`);
        if (res.ok) {
          const j = await res.json();
          if (alive && Array.isArray(j?.activities)) {
            setMyDbActivities(j.activities);
          }
        }
      } catch {}
    })();
    return () => { alive = false; };
  }, [me.email, me.member, candidateActivityIds.join(",")]);

  // Mine aktiviteter: bruk DB-liste hvis vi har den, ellers LS-fallback
  const myActivities = React.useMemo(() => {
    if (myDbActivities.length > 0) return myDbActivities;
    if (!me.id && !me.email) return [];
    const acts = readActivities();
    const setIds = new Set(candidateActivityIds);
    const list = acts.filter((a) => setIds.has(activityId(a)));
    list.sort((x, y) => {
      const ax = (x as any).archived ? 1 : 0;
      const ay = (y as any).archived ? 1 : 0;
      if (ax !== ay) return ax - ay;
      const dx = (x as any).start_date ? new Date((x as any).start_date).getTime() : Number.MAX_SAFE_INTEGER;
      const dy = (y as any).start_date ? new Date((y as any).start_date).getTime() : Number.MAX_SAFE_INTEGER;
      if (dx !== dy) return dx - dy;
      return activityTitle(x).localeCompare(activityTitle(y), "nb");
    });
    return list;
  }, [myDbActivities, me.id, me.email, candidateActivityIds]);

  // Kalender 30 dager (PERSONLIG: filtrerer på member_id === me.id)
  const upcoming = React.useMemo(() => {
    const now = new Date();
    const cutoff = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);
    const items = readCalendar()
      .map((e) => ({ ...e, _start: new Date((e as any).start || (e as any).start_at || (e as any).dato || Date.now()) }))
      .filter((e) => String((e as any).member_id || "") === String(me.id || "")) // ← personlig filter
      .filter((e) => (e as any)._start >= now && (e as any)._start <= cutoff)
      .sort((a, b) => ((a as any)._start as Date).getTime() - ((b as any)._start as Date).getTime());
    return items;
  }, [me.id, calendar]); // avhenger av me.id + calendar

  const myMessages = React.useMemo(() => {
    const base = messages;
    if (!Array.isArray(base) || (!me.id && !me.email)) return [];
    const mine = base.filter((m) => {
      const tid = toStr((m as any).to_member_id ?? (m as any).memberId ?? (m as any).toId ?? "");
      const temail = toStr((m as any).to_email ?? (m as any).email ?? "").trim().toLowerCase();
      const broadcast = !!((m as any).to_all || (m as any).broadcast);
      const myId = (me.id || "").trim();
      const myEmail = (me.email || "").trim().toLowerCase();
      if (broadcast) return true;
      if (myId && tid && tid === myId) return true;
      if (myEmail && temail && temail === myEmail) return true;
      return false;
    }).sort((a, b) => {
      const ar = (a as any).read_at ? 1 : 0;
      const br = (b as any).read_at ? 1 : 0;
      if (ar !== br) return ar - br;
      const at = new Date((a as any).created_at || (a as any).date || (a as any).sent_at || 0).getTime();
      const bt = new Date((b as any).created_at || (b as any).date || (b as any).sent_at || 0).getTime();
      return bt - at;
    });
    return mine;
  }, [messages, me.id, me.email]);

  const unreadCount = myMessages.reduce((n, m) => n + ((m as any).read_at ? 0 : 1), 0);

  const name = me.member ? fullName(me.member) : "Velkommen";
  const email = me.member ? memberEmail(me.member) : me.email || "—";
  const mid = me.member ? toStr((me.member as any).id ?? (me.member as any).uuid ?? (me.member as any)._id ?? (me.member as any).memberId) : "";

  function markMessageRead(id: string) {
    const all = Array.isArray(messages) ? messages.slice() : [];
    const idx = all.findIndex((m) => String((m as any).id) === String(id));
    if (idx >= 0) {
      (all[idx] as any) = { ...(all[idx] as any), read_at: new Date().toISOString() };
      setMessages(all);
      writeLS(MESSAGES_KEY, all);
    }
  }
  function markAllRead() {
    const all = (Array.isArray(messages) ? messages.slice() : []).map((m) =>
      ({ ...(m as any), read_at: (m as any).read_at || new Date().toISOString() })
    );
    setMessages(all); writeLS(MESSAGES_KEY, all);
  }

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6">
      {/* HERO  (BEHOLDT NØYAKTIG SOM FØR) */}
      <div className="rounded-2xl border bg-gradient-to-r from-black to-red-800 text-white">
        <div className="px-6 py-6 md:py-8">
          <div className="flex items-center justify-between gap-3">
            <div>
              <div className="text-sm text-white">Dashboard</div>
              <h1 className="text-2xl md:text-3xl font-semibold mt-1 text-white">{name}</h1>
              <div className="text-white">{email}</div>
            </div>
            <div className="flex items-center gap-2">
              {/* Knapp som åpner beskjeder */}
              <button
                onClick={() => setMsgOpen(true)}
                className="relative inline-flex items-center justify-center rounded-lg bg-white/95 text-black px-3.5 py-2 text-sm font-semibold shadow-sm hover:bg-white focus:outline-none focus:ring-2 focus:ring-red-600"
                aria-label="Åpne beskjeder"
              >
                <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                  <path d="M12 2a6 6 0 00-6 6v2.586l-.707 2.121A1 1 0 006.243 14h11.514a1 1 0 00.95-1.293L18 10.586V8a6 6 0 00-6-6zm0 20a3 3 0 002.995-2.824L15 19h-6a3 3 0 003 3z" />
                </svg>
                <span className="ml-2">Beskjeder</span>
                {unreadCount > 0 && (
                  <span className="absolute -top-2 -right-2 inline-flex items-center justify-center rounded-full bg-red-600 px-2 py-0.5 text-xs font-bold text-white">
                    {unreadCount}
                  </span>
                )}
              </button>

              {mid ? (
                <button
                  onClick={() => router.push(`/members/${encodeURIComponent(mid)}`)}
                  className="inline-flex items-center justify-center rounded-lg bg-white text-black px-3.5 py-2 text-sm font-semibold shadow-sm hover:bg-neutral-100 focus:outline-none focus:ring-2 focus:ring-red-600"
                >
                  Åpne min profil
                </button>
              ) : null}
            </div>
          </div>
        </div>
      </div>

      {/* GRID (BEHOLDT SOM FØR) */}
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
        {/* Mine aktiviteter */}
        <section className="rounded-xl border p-4 bg-white">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold text-black">Mine aktiviteter</h2>
            <button onClick={() => router.push("/activities")} className="text-sm underline text-gray-700 hover:text-red-600">Se alle</button>
          </div>
          {myActivities.length === 0 ? (
            <div className="mt-3 text-gray-700">Ingen aktiviteter funnet.</div>
          ) : (
            <ul className="mt-3 divide-y">
              {myActivities.slice(0, 6).map((a) => {
                const id = activityId(a);
                return (
                  <li key={id} className="py-3 flex items-center justify-between gap-3">
                    <div className="min-w-0">
                      <div className="text-sm text-gray-700">{activityTypeLabel(a)}</div>
                      <div className="font-medium text-black truncate">{activityTitle(a)}</div>
                    </div>
                    <button
                      onClick={() => router.push(`/activities/${encodeURIComponent(id)}`)}
                      className="inline-flex items-center justify-center rounded-lg bg-white px-3.5 py-2 text-sm font-semibold text-neutral-900 ring-1 ring-neutral-300 hover:bg-neutral-100 focus:outline-none focus:ring-2 focus:ring-red-600"
                    >
                      Åpne
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </section>

        {/* Kalender */}
        <section className="rounded-xl border p-4 bg-white">
          <h2 className="text-lg font-semibold text-black">Kalender (30 dager)</h2>
          {upcoming.length === 0 ? (
            <div className="mt-3 text-gray-700">Ingen kommende elementer.</div>
          ) : (
            <ul className="mt-3 divide-y">
              {upcoming.slice(0, 8).map((e) => (
                <li key={(e as any).id} className="py-3">
                  <div className="text-sm text-gray-700">{new Date((e as any)._start).toLocaleString("nb-NO")}</div>
                  <div className="font-medium text-black">{(e as any).title || (e as any).name || "Kalenderpunkt"}</div>
                  {(e as any).activity_id ? (
                    <div className="mt-2">
                      <button
                        onClick={() => router.push(`/activities/${encodeURIComponent(toStr((e as any).activity_id))}`)}
                        className="inline-flex items-center justify-center rounded-lg bg-black px-3.5 py-2 text-sm font-semibold text-white hover:bg-neutral-800 focus:outline-none focus:ring-2 focus:ring-red-600"
                      >
                        Gå til aktivitet
                      </button>
                    </div>
                  ) : null}
                </li>
              ))}
            </ul>
          )}
        </section>

        {/* Påminnelser */}
        <section className="rounded-xl border p-4 bg-white">
          <div className="flex items_center justify_between">
            <h2 className="text-lg font-semibold text-black">Påminnelser</h2>
            <button onClick={() => alert("Placeholder – leser 'follies.reminders.v1' hvis den finnes.")} className="text-sm underline text-gray-700 hover:text-red-600">Info</button>
          </div>
          {reminders.length === 0 ? (
            <div className="mt-3 text-gray-700">Ingen påminnelser.</div>
          ) : (
            <ul className="mt-3 divide-y">
              {reminders.slice(0, 8).map((r) => (
                <li key={(r as any).id || (r as any).title} className="py-3">
                  <div className="font-medium text-black">{(r as any).title || "Påminnelse"}</div>
                  {(r as any).when ? <div className="text-sm text-gray-700">{new Date((r as any).when).toLocaleString("nb-NO")}</div> : null}
                  {(r as any).note ? <div className="text-sm text-gray-700">{(r as any).note}</div> : null}
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>

      {/* Hurtighandlinger */}
      <section className="rounded-xl border p-4 bg-white">
        <h2 className="text-lg font-semibold text-black">Hurtighandlinger</h2>
        <div className="mt-3 flex flex-wrap gap-3">
          <button
            onClick={() => router.push("/activities")}
            className="inline-flex items-center justify-center rounded-lg bg-red-600 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-red-700 focus:outline-none focus:ring-2 focus:ring-red-600"
          >
            Gå til aktiviteter
          </button>
          {mid ? (
            <button
              onClick={() => router.push(`/members/${encodeURIComponent(mid)}`)}
              className="inline-flex items-center justify-center rounded-lg bg-white px-4 py-2 text-sm font-semibold text-neutral-900 ring-1 ring-neutral-300 hover:bg-neutral-100 focus:outline-none focus:ring-2 focus:ring-red-600"
            >
              Åpne min profil
            </button>
          ) : null}
        </div>
      </section>

      {/* ---------- Slide-over: Mine beskjeder ---------- */}
      {msgOpen && (
        <div className="fixed inset-0 z-50">
          <div className="absolute inset-0 bg-black/40" onClick={() => setMsgOpen(false)} />
          <div className="absolute right-0 top-0 h-full w-full sm:w-[420px] bg-white shadow-2xl ring-1 ring-black/10 flex flex-col">
            <div className="p-4 border-b flex items-center justify-between">
              <div>
                <h2 className="text-lg font-semibold text-black">Mine beskjeder</h2>
                {unreadCount > 0 ? (
                  <div className="text-xs text-red-700 font-semibold mt-0.5">{unreadCount} ulest{unreadCount > 1 ? "e" : ""}</div>
                ) : <div className="text-xs text-gray-600 mt-0.5">Alle lest</div>}
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={markAllRead}
                  className="inline-flex items-center justify-center rounded-md bg-black px-3 py-1.5 text-xs font-semibold text-white hover:bg-neutral-800 focus:outline-none focus:ring-2 focus:ring-red-600"
                >
                  Marker alle som lest
                </button>
                <button
                  onClick={() => setMsgOpen(false)}
                  className="inline-flex items-center justify-center rounded-md bg-white px-3 py-1.5 text-xs font-semibold text-neutral-900 ring-1 ring-neutral-300 hover:bg-neutral-100"
                  aria-label="Lukk"
                >
                  Lukk
                </button>
              </div>
            </div>

            <div className="flex-1 overflow-y-auto">
              {myMessages.length === 0 ? (
                <div className="p-4 text-gray-700">Ingen beskjeder.</div>
              ) : (
                <ul className="divide-y">
                  {myMessages.map((m) => {
                    const when = new Date((m as any).created_at || (m as any).sent_at || (m as any).date || Date.now());
                    const unread = !(m as any).read_at;
                    const activity = (m as any).activity_id || (m as any).activityId;
                    return (
                      <li key={(m as any).id} className="p-4">
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0">
                            <div className="text-xs text-gray-600">{when.toLocaleString("nb-NO")}</div>
                            <div className={`mt-0.5 font-medium ${unread ? "text-black" : "text-gray-800"}`}>
                              {(m as any).title || (m as any).subject || "Beskjed"}
                            </div>
                            {((m as any).body || (m as any).message) && (
                              <div className="mt-1 text-sm text-gray-700 whitespace-pre-line max-h-28 overflow-y-auto">
                                {(m as any).body || (m as any).message}
                              </div>
                            )}
                          </div>
                          {unread ? (
                            <button
                              onClick={() => markMessageRead(String((m as any).id))}
                              className="shrink-0 inline-flex items-center justify-center rounded-md bg-white px-3 py-1.5 text-xs font-semibold text-neutral-900 ring-1 ring-neutral-300 hover:bg-neutral-100"
                            >
                              Marker som lest
                            </button>
                          ) : null}
                        </div>

                        {activity ? (
                          <div className="mt-3">
                            <button
                              onClick={() => {
                                setMsgOpen(false);
                                router.push(`/activities/${encodeURIComponent(toStr(activity))}`);
                              }}
                              className="inline-flex items-center justify-center rounded-md bg-black px-3.5 py-2 text-sm font-semibold text-white hover:bg-neutral-800 focus:outline-none focus:ring-2 focus:ring-red-600"
                            >
                              Gå til aktivitet
                            </button>
                          </div>
                        ) : null}
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
