"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";

type Profile = { first_name?: string | null; last_name?: string | null; is_admin?: boolean | null };

const titleCase = (s?: string | null) =>
  (s || "")
    .toLowerCase()
    .split(" ")
    .filter(Boolean)
    .map((w) => w[0]?.toUpperCase() + w.slice(1))
    .join(" ");

export default function TopBar() {
  const [signedIn, setSignedIn] = useState(false);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [devBypass, setDevBypass] = useState(false);
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    let mounted = true;

    const readBypass = () => {
      if (typeof document === "undefined") return false;
      return document.cookie
        .split(";")
        .map((c) => c.trim())
        .some((c) => c === "dev_bypass=1");
    };

    const syncBypass = () => {
      if (!mounted) return;
      setDevBypass(readBypass());
    };

    const load = async () => {
      const { data } = await supabase.auth.getSession();
      const session = data.session;
      setSignedIn(!!session);
      syncBypass();

      if (session) {
        const { data: p } = await supabase
          .from("profiles")
          .select("first_name,last_name,is_admin")
          .eq("id", session.user.id)
          .maybeSingle();
        if (mounted) setProfile(p ?? null);
      } else if (mounted) {
        setProfile(null);
      }
    };

    load();
    const { data: sub } = supabase.auth.onAuthStateChange(() => load());
    try {
      window.addEventListener("focus", syncBypass);
      window.addEventListener("follies:auth-sync", syncBypass);
    } catch {}
    return () => {
      mounted = false;
      sub.subscription.unsubscribe();
      try {
        window.removeEventListener("focus", syncBypass);
        window.removeEventListener("follies:auth-sync", syncBypass);
      } catch {}
    };
  }, []);

  const onLogout = async () => {
    try {
      await supabase.auth.signOut();
    } catch {}
    try {
      await fetch("/logout", { method: "POST" });
    } catch {}
    setDevBypass(false);
    router.replace("/login");
    router.refresh();
  };

  const displayName = useMemo(() => {
    const base = [titleCase(profile?.first_name), titleCase(profile?.last_name)]
      .filter(Boolean)
      .join(" ");
    if (base) return base;
    if (signedIn) return "";
    return devBypass ? "Midlertidig tilgang" : "";
  }, [profile?.first_name, profile?.last_name, signedIn, devBypass]);

  const isLoggedIn = signedIn || devBypass;

  return (
    <header className="w-full bg-black text-white">
      <div className="mx-auto max-w-6xl px-4 h-14 flex items-center justify-between">
        <div className="flex items-center gap-4">
          <img src="/Images/follies-logo.jpg" alt="Follies" className="h-8 w-auto object-contain" />
          <span className="font-semibold tracking-wide">Follies Portal</span>
          <nav className="hidden md:flex items-center gap-6 ml-6">
            <Link href="/dashboard" className="hover:text-red-400">Dashboard</Link>
            <Link href="/activities" className="hover:text-red-400">Aktiviteter</Link>
            <Link href="/members" className="hover:text-red-400">Medlemmer</Link>
            <Link href="/calendar" className="hover:text-red-400">Kalender</Link>
            {profile?.is_admin ? (
              <Link href="/admin" className="hover:text-red-400" title="Admin" aria-label="Admin">🛡️</Link>
            ) : null}
          </nav>
        </div>

        <div className="flex items-center gap-3">
          {isLoggedIn ? (
            <>
              {displayName ? <span className="text-sm text-neutral-200">{displayName}</span> : null}
              {!signedIn && devBypass ? (
                <span className="rounded-full border border-yellow-400/40 bg-yellow-500/10 px-2 py-0.5 text-xs text-yellow-200">
                  Midlertidig
                </span>
              ) : null}
              <button
                onClick={onLogout}
                className="rounded-lg border border-white/15 bg-white/5 hover:bg-white/10 px-3 py-1.5 text-sm"
              >
                Logg ut
              </button>
            </>
          ) : (
            <Link
              href="/login"
              className="rounded-lg bg-red-600 hover:bg-red-700 px-3 py-1.5 text-sm font-semibold"
            >
              Logg inn
            </Link>
          )}
        </div>
      </div>
    </header>
  );
}
