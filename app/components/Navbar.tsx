"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
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
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    let mounted = true;

    const load = async () => {
      const { data } = await supabase.auth.getSession();
      const session = data.session;
      setSignedIn(!!session);

      if (session) {
        const { data: p } = await supabase
          .from("profiles")
          .select("first_name,last_name,is_admin")
          .eq("id", session.user.id)
          .maybeSingle();
        if (mounted) setProfile(p ?? null);
      } else {
        if (mounted) setProfile(null);
      }
    };

    load();
    const { data: sub } = supabase.auth.onAuthStateChange(() => load());
    return () => {
      mounted = false;
      sub.subscription.unsubscribe();
    };
  }, []);

  const onLogout = async () => {
    await supabase.auth.signOut();
    router.refresh();
    if (pathname !== "/") router.replace("/login");
  };

  const displayName = [titleCase(profile?.first_name), titleCase(profile?.last_name)]
    .filter(Boolean)
    .join(" ");

  return (
    <header className="w-full bg-black text-white">
      <div className="mx-auto max-w-6xl px-4 h-14 flex items-center justify-between">
        <div className="flex items-center gap-4">
          <img src="/images/follies-logo.jpg" alt="Follies" className="h-8 w-auto object-contain" />
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
          {signedIn ? (
            <>
              {displayName ? <span className="text-sm text-neutral-200">{displayName}</span> : null}
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
