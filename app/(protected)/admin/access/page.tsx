"use client";

import * as React from "react";
import { useRouter } from "next/navigation";

/**
 * Admin / Tilganger
 * - Opprett ny leder (skjema) -> skriver til follies.members.v1 og legger "leader" i follies.perms.v1
 * - "Gjør meg til leder" (bruker innlogget identitet fra LS og lager min.meldem hvis mangler)
 * - Vis liste over alle ledere (med Åpne / Rediger / Fjern leder)
 *
 * NB: Ingen Supabase enda – alt er i localStorage.
 */

type AnyObj = Record<string, any>;

const MEM_V1 = "follies.members.v1";
const MEM_FB = "follies.members";
const PERMS = "follies.perms.v1";

/* ---------------- utils ---------------- */
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
function fullName(m: AnyObj): string {
  const fn = pick(m, ["first_name","firstName","fornavn"], "");
  const ln = pick(m, ["last_name","lastName","etternavn"], "");
  const full = pick(m, ["full_name","fullName","name","navn"], "");
  return (full ? String(full) : [fn, ln].filter(Boolean).join(" ").trim()) || "Uten navn";
}
function emailOf(m: AnyObj): string {
  return pick(m, ["email","epost","mail"], "");
}
function memberId(m: AnyObj): string {
  return toStr(m.id ?? m.uuid ?? m._id ?? m.memberId);
}

/* --------------- data readers/writers --------------- */
function readMembers(): AnyObj[] {
  const v1 = parseJSON<AnyObj[]>(readLS(MEM_V1), []);
  const fb = parseJSON<AnyObj[]>(readLS(MEM_FB), []);
  const all = [...fb, ...v1];
  const map = new Map<string, AnyObj>();
  for (const m of all) {
    const key = memberId(m);
    if (!key) continue;
    // v1 skal "vinne" over fb – men vi har fb først i all, så overskriv ved like id
    map.set(key, m);
  }
  return Array.from(map.values());
}
function writeMembers(list: AnyObj[]) {
  // Vi skriver kun til v1 nå (ikke til fallback)
  writeLS(MEM_V1, Array.isArray(list) ? list : []);
}

type Perms = Record<string, { roles?: string[] }>;
function readPerms(): Perms {
  const p = parseJSON<Perms>(readLS(PERMS), {});
  return p && typeof p === "object" ? p : {};
}
function writePerms(p: Perms) { writeLS(PERMS, p || {}); }

function ensureMemberRoleSet(perms: Perms, memberId: string): string[] {
  const current = perms[memberId]?.roles ?? [];
  const set = new Set(current.map(toStr));
  if (![...set].some((r) => r.toLowerCase() === "member")) set.add("member");
  return [...set];
}
function setLeader(perms: Perms, memberId: string, on: boolean): Perms {
  const roles = ensureMemberRoleSet(perms, memberId);
  const lower = roles.map((r) => r.toLowerCase());
  const idx = lower.indexOf("leader");
  if (on && idx === -1) roles.push("leader");
  if (!on && idx !== -1) roles.splice(idx, 1);
  return { ...perms, [memberId]: { roles } };
}

/* --------------- session helpers --------------- */
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
    member = members.find((m) => emailOf(m)?.toLowerCase() === lower) ?? null;
  }
  return { id, email, member };
}

function isLeader(perms: Perms, member: AnyObj): boolean {
  const id = memberId(member);
  if (!id) return false;
  const roles = (perms[id]?.roles ?? []).map((x) => String(x).toLowerCase());
  return roles.includes("leader") || roles.includes("leder") || roles.includes("staff");
}

/* ========================================================= */

export default function AdminAccessPage() {
  const router = useRouter();

  // data
  const [members, setMembers] = React.useState<AnyObj[]>([]);
  const [perms, setPerms] = React.useState<Perms>({});
  const [me, setMe] = React.useState<{ id?: string; email?: string; member?: AnyObj | null }>({});

  // form
  const [firstName, setFirstName] = React.useState("");
  const [lastName, setLastName] = React.useState("");
  const [email, setEmail] = React.useState("");
  const [phone, setPhone] = React.useState("");
  const [avatarUrl, setAvatarUrl] = React.useState("");

  // status
  const [ok, setOk] = React.useState<string | null>(null);
  const [err, setErr] = React.useState<string | null>(null);

  React.useEffect(() => {
    const ms = readMembers();
    const p = readPerms();
    const ident = getCurrentIdentity(ms);
    setMembers(ms);
    setPerms(p);
    setMe({ id: ident.id, email: ident.email, member: ident.member });
  }, []);

  const leaders = React.useMemo(() => {
    return members.filter((m) => isLeader(perms, m)).sort((a, b) => fullName(a).localeCompare(fullName(b), "nb"));
  }, [members, perms]);

  function resetForm() {
    setFirstName(""); setLastName(""); setEmail(""); setPhone(""); setAvatarUrl("");
  }

  function validateEmail(v: string) {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v);
  }

  function upsertLeaderFromForm(e: React.FormEvent) {
    e.preventDefault();
    setOk(null); setErr(null);

    const em = email.trim();
    if (!validateEmail(em)) { setErr("Ugyldig e-post."); return; }

    const ms = readMembers();
    const p = readPerms();

    // Finn eksisterende medlem på e-post (case-insensitiv)
    const idx = ms.findIndex((m) => emailOf(m)?.toLowerCase() === em.toLowerCase());
    let created = false;
    let id: string;

    if (idx >= 0) {
      // Oppdater evt. navn/telefon/avatar hvis tomt
      const existing = { ...ms[idx] };
      if (firstName && !existing.first_name && !existing.fornavn) existing.first_name = firstName;
      if (lastName && !existing.last_name && !existing.etternavn) existing.last_name = lastName;
      if (phone && !existing.phone) existing.phone = phone;
      if (avatarUrl && !existing.avatar_url) existing.avatar_url = avatarUrl;
      ms[idx] = existing;
      id = memberId(existing);
    } else {
      // Opprett nytt medlem
      id = (globalThis.crypto?.randomUUID?.() ?? `m-${Date.now()}`) as string;
      const newMember: AnyObj = {
        id,
        first_name: firstName || "",
        last_name: lastName || "",
        email: em,
        phone: phone || "",
        avatar_url: avatarUrl || "",
        created_at: new Date().toISOString(),
      };
      ms.unshift(newMember);
      created = true;
    }

    // Skriv medlem og rolle
    writeMembers(ms);
    const nextPerms = setLeader(p, id, true);
    writePerms(nextPerms);

    // Oppdater state
    setMembers(ms);
    setPerms(nextPerms);

    setOk(created ? "Leder opprettet." : "Leder oppdatert.");
    resetForm();
    // Tilby å åpne profilen
    setTimeout(() => setOk(null), 2000);
  }

  function makeMeLeader() {
    setOk(null); setErr(null);
    const ms = readMembers();
    const p = readPerms();
    let my = getCurrentIdentity(ms).member;

    if (!me.email) {
      setErr("Fant ikke e-post for deg i sesjonen.");
      return;
    }

    if (!my) {
      // Opprett et minimalt medlem basert på e-post
      const id = (globalThis.crypto?.randomUUID?.() ?? `m-${Date.now()}`) as string;
      const nameGuess = String(me.email).split("@")[0]?.replace(/[._-]/g, " ") || "Ukjent";
      my = {
        id,
        full_name: nameGuess,
        email: me.email,
        created_at: new Date().toISOString(),
      };
      ms.unshift(my);
      writeMembers(ms);
    }

    const id = memberId(my);
    const nextPerms = setLeader(p, id, true);
    writePerms(nextPerms);

    setMembers(ms);
    setPerms(nextPerms);
    setMe({ ...me, member: my });

    setOk("Du er nå satt som leder.");
    setTimeout(() => setOk(null), 1800);
  }

  function removeLeader(m: AnyObj) {
    const id = memberId(m);
    const nextPerms = setLeader(perms, id, false);
    setPerms(nextPerms);
    writePerms(nextPerms);
    setOk("Leder fjernet.");
    setTimeout(() => setOk(null), 1400);
  }

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6">
      {/* HERO / heading */}
      <div className="rounded-2xl ring-1 ring-black/10 bg-gradient-to-r from-red-800 to-red-600 text-white">
        <div className="px-6 py-6 flex flex-wrap items-center justify-between gap-3">
          <div>
            <div className="text-sm text-white/90">Admin</div>
            <h1 className="text-2xl font-semibold">Tilganger</h1>
            <p className="text-sm text-white/90">Opprett ledere og administrer roller.</p>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={makeMeLeader}
              className="inline-flex items-center gap-2 rounded-md bg-white px-3 py-2 text-sm font-semibold text-red-700 ring-1 ring-red-200 hover:bg-red-50"
            >
              {/* krone */}
              <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M3 7l4 3 5-6 5 6 4-3v10H3V7zm4 10h10v-2H7v2z"/></svg>
              Gjør meg til leder
            </button>
          </div>
        </div>
      </div>

      {(ok || err) && (
        <div className="flex flex-col gap-2">
          {ok && <div className="rounded-lg bg-green-50 px-4 py-2 text-sm text-green-800 ring-1 ring-green-200">{ok}</div>}
          {err && <div className="rounded-lg bg-red-50 px-4 py-2 text-sm text-red-800 ring-1 ring-red-200">{err}</div>}
        </div>
      )}

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
        {/* Skjema (to kolonner for felt) */}
        <section className="xl:col-span-2 rounded-xl border bg-white p-5 shadow-sm ring-1 ring-black/5">
          <h2 className="text-lg font-semibold text-black">Opprett ny leder</h2>
          <p className="mt-1 text-sm text-neutral-700">
            Fyll inn personens detaljer. Bruker legges inn som medlem og får leder-rolle. (Innlogging kobles senere når Supabase er på plass.)
          </p>

          <form onSubmit={upsertLeaderFromForm} className="mt-4 grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-neutral-800">Fornavn</label>
              <input
                value={firstName}
                onChange={(e) => setFirstName(e.target.value)}
                className="mt-1 w-full rounded-md border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-red-600"
                placeholder="Fornavn"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-neutral-800">Etternavn</label>
              <input
                value={lastName}
                onChange={(e) => setLastName(e.target.value)}
                className="mt-1 w-full rounded-md border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-red-600"
                placeholder="Etternavn"
              />
            </div>
            <div className="sm:col-span-2">
              <label className="block text-sm font-medium text-neutral-800">E-post (påkrevd)</label>
              <input
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                type="email"
                className="mt-1 w-full rounded-md border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-red-600"
                placeholder="navn@domene.no"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-neutral-800">Telefon</label>
              <input
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                className="mt-1 w-full rounded-md border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-red-600"
                placeholder="+47 …"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-neutral-800">Avatar URL</label>
              <input
                value={avatarUrl}
                onChange={(e) => setAvatarUrl(e.target.value)}
                className="mt-1 w-full rounded-md border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-red-600"
                placeholder="https://…"
              />
            </div>

            <div className="sm:col-span-2 mt-2 flex items-center gap-2">
              <button
                type="submit"
                className="rounded-md bg-red-600 px-4 py-2 text-sm font-semibold text-white hover:bg-red-700 focus:outline-none focus:ring-2 focus:ring-red-600"
              >
                Lagre som leder
              </button>
              <button
                type="button"
                onClick={resetForm}
                className="rounded-md bg-white px-4 py-2 text-sm font-semibold text-neutral-900 ring-1 ring-neutral-300 hover:bg-neutral-100 focus:outline-none focus:ring-2 focus:ring-red-600"
              >
                Nullstill skjema
              </button>
            </div>
          </form>
        </section>

        {/* Lederliste */}
        <section className="rounded-xl border bg-white p-5 shadow-sm ring-1 ring-black/5">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold text-black">Ledere</h2>
            <span className="inline-flex items-center rounded-full bg-black/85 px-2.5 py-0.5 text-xs font-semibold text-white">
              {leaders.length}
            </span>
          </div>

          {leaders.length === 0 ? (
            <div className="mt-3 text-neutral-700">Ingen ledere enda.</div>
          ) : (
            <ul className="mt-4 divide-y divide-neutral-200">
              {leaders.map((m) => (
                <li key={memberId(m)} className="py-3 flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="font-medium text-black">{fullName(m)}</div>
                    <div className="text-sm text-neutral-700 truncate">{emailOf(m) || <span className="text-neutral-500">Ingen e-post</span>}</div>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <button
                      onClick={() => router.push(`/members/${encodeURIComponent(memberId(m))}`)}
                      className="rounded-md bg-white px-3 py-1.5 text-sm font-semibold text-neutral-900 ring-1 ring-neutral-300 hover:bg-neutral-100"
                    >
                      Åpne
                    </button>
                    <button
                      onClick={() => router.push(`/members/${encodeURIComponent(memberId(m))}/edit`)}
                      className="rounded-md bg-black px-3 py-1.5 text-sm font-semibold text-white hover:bg-neutral-800"
                    >
                      Rediger
                    </button>
                    <button
                      onClick={() => removeLeader(m)}
                      className="rounded-md bg-white px-3 py-1.5 text-sm font-semibold text-neutral-900 ring-1 ring-neutral-300 hover:bg-neutral-100"
                    >
                      Fjern leder
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </div>
  );
}
