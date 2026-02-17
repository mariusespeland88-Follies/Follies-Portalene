"use client";

import * as React from "react";
import Link from "next/link";
import { supabase } from "@/lib/supabaseClient";

export default function PortalOnlyStaffPage() {
  const [signingOut, setSigningOut] = React.useState(true);

  React.useEffect(() => {
    let alive = true;
    (async () => {
      try {
        await supabase.auth.signOut();
      } finally {
        if (alive) setSigningOut(false);
      }
    })();
    return () => {
      alive = false;
    };
  }, []);

  return (
    <main className="min-h-[70vh] bg-gradient-to-br from-black via-zinc-950 to-black px-4 py-14 text-white">
      <div className="mx-auto w-full max-w-xl rounded-3xl border border-white/10 bg-white/5 p-8 shadow-2xl backdrop-blur">
        <h1 className="text-2xl font-black">Portalen er kun for ledere og admin</h1>
        <p className="mt-3 text-sm leading-relaxed text-white/80">
          Medlemmer har tilgang i mobilappen, ikke i ansattportalen.
        </p>

        <div className="mt-5 rounded-2xl border border-red-500/35 bg-red-500/10 p-4 text-sm text-red-100">
          {signingOut ? "Logger deg ut av portalen..." : "Du er logget ut av portalen."}
        </div>

        <div className="mt-6 flex flex-wrap items-center gap-3">
          <Link
            href="/login"
            className="rounded-xl bg-red-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-red-700"
          >
            Tilbake til innlogging
          </Link>
          <Link
            href="https://www.follies.no"
            className="rounded-xl border border-white/20 px-4 py-2.5 text-sm font-semibold text-white/90 hover:bg-white/10"
          >
            Gå til Follies.no
          </Link>
        </div>
      </div>
    </main>
  );
}
