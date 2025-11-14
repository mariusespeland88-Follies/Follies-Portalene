// lib/enrollmentsClient.ts
"use client";

import { createClientComponentClient } from "@/lib/supabase/browser";

/** Typer som aktivitetssiden forventer */
export type Member = {
  id: string;
  user_id?: string | null;
  first_name?: string | null;
  last_name?: string | null;
  email?: string | null;
  phone?: string | null;
};

type AnyObj = Record<string, any>;

/** localStorage keys */
const LS_MEM_V1 = "follies.members.v1";
const LS_MEM_OLD = "follies.members";
const LS_ENR_V1 = "follies.enrollments.v1";
const LS_ACT_V1 = "follies.activities.v1";
const LS_ACT_OLD = "follies.activities";
const LS_PERMS_V1 = "follies.perms.v1";

/* ------------------------------- Utils ------------------------------- */
const J = <T,>(s: string | null): T | null => { try { return s ? (JSON.parse(s) as T) : null; } catch { return null; } };
const S = (v: any) => String(v ?? "");
const L = (v: any) => S(v).trim().toLowerCase();
const normRole = (v?: string | null) => (L(v) === "leader" || L(v) === "leder") ? "leader" : "participant";

/* --------------------------- LS: Activities -------------------------- */
function lsActivitiesAll(): AnyObj[] {
  const v1 = J<AnyObj[]>(localStorage.getItem(LS_ACT_V1)) ?? [];
  const old = J<AnyObj[]>(localStorage.getItem(LS_ACT_OLD)) ?? [];
  return [...old, ...v1];
}
function aliasActivityIds(currentId: string, currentName?: string | null): Set<string> {
  // Samle alternative IDer for samme aktivitet via navn-match i LS (dekker gamle/lokale ID-er)
  const out = new Set<string>([S(currentId)]);
  if (!currentName) return out;
  const target = L(currentName);
  for (const a of lsActivitiesAll()) {
    const aid = S(a?.id ?? a?.uuid ?? a?._id);
    const aname = S(a?.name ?? a?.title ?? a?.navn ?? a?.programName ?? "");
    if (aid && aname && L(aname) === target) out.add(aid);
  }
  return out;
}

/* --------------------------- LS: Members/Enr ------------------------- */
function lsMembersRaw(): AnyObj[] {
  const v1 = J<AnyObj[]>(localStorage.getItem(LS_MEM_V1)) ?? [];
  const old = J<AnyObj[]>(localStorage.getItem(LS_MEM_OLD)) ?? [];
  const map = new Map<string, AnyObj>();
  for (const m of [...old, ...v1]) if (m?.id) map.set(S(m.id), m);
  return Array.from(map.values());
}
function lsMembersByIds(ids: string[]): Member[] {
  if (!ids.length) return [];
  const want = new Set(ids.map(S));
  const out: Member[] = [];
  for (const m of lsMembersRaw()) {
    if (want.has(S(m.id))) {
      out.push({
        id: S(m.id),
        user_id: m.user_id ?? null,
        first_name: m.first_name ?? null,
        last_name: m.last_name ?? null,
        email: m.email ?? null,
        phone: m.phone ?? null,
      });
    }
  }
  return out;
}
function lsEnrollmentRows(activityId: string): Array<{ member_id: string; role: "leader" | "participant" }> {
  const enr = J<Array<{ member_id: any; activity_id: any; role?: string | null }>>(localStorage.getItem(LS_ENR_V1)) ?? [];
  return enr
    .filter(r => S(r.activity_id) === S(activityId))
    .map(r => ({ member_id: S(r.member_id), role: normRole(r.role) as "leader" | "participant" }));
}

/* ------------------------------ LS: PERMS ---------------------------- */
/** Returner alle "who"-verdier (id/user_id/email/whatnot) som har leder-tilgang for en av alias-ID-ene */
function permsWhoSetForAliases(aliases: Set<string>): Set<string> {
  const raw = J<any>(localStorage.getItem(LS_PERMS_V1)) ?? null;
  const out = new Set<string>();
  if (!raw) return out;

  const isLeaderLevel = (val: any) => {
    const s = L(val);
    return s === "admin" || s === "edit" || s === "leder" || s === "leader";
  };
  const matchAid = (aid: any) => aliases.has(S(aid));

  // A) { perOffer: { [activityId]: { [who]: "admin"|"edit"|{level:..} } } }
  if (raw.perOffer && typeof raw.perOffer === "object") {
    for (const [aid, map] of Object.entries<any>(raw.perOffer)) {
      if (!matchAid(aid) || !map || typeof map !== "object") continue;
      for (const [who, lvl] of Object.entries<any>(map)) {
        const level = (lvl as any)?.level ?? lvl;
        if (isLeaderLevel(level)) out.add(L(who));
      }
    }
  }

  // B) { byUser: { [who]: { [activityId]: "admin"|"edit"|{level:..} } } }
  if (raw.byUser && typeof raw.byUser === "object") {
    for (const [who, amap] of Object.entries<any>(raw.byUser)) {
      if (!amap || typeof amap !== "object") continue;
      for (const [aid, lvl] of Object.entries<any>(amap)) {
        const level = (lvl as any)?.level ?? lvl;
        if (matchAid(aid) && isLeaderLevel(level)) out.add(L(who));
      }
    }
  }

  // C) Flat array / entries
  const arr: any[] = Array.isArray(raw) ? raw : Array.isArray(raw?.entries) ? raw.entries : [];
  for (const r of arr) {
    const aid = S(r?.activityId ?? r?.offerId ?? r?.resourceId ?? r?.id ?? "");
    if (!matchAid(aid)) continue;
    const level = r?.perm ?? r?.role ?? r?.level ?? r?.access ?? r?.type ?? "";
    if (!isLeaderLevel(level)) continue;
    const whoCandidates = [r?.memberId, r?.userId, r?.uid, r?.ownerId, r?.who, r?.email, r?.mail, r?.username];
    for (const w of whoCandidates) if (w) out.add(L(w));
  }

  return out;
}

/* ------------------------------ DB helpers --------------------------- */
async function dbEnrollmentRows(activityId: string): Promise<Array<{ member_id: string; role: "leader" | "participant" }>> {
  const supabase = createClientComponentClient();
  const { data, error } = await supabase.from("enrollments").select("member_id, role").eq("activity_id", activityId);
  if (error || !data) return [];
  return (data as AnyObj[]).map(r => ({ member_id: S(r.member_id), role: normRole(r.role) as "leader" | "participant" }));
}
async function dbMembersByIds(ids: string[]): Promise<Member[]> {
  if (!ids.length) return [];
  const supabase = createClientComponentClient();
  const { data, error } = await supabase
    .from("members")
    .select("id, user_id, first_name, last_name, email, phone")
    .in("id", ids);
  if (error || !data) return [];
  return (data as AnyObj[]).map(m => ({
    id: S(m.id),
    user_id: m.user_id ?? null,
    first_name: m.first_name ?? null,
    last_name: m.last_name ?? null,
    email: m.email ?? null,
    phone: m.phone ?? null,
  }));
}
async function dbActivityName(activityId: string): Promise<string | null> {
  const supabase = createClientComponentClient();
  const { data, error } = await supabase.from("activities").select("name").eq("id", activityId).single();
  if (error || !data) return null;
  return (data as AnyObj).name ?? null;
}

/* ------------------------------ CORE split --------------------------- */
/**
 * Bygger roster slik aktivitetssiden trenger:
 * 1) Hent alle påmeldte (DB → LS fallback)
 * 2) Hent Member-objekter (DB → LS fallback) inkl. user_id/email
 * 3) Finn alias-IDer for aktiviteten (via navn) og hent "who"-sett fra perms
 * 4) Klassifiser leder hvis:
 *    - enrollments.role == 'leader', ELLER
 *    - L(member.id|user_id|email) finnes i permsWho-settet
 *    Deltaker = alle andre
 */
async function buildRoster(activityId: string): Promise<{ leaders: Member[]; participants: Member[] }> {
  // 1) Påmeldte (med role fra DB hvis finnes)
  let enr = await dbEnrollmentRows(activityId);
  if (!enr.length) enr = lsEnrollmentRows(activityId);

  const ids = Array.from(new Set(enr.map(r => r.member_id)));
  if (!ids.length) return { leaders: [], participants: [] };

  // 2) Members (DB → LS)
  let members = await dbMembersByIds(ids);
  if (members.length !== ids.length) {
    // fyll hull fra LS
    const byIdLS = new Map(lsMembersByIds(ids).map(m => [m.id, m]));
    const have = new Set(members.map(m => m.id));
    for (const id of ids) if (!have.has(id)) {
      const hit = byIdLS.get(id);
      if (hit) members.push(hit);
    }
  }
  // Map for rask lookup
  const byId = new Map(members.map(m => [m.id, m]));

  // 3) Perms "who"-sett for alias-IDer
  const name = await dbActivityName(activityId);
  const aliases = aliasActivityIds(activityId, name);
  const permsWho = permsWhoSetForAliases(aliases);

  // 4) Split
  const leaderIds = new Set<string>();
  for (const row of enr) {
    if (row.role === "leader") {
      leaderIds.add(row.member_id);
      continue;
    }
    // sjekk perms (who kan være member.id, user_id eller email)
    const m = byId.get(row.member_id);
    if (!m) continue;
    const candidates = [m.id, m.user_id, m.email].filter(Boolean).map(L);
    if (candidates.some(c => permsWho.has(c))) {
      leaderIds.add(m.id);
    }
  }

  const leaders: Member[] = [];
  const participants: Member[] = [];
  for (const m of members) {
    if (leaderIds.has(m.id)) leaders.push(m);
    else participants.push(m);
  }

  // sikkerhet: fjern evt. dobbeltføring
  const leadSet = new Set(leaders.map(m => m.id));
  const participantsClean = participants.filter(m => !leadSet.has(m.id));

  return { leaders, participants: participantsClean };
}

/* --------------------------- Offentlige helpers ---------------------- */
export async function getParticipants(activityId: string): Promise<Member[]> {
  const { participants } = await buildRoster(activityId);
  return participants;
}
export async function getLeaders(activityId: string): Promise<Member[]> {
  const { leaders } = await buildRoster(activityId);
  return leaders;
}
export async function getRoster(activityId: string): Promise<{ leaders: Member[]; participants: Member[] }> {
  return buildRoster(activityId);
}
