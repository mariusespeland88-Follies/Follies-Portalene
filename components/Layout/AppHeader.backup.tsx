"use client";

import * as React from "react";
import Link from "next/link";
import getSupabaseBrowserClient from "@/lib/supabase/client";
import { usePermissions } from "@/hooks/usePermissions";

/**
 * AppHeader – fasit-svart toppbar, same layout.
 * Endring: Navn vises alltid uten tall (Marius Espeland → ikke “Espeland88”),
 * Title Case, og Admin er ikon (kun for admin).
 */

export default function AppHeader() {
  const supabase = React.useMemo(() => getSupabaseBrowserClient(), []);
  const { isAdmin: isAdminFromHook } = usePermissions();

  const [email, setEmail] = React.useState<string | null>(null);
  const [displayName, setDisplayName] = React.useState<string | null>(null);
  const [isAdminDirectDB, setIsAdminDirectDB] = React.useState(false);

  /* ---------------- helpers ---------------- */
  function readLS(key: string): string | null {
    try { return localStorage.getItem(key); } catch { return null; }
  }
  function parseJSON<T>(raw: string | null, fb: T): T {
    try { return raw ? (JSON.parse(raw) as T) : fb; } catch { return fb; }
  }
  function titleCase(s: string): string {
    if (!s) return s;
    return s
      .split(/\s+/)
      .map((w) => (w ? w[0].toUpperCase() + w.slice(1).toLowerCase() : w))
      .join(" ");
  }
  function sanitizePart(part: string | null | undefined) {
    return titleCase(String(part ?? "").replace(/\d+/g, "").replace(/[_\-.]+/g, " ").replace(/\s+/g, " ").trim());
  }
  function combineName(fn?: string | null, ln?: string | null, full?: string | null) {
    const fullSan = sanitizePart(full);
    const fnSan = sanitizePart(fn);
    const lnSan = sanitizePart(ln);
    const combo = [fnSan, lnSan].filter(Boolean).join(" ").trim();
    return titleCase(combo || fullSan);
  }
  function humanFromEmail(em: string): string {
    const local = em.split("@")[0] || "";
    const words = local.replace(/[._-]+/g, " ").split(" ").filter(Boolean);
    const noNums = words.map((w) => w.replace(/\d+/g, "")).filter(Boolean);
    return titleCase(noNums.join(" ").trim()) || em;
  }

  async function refreshIdentity() {
    // 1) session/e-post
    const { data } = await supabase.auth.getSession();
    const em = data.session?.user?.email ?? null;
    setEmail(em);

    // 2) forsøk DB: navn + admin
    setIsAdminDirectDB(false);
    let nameFromDB: string | null = null;
    if (em) {
      try {
        const { data: rows, error } = await supabase
          .from("members")
          .select("first_name, last_name, full_name, name, email, member_roles ( role )")
          .ilike("email", em)
          .limit(1);

        if (!error && rows && rows.length > 0) {
          const r: any = rows[0];
          nameFromDB = combineName(r.first_name, r.last_name, r.full_name ?? r.name ?? null) || null;
          const roles = Array.isArray(r.member_roles) ? r.member_roles.map((x: any) => String(x.role).toLowerCase()) : [];
          if (roles.includes("admin")) setIsAdminDirectDB(true);
        }
      } catch {
        // stille
      }
    }

    // 3) fallback: LS → ellers humanize e-post
    if (!nameFromDB && em) {
      const ms = parseJSON<any[]>(readLS("follies.members.v1"), []);
      const me = ms.find((m) => String(m?.email ?? m?.epost ?? m?.mail ?? "").toLowerCase() === em.toLowerCase());
      const nm = me
        ? combineName(me.first_name ?? me.fornavn, me.last_name ?? me.etternavn, me.full_name ?? me.name ?? me.navn)
        : "";
      setDisplayName(nm || humanFromEmail(em));
    } else {
      setDisplayName(nameFromDB || (em ? humanFromEmail(em) : null));
    }
  }

  React.useEffect(() => {
    refreshIdentity();
    const onAuth = () => refreshIdentity();
    const onMember = () => refreshIdentity();
    try { window.addEventListener("follies:auth-sync", onAuth); } catch {}
    try { window.addEventListener("follies:member-sync", onMember); } catch {}
    return () => {
      try { window.removeEventListener("follies:auth-sync", onAuth); } catch {}
      try { window.removeEventListener("follies:member-sync", onMember); } catch {}
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function onSignOut() {
    try {
      await supabase.auth.signOut();
      if (typeof window !== "undefined") window.location.reload();
    } catch {
      // stille
    }
  }

  const showAdmin = isAdminFromHook || isAdminDirectDB;

  return (
    <header className="w-full bg-black">
      <div className="mx-auto flex max-w-7xl items-center justify-between px-4 py-3">
        {/* Venstre: logo + tittel */}
        <div className="flex items-center gap-3">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/images/follies-logo.jpg"
            alt="Follies"
            className="h-8 w-8 rounded object-cover ring-1 ring-white/10"
          />
          <Link
            href="/"
            className="text-base font-semibold tracking-tight text-white hover:text-red-400"
          >
            Follies Portal
          </Link>
        </div>

        {/* Navigasjon + auth */}
        <nav className="flex items-center gap-2">
          <Link href="/dashboard" className="rounded-md px-3 py-2 text-sm font-semibold text-white hover:text-red-400">
            Dashboard
          </Link>
          <Link href="/members" className="rounded-md px-3 py-2 text-sm font-semibold text-white hover:text-red-400">
            Medlemmer
          </Link>
          <Link href="/activities" className="rounded-md px-3 py-2 text-sm font-semibold text-white hover:text-red-400">
            Aktiviteter
          </Link>
          <Link href="/calendar" className="rounded-md px-3 py-2 text-sm font-semibold text-white hover:text-red-400">
            Kalender
          </Link>

          {showAdmin && (
            <Link href="/admin" className="rounded-md p-2 text-white hover:text-red-400" title="Admin" aria-label="Admin">
              {/* Skjold-ikon */}
              <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                <path d="M12 2l7 3v6c0 5-3.5 9.74-7 11-3.5-1.26-7-6-7-11V5l7-3z" />
              </svg>
            </Link>
          )}

          {!email ? (
            <Link href="/login" className="rounded-md px-3 py-2 text-sm font-semibold text-white hover:text-red-400">
              Logg inn
            </Link>
          ) : (
            <div className="ml-2 hidden items-center gap-3 md:flex">
              <span className="inline-flex items-center gap-2 text-sm text-white/90">
                <span className="inline-block h-2 w-2 rounded-full bg-green-500" />
                Innlogget
              </span>
              <span className="max-w-[240px] truncate text-sm text-white/90">{displayName || email}</span>
              <button
                onClick={onSignOut}
                className="rounded-lg border border-white/25 px-3 py-1.5 text-sm font-semibold text-white hover:bg-white/10"
              >
                Logg ut
              </button>
            </div>
          )}
        </nav>
      </div>
    </header>
  );
}
