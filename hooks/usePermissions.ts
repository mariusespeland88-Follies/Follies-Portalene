"use client";

import * as React from "react";
import getSupabaseBrowserClient from "@/lib/supabase/client";

/**
 * usePermissions
 * Én kilde til sannhet for roller (admin/leder) med trygg fallback.
 *
 * Hva den gjør:
 *  - Leser innlogget bruker fra Supabase (hvis session finnes).
 *  - Leser roller fra Supabase-tabellen member_roles (via members) når mulig.
 *  - Faller trygt tilbake til localStorage (follies.perms.v1 + members) når ikke innlogget.
 *  - Reagerer på "follies:auth-sync" og "follies:member-sync" events (fra våre bridge/sync-komponenter).
 *
 * Bruk:
 *  const { isAdmin, isLeader, meEmail, meMemberId, roles, loading } = usePermissions();
 *
 * NB: Endrer ikke design – kun et verktøy for å vise/skjule knapper/lenker.
 */

type AnyObj = Record<string, any>;
type Perms = Record<string, { roles?: string[] }>;

const MEM_V1 = "follies.members.v1";
const MEM_FB = "follies.members";
const PERMS  = "follies.perms.v1";

function parseJSON<T>(raw: string | null, fb: T): T {
  try { return raw ? (JSON.parse(raw) as T) : fb; } catch { return fb; }
}
function readLS(key: string): string | null {
  try { return localStorage.getItem(key); } catch { return null; }
}
function memberIdOf(m: AnyObj): string {
  const v = m?.id ?? m?.uuid ?? m?._id ?? m?.memberId;
  return v == null ? "" : String(v);
}
function emailOf(m: AnyObj): string {
  return String(m?.email ?? m?.epost ?? m?.mail ?? "");
}
function fullNameOf(m: AnyObj): string {
  const fn = String(m?.first_name ?? m?.firstName ?? m?.fornavn ?? "");
  const ln = String(m?.last_name ?? m?.lastName ?? m?.etternavn ?? "");
  const full = String(m?.full_name ?? m?.fullName ?? m?.name ?? m?.navn ?? "");
  return (full || [fn, ln].filter(Boolean).join(" ")).trim();
}
function readMembersLS(): AnyObj[] {
  const v1 = parseJSON<AnyObj[]>(readLS(MEM_V1), []);
  const fb = parseJSON<AnyObj[]>(readLS(MEM_FB), []);
  const map = new Map<string, AnyObj>();
  for (const m of [...fb, ...v1]) {
    const id = memberIdOf(m);
    if (id) map.set(id, m);
  }
  return Array.from(map.values());
}
function readPermsLS(): Perms {
  const p = parseJSON<Perms>(readLS(PERMS), {});
  return p && typeof p === "object" ? p : {};
}

function rolesFromPerms(perms: Perms, memberId: string, fallbackMember?: AnyObj): string[] {
  const rec = perms[memberId];
  if (rec?.roles && Array.isArray(rec.roles)) return rec.roles.map((r) => String(r));
  // fallback: noen eldre datasett lagret roller i selve medlemmet
  const r = fallbackMember?.roles ?? fallbackMember?.roller;
  if (Array.isArray(r)) return r.map((x: any) => String(x));
  const single = fallbackMember?.role ?? fallbackMember?.rolle;
  return single ? [String(single)] : [];
}

function uniqLower(list: string[]): string[] {
  return Array.from(new Set(list.map((x) => x.toLowerCase())));
}

export function usePermissions() {
  const supabase = React.useMemo(() => {
    try { return getSupabaseBrowserClient(); } catch { return null as any; }
  }, []);

  const [loading, setLoading] = React.useState(true);
  const [meEmail, setMeEmail] = React.useState<string | null>(null);
  const [meMemberId, setMeMemberId] = React.useState<string | null>(null);
  const [roles, setRoles] = React.useState<string[]>([]);

  async function refresh() {
    setLoading(true);

    try {
      // 1) Finn e-post fra session eller LS
      let email =
        parseJSON<string | null>(readLS("follies.currentEmail"), null) ??
        parseJSON<string | null>(readLS("follies.session.email"), null) ??
        null;

      let sessionEmail: string | null = null;
      if (supabase) {
        const { data } = await supabase.auth.getSession();
        sessionEmail = data.session?.user?.email ?? null;
        if (sessionEmail) email = sessionEmail;
      }

      setMeEmail(email);

      // 2) Slå opp medlem i LS for å finne memberId (fallback)
      const membersLS = readMembersLS();
      const memberByEmail = email ? membersLS.find((m) => emailOf(m)?.toLowerCase() === email!.toLowerCase()) : null;
      const memberIdLS = memberByEmail ? memberIdOf(memberByEmail) : null;
      setMeMemberId(memberIdLS);

      // 3) Hvis innlogget i Supabase – prøv å hente roller fra DB
      let rolesFound: string[] | null = null;
      if (supabase && sessionEmail) {
        const { data, error } = await supabase
          .from("members")
          .select("id, email, member_roles ( role )")
          .ilike("email", sessionEmail)
          .limit(1);

        if (!error && data && data.length > 0) {
          const m = data[0] as any;
          const r = Array.isArray(m.member_roles) ? m.member_roles.map((x: any) => String(x.role)) : [];
          rolesFound = r;
          // Oppdater også meMemberId hvis vi fikk id fra DB
          if (m.id) setMeMemberId(String(m.id));
        }
      }

      // 4) Fallback til LS-roller hvis DB ikke ga noe
      if (!rolesFound) {
        const perms = readPermsLS();
        const id = memberIdLS ?? ""; // kan være tom
        rolesFound = rolesFromPerms(perms, id, memberByEmail);
      }

      setRoles(uniqLower(rolesFound));
    } catch {
      // Stille feil → vi beholder forrige state
    } finally {
      setLoading(false);
    }
  }

  React.useEffect(() => {
    refresh();
    const onAuth = () => refresh();
    const onMember = () => refresh();
    try { window.addEventListener("follies:auth-sync", onAuth); } catch {}
    try { window.addEventListener("follies:member-sync", onMember); } catch {}
    return () => {
      try { window.removeEventListener("follies:auth-sync", onAuth); } catch {}
      try { window.removeEventListener("follies:member-sync", onMember); } catch {}
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const isLeader = roles.includes("leader") || roles.includes("leder") || roles.includes("staff");
  const isAdmin  = roles.includes("admin");

  return { loading, meEmail, meMemberId, roles, isLeader, isAdmin, fullNameOf };
}

export default usePermissions;
