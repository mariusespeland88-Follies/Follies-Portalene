"use client";

import { useEffect } from "react";
import getSupabaseBrowserClient from "@/lib/supabase/client";

/**
 * SupabaseBridge
 * - Usynlig komponent som holder localStorage i sync med Supabase Auth.
 * - Påvirker IKKE design eller eksisterende flyt – bare sørger for at
 *   'follies.session.email' (og 'follies.currentEmail') alltid er riktig.
 *
 * Monteres én gang i (protected) layout.
 */

function safeSet(key: string, value: any) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {}
}
function safeRemove(key: string) {
  try {
    localStorage.removeItem(key);
  } catch {}
}

export default function SupabaseBridge() {
  useEffect(() => {
    let unsub: (() => void) | undefined;

    try {
      const supabase = getSupabaseBrowserClient();

      // Init: les nåværende session og speil e-post
      supabase.auth.getSession().then(({ data }) => {
        const email = data.session?.user?.email ?? null;
        if (email) {
          safeSet("follies.session.email", email);
          safeSet("follies.currentEmail", email);
        } else {
          safeRemove("follies.session.email");
          safeRemove("follies.currentEmail");
        }
      });

      // Lytt på endringer (login/logout)
      const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
        const email = session?.user?.email ?? null;
        if (email) {
          safeSet("follies.session.email", email);
          safeSet("follies.currentEmail", email);
        } else {
          safeRemove("follies.session.email");
          safeRemove("follies.currentEmail");
        }
        // Valgfritt: signal til UI som lytter
        try {
          window.dispatchEvent(new CustomEvent("follies:auth-sync"));
        } catch {}
      });

      unsub = sub?.subscription?.unsubscribe;
    } catch {
      // Hvis Supabase ikke er konfigurert enda, gjør ingenting.
    }

    return () => {
      try { unsub?.(); } catch {}
    };
  }, []);

  return null;
}
