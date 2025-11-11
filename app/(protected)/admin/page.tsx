"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import getSupabaseBrowserClient from "@/lib/supabase/client";

/**
 * Admin (landing)
 * – Beholder alle eksisterende funksjoner (makeMeDB, create-leader-skjema, lister).
 * – Ny “admin-hub” øverst med pene handlingsknapper (ingen nye avhengigheter).
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
function idOf(m: AnyObj): string {
  return toStr(m?.id ?? m?.uuid ?? m?._id ?? m?.memberId);
}
function emailOf(m: AnyObj): string {
  return pick(m, ["email","epost","mail"], "");
}
function fullName(m: AnyObj): string {
  const fn = pick(m, ["first_name","firstName","fornavn"], "");
  const ln = pick(m, ["last_name","lastName","etternavn"], "");
  const full = pick(m, ["full_name","fullName","name","navn"], "");
  return (full ? String(full) : [fn, ln].filter(Boolean).join(" ").trim()) || "Uten navn";
}

/* --------------- data readers/writers (LS) --------------- */
function readMembersLS(): AnyObj[] {
  const v1 = parseJSON<AnyObj[]>(readLS(MEM_V1), []);
  const fb = parseJSON<AnyObj[]>(readLS(MEM_FB), []);
  const map = new Map<string, AnyObj>();
  for (const m of [...fb, ...v1]) {
    const key = idOf(m);
    if (key) map.set(key, m);
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
function hasRole(perms: Perms, memberId: string, role: "leader" | "admin" | "member"): boolean {
  const roles = (perms[memberId]?.roles ?? []).map((r) => String(r).toLowerCase());
  return roles.includes(role);
}

/* ========================================================= */

export default function AdminPage() {
  const router = useRouter();
  const supabase = React.useMemo(() => getSupabaseBrowserClient(), []);

  // LS-data (sikkerhetsnett)
  const [membersLS, setMembersLS] = React.useState<AnyObj[]>([]);
  const [permsLS, setPermsLS] = React.useState<Perms>({});

  // DB-data
  const [membersDB, setMembersDB] = React.useState<AnyObj[]>([]);
  const [permsDB, setPermsDB] = React.useState<Perms>({});

  // “meg”
  const [meEmail, setMeEmail] = React.useState<string | null>(null);

  // form/status
  const [firstName, setFirstName] = React.useState("");
  const [lastName, setLastName] = React.useState("");
  const [email, setEmail] = React.useState("");
  const [phone, setPhone] = React.useState("");
  const [avatarUrl, setAvatarUrl] = React.useState("");
  const [asAdmin, setAsAdmin] = React.useState(false);

  const [ok, setOk] = React.useState<string | null>(null);
  const [err, setErr] = React.useState<string | null>(null);
  const [busy, setBusy] = React.useState(false);

  // Init fra LS + session-email
  React.useEffect(() => {
    setMembersLS(readMembersLS());
    setPermsLS(readPermsLS());
    supabase.auth.getSession().then(({ data }) => {
      setMeEmail(data.session?.user?.email ?? null);
    });
  }, [supabase]);

  // Hent fra Supabase (og speil til LS)
  async function loadFromSupabase() {
    try {
      const sess = await supabase.auth.getSession();
      if (!sess.data.session) {
        setMembersDB([]); setPermsDB({});
        return;
      }
      const { data, error } = await supabase
        .from("members")
        .select("id, first_name, last_name, email, phone, avatar_url, created_at, member_roles ( role )");

      if (error) { setMembersDB([]); setPermsDB({}); return; }

      const list = (data ?? []) as any[];
      const normalized: AnyObj[] = list.map((m) => ({
        id: m.id,
        first_name: m.first_name ?? "",
        last_name: m.last_name ?? "",
        email: m.email ?? "",
        phone: m.phone ?? "",
        avatar_url: m.avatar_url ?? "",
        created_at: m.created_at ?? null,
      }));

      const rolesMap: Perms = {};
      for (const m of list) {
        const id = String(m.id);
        const roles = Array.isArray(m.member_roles) ? m.member_roles.map((r: any) => String(r.role)) : [];
        rolesMap[id] = { roles };
      }

      setMembersDB(normalized);
      setPermsDB(rolesMap);

      // SPEIL til LS
      const currentLS = readMembersLS();
      const lsMap = new Map(currentLS.map((m) => [idOf(m), m]));
      for (const m of normalized) {
        const id = idOf(m);
        const prev = lsMap.get(id) || {};
        lsMap.set(id, { ...prev, ...m });
      }
      const mergedLS = Array.from(lsMap.values());
      writeMembersLS(mergedLS);
      setMembersLS(mergedLS);

      const nextPerms = { ...readPermsLS(), ...rolesMap };
      writePermsLS(nextPerms);
      setPermsLS(nextPerms);
    } catch {
      setMembersDB([]); setPermsDB({});
    }
  }

  React.useEffect(() => {
    loadFromSupabase();
    const h = () => loadFromSupabase();
    try { window.addEventListener("follies:auth-sync", h); } catch {}
    return () => { try { window.removeEventListener("follies:auth-sync", h); } catch {} };
  }, []);

  // Velg kilde
  const useDB = membersDB.length > 0;
  const members = useDB ? membersDB : membersLS;
  const perms = useDB ? permsDB : permsLS;

  const leaders = React.useMemo(
    () => members.filter((m) => hasRole(perms, idOf(m), "leader")).sort((a, b) => fullName(a).localeCompare(fullName(b), "nb")),
    [members, perms]
  );
  const admins = React.useMemo(
    () => members.filter((m) => hasRole(perms, idOf(m), "admin")).sort((a, b) => fullName(a).localeCompare(fullName(b), "nb")),
    [members, perms]
  );

  function resetForm() {
    setFirstName(""); setLastName(""); setEmail(""); setPhone(""); setAvatarUrl(""); setAsAdmin(false);
  }
  function validateEmail(v: string) { return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v); }

  /* ---------- Knapper: “Gjør meg til leder/admin (DB)” ---------- */
  async function makeMeDB(asAdminFlag: boolean) {
    setOk(null); setErr(null);

    try {
      setBusy(true);
      // sørg for at vi har en e-post fra session
      const { data } = await supabase.auth.getSession();
      const em = data.session?.user?.email ?? meEmail ?? null;
      if (!em) throw new Error("Du må være innlogget for å gjøre dette.");

      const nameGuess = em.split("@")[0]?.replace(/[._-]/g, " ") || "";

      const res = await fetch("/api/admin/create-leader", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          first_name: firstName || nameGuess.split(" ")[0] || "",
          last_name: lastName || nameGuess.split(" ").slice(1).join(" ") || "",
          email: em,
          phone: phone || "",
          avatar_url: avatarUrl || "",
          asAdmin: asAdminFlag,
        }),
      });

      const json = await res.json();
      if (!res.ok || !json?.ok) throw new Error(json?.error || "Klarte ikke å oppdatere roller.");

      await loadFromSupabase();

      setOk(asAdminFlag ? "Du er nå admin (DB)." : "Du er nå leder (DB).");
      setTimeout(() => setOk(null), 2000);
    } catch (e: any) {
      setErr(e?.message || "Ukjent feil.");
      setTimeout(() => setErr(null), 3000);
    } finally {
      setBusy(false);
    }
  }

  /* ---------- Skjema: opprett leder (valgfri admin) ---------- */
  async function upsertLeader(e: React.FormEvent) {
    e.preventDefault();
    setOk(null); setErr(null);

    const em = email.trim();
    if (!validateEmail(em)) { setErr("Ugyldig e-post."); return; }

    try {
      setBusy(true);

      const res = await fetch("/api/admin/create-leader", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          first_name: firstName,
          last_name: lastName,
          email: em,
          phone,
          avatar_url: avatarUrl,
          asAdmin,
        }),
      });

      const json = await res.json();
      if (!res.ok || !json?.ok) throw new Error(json?.error || "Klarte ikke å opprette leder.");

      await loadFromSupabase();

      // Speil også til LS for øyeblikkelig respons (beholdt)
      const member_id: string = json.member_id;
      const ms = readMembersLS();
      const idx = ms.findIndex((m) => emailOf(m)?.toLowerCase() === em.toLowerCase());
      const base = {
        id: member_id,
        first_name: firstName || pick(ms[idx], ["first_name","fornavn"], ""),
        last_name:  lastName  || pick(ms[idx], ["last_name","etternavn"], ""),
        email: em,
        phone: phone || pick(ms[idx], ["phone"], ""),
        avatar_url: avatarUrl || pick(ms[idx], ["avatar_url"], ""),
        created_at: pick(ms[idx], ["created_at"], new Date().toISOString()),
      };
      if (idx >= 0) ms[idx] = { ...ms[idx], ...base };
      else ms.unshift(base);
      writeMembersLS(ms);
      setMembersLS(ms);

      const p = readPermsLS();
      const roles = new Set([...(p[member_id]?.roles ?? []), "leader", ...(asAdmin ? ["admin"] : [])]);
      writePermsLS({ ...p, [member_id]: { roles: Array.from(roles) } });
      setPermsLS(readPermsLS());

      setOk("Leder opprettet.");
      resetForm();
      setTimeout(() => setOk(null), 2000);
    } catch (e: any) {
      setErr(e?.message || "Ukjent feil ved opprettelse.");
      setTimeout(() => setErr(null), 4000);
    } finally {
      setBusy(false);
    }
  }

  /* ------------------------------- RENDER -------------------------------- */

  // Handlingskort (admin-hub)
  const actions = [
    { id: "access", label: "Tilgang & roller", href: "/admin/access", desc: "Sett rettigheter pr. modul/tilbud." },
    { id: "cleanup-ls", label: "Rydd spøkelses-aktiviteter (LS)", href: "/admin/cleanup-activities", desc: "Fjern lokale aktivitetsrester." },
    { id: "cleanup-db", label: "Rydd spøkelses-aktiviteter (DB)", href: "/admin/cleanup-db-activities", desc: "Slett uaktuelle aktiviteter i databasen." },
    { id: "activities", label: "Aktiviteter", href: "/activities", desc: "Se og administrer alle aktiviteter." },
    { id: "new-activity", label: "Ny aktivitet", href: "/activities/new", desc: "Opprett nytt tilbud, event eller forestilling.", tone: "primary" as const },
  ];

  return (
    <div className="mx-auto max-w-7xl px-4 py-8 space-y-6">
      {/* HERO – beholdt stil */}
      <div className="rounded-2xl ring-1 ring-black/10 bg-gradient-to-r from-red-800 to-red-600 text-white">
        <div className="px-6 py-6 flex flex-wrap items-center justify-between gap-3">
          <div>
            <div className="text-sm text-white/90">Admin</div>
            <h1 className="text-2xl font-semibold">Tilganger</h1>
            <p className="text-sm text-white/90">Opprett ledere (og ev. gi admin-tilgang).</p>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => makeMeDB(false)}
              className="inline-flex items-center gap-2 rounded-md bg-white px-3 py-2 text-sm font-semibold text-red-700 ring-1 ring-red-200 hover:bg-red-50 disabled:opacity-60"
              disabled={busy}
            >
              {/* liten inline-ikon */}
              <span aria-hidden>⭐</span>
              Gjør meg til leder (DB)
            </button>
            <button
              onClick={() => makeMeDB(true)}
              className="inline-flex items-center gap-2 rounded-md bg-black px-3 py-2 text-sm font-semibold text-white hover:bg-neutral-800 disabled:opacity-60"
              disabled={busy}
            >
              <span aria-hidden>🛡️</span>
              Gjør meg til admin (DB)
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

      {/* ADMIN-HUB: pent rutenett med handlingsknapper */}
      <section className="rounded-2xl bg-white p-5 shadow-sm ring-1 ring-black/5">
        <h2 className="text-lg font-semibold text-black">Verktøy</h2>
        <ul className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {actions.map((a) => (
            <li key={a.id}>
              <Link
                href={a.href}
                className={`block rounded-xl border p-4 ring-1 ring-black/5 hover:shadow-sm transition ${
                  a.tone === "primary" ? "bg-neutral-50" : "bg-white"
                }`}
              >
                <div className="flex items-center justify-between">
                  <div className="text-[15px] font-semibold text-neutral-900">{a.label}</div>
                  <div className="text-[12px] font-semibold text-red-700 opacity-0 transition group-hover:opacity-100">Åpne →</div>
                </div>
                {a.desc ? <p className="mt-1 text-[13px] text-neutral-700">{a.desc}</p> : null}
              </Link>
            </li>
          ))}
        </ul>
      </section>

      {/* Underseksjoner: Skjema + Lister (beholder funksjonelt oppsett) */}
      <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
        {/* Skjema */}
        <section className="xl:col-span-2 rounded-2xl bg-white p-5 shadow-sm ring-1 ring-black/5">
          <h2 className="text-lg font-semibold text-black">Opprett leder</h2>
          <p className="mt-1 text-sm text-neutral-700">
            Fyll inn personens detaljer. Personen opprettes i Supabase og får leder-rolle.
            Kryss av for admin hvis de også skal styre tilgang.
          </p>

          <form onSubmit={upsertLeader} className="mt-4 grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-neutral-800">Fornavn</label>
              <input value={firstName} onChange={(e) => setFirstName(e.target.value)} className="mt-1 w-full rounded-lg border border-neutral-300 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-red-600" placeholder="Fornavn" />
            </div>
            <div>
              <label className="block text-sm font-medium text-neutral-800">Etternavn</label>
              <input value={lastName} onChange={(e) => setLastName(e.target.value)} className="mt-1 w-full rounded-lg border border-neutral-300 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-red-600" placeholder="Etternavn" />
            </div>
            <div className="sm:col-span-2">
              <label className="block text-sm font-medium text-neutral-800">E-post (påkrevd)</label>
              <input required type="email" value={email} onChange={(e) => setEmail(e.target.value)} className="mt-1 w-full rounded-lg border border-neutral-300 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-red-600" placeholder="navn@domene.no" />
            </div>
            <div>
              <label className="block text-sm font-medium text-neutral-800">Telefon</label>
              <input value={phone} onChange={(e) => setPhone(e.target.value)} className="mt-1 w-full rounded-lg border border-neutral-300 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-red-600" placeholder="+47 …" />
            </div>
            <div>
              <label className="block text-sm font-medium text-neutral-800">Avatar URL</label>
              <input value={avatarUrl} onChange={(e) => setAvatarUrl(e.target.value)} className="mt-1 w-full rounded-lg border border-neutral-300 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-red-600" placeholder="https://…" />
            </div>

            <div className="sm:col-span-2 flex items-center justify-between gap-3">
              <div className="flex flex-wrap items-center gap-4">
                <div className="inline-flex items-center gap-2">
                  <input id="role-leader" type="checkbox" checked disabled className="h-4 w-4 rounded border-neutral-300 text-red-600 focus:ring-red-600" />
                  <label htmlFor="role-leader" className="text-sm font-medium text-neutral-900">Rolle: Leder (obligatorisk)</label>
                </div>
                <div className="inline-flex items-center gap-2">
                  <input id="role-admin" type="checkbox" checked={asAdmin} onChange={(e) => setAsAdmin(e.target.checked)} className="h-4 w-4 rounded border-neutral-300 text-red-600 focus:ring-red-600" />
                  <label htmlFor="role-admin" className="text-sm font-medium text-neutral-900">Gi admin-tilganger</label>
                </div>
              </div>

              <div className="flex items-center gap-2">
                <button type="submit" disabled={busy} className="rounded-lg bg-red-600 px-4 py-2 text-sm font-semibold text-white hover:bg-red-700 disabled:opacity-60">
                  {busy ? "Lagrer…" : "Lagre"}
                </button>
                <button type="button" onClick={resetForm} disabled={busy} className="rounded-lg bg-white px-4 py-2 text-sm font-semibold text-neutral-900 ring-1 ring-neutral-300 hover:bg-neutral-100 disabled:opacity-60">
                  Nullstill
                </button>
              </div>
            </div>
          </form>
        </section>

        {/* Lister – Supabase hvis mulig, ellers LS */}
        <section className="rounded-2xl bg-white p-5 shadow-sm ring-1 ring-black/5">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold text-black">
              Ledere {useDB ? <span className="text-xs text-neutral-500">(Supabase)</span> : <span className="text-xs text-neutral-500">(lokal)</span>}
            </h2>
            <span className="inline-flex items-center rounded-full bg-black/85 px-2.5 py-0.5 text-xs font-semibold text-white">{leaders.length}</span>
          </div>
          {leaders.length === 0 ? (
            <div className="mt-3 text-neutral-700">Ingen ledere enda.</div>
          ) : (
            <ul className="mt-4 divide-y divide-neutral-200">
              {leaders.map((m) => (
                <li key={idOf(m)} className="py-3 flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="font-medium text-black">{fullName(m)}</div>
                    <div className="text-sm text-neutral-700 truncate">{emailOf(m) || <span className="text-neutral-500">Ingen e-post</span>}</div>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <button onClick={() => router.push(`/members/${encodeURIComponent(idOf(m))}`)} className="rounded-md bg-white px-3 py-1.5 text-sm font-semibold text-neutral-900 ring-1 ring-neutral-300 hover:bg-neutral-100">Åpne</button>
                    <button onClick={() => router.push(`/members/${encodeURIComponent(idOf(m))}/edit`)} className="rounded-md bg-black px-3 py-1.5 text-sm font-semibold text-white hover:bg-neutral-800">Rediger</button>
                  </div>
                </li>
              ))}
            </ul>
          )}

          <div className="mt-6 flex items-center justify-between">
            <h2 className="text-lg font-semibold text-black">
              Administratorer {useDB ? <span className="text-xs text-neutral-500">(Supabase)</span> : <span className="text-xs text-neutral-500">(lokal)</span>}
            </h2>
            <span className="inline-flex items-center rounded-full bg-black/85 px-2.5 py-0.5 text-xs font-semibold text-white">{admins.length}</span>
          </div>
          {admins.length === 0 ? (
            <div className="mt-3 text-neutral-700">Ingen administratorer enda.</div>
          ) : (
            <ul className="mt-4 divide-y divide-neutral-200">
              {admins.map((m) => (
                <li key={idOf(m)} className="py-3 flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="font-medium text-black">{fullName(m)}</div>
                    <div className="text-sm text-neutral-700 truncate">{emailOf(m) || <span className="text-neutral-500">Ingen e-post</span>}</div>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <button onClick={() => router.push(`/members/${encodeURIComponent(idOf(m))}`)} className="rounded-md bg-white px-3 py-1.5 text-sm font-semibold text-neutral-900 ring-1 ring-neutral-300 hover:bg-neutral-100">Åpne</button>
                    <button onClick={() => router.push(`/members/${encodeURIComponent(idOf(m))}/edit`)} className="rounded-md bg-black px-3 py-1.5 text-sm font-semibold text-white hover:bg-neutral-800">Rediger</button>
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
