import "server-only";
import { cookies } from "next/headers";
import { createServerClient, type CookieOptions, type SupabaseClient } from "@supabase/ssr";

/**
 * Viktig om cookies i Next.js App Router:
 * - I Server Components (RSC) er cookies "read-only". Å sette cookies der kaster feil.
 * - I Route Handlers / Server Actions kan du sette cookies.
 *
 * Nedenfor eksporterer vi to varianter:
 *  1) getSupabaseServerClient()  → RSC-sikker (set/remove = no-op). Bruk i Server Components.
 *  2) getSupabaseServerClientForRoute() → kan sette cookies. Bruk i Route Handlers / Server Actions.
 *
 * For bakoverkompatibilitet eksporterer vi også `createClient` som peker på RSC-sikker varianten.
 */

function requireEnv() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anon) {
    throw new Error(
      "Supabase mangler miljøvariabler. Sjekk .env.local for NEXT_PUBLIC_SUPABASE_URL og NEXT_PUBLIC_SUPABASE_ANON_KEY."
    );
  }
  return { url, anon };
}

/** 1) RSC-sikker klient – set/remove er no-op (forhindrer runtime-feilen) */
export function getSupabaseServerClient(): SupabaseClient {
  const { url, anon } = requireEnv();
  const cookieStore = cookies();

  return createServerClient(url, anon, {
    cookies: {
      get(name: string) {
        return cookieStore.get(name)?.value;
      },
      // No-op i RSC: Next.js tillater ikke å sette cookies her.
      set(_name: string, _value: string, _options: CookieOptions) {},
      remove(_name: string, _options: CookieOptions) {},
    },
  });
}

/** 2) Route Handler/Server Action-klient – kan sette cookies */
export function getSupabaseServerClientForRoute(): SupabaseClient {
  const { url, anon } = requireEnv();
  const cookieStore = cookies();

  return createServerClient(url, anon, {
    cookies: {
      get(name: string) {
        return cookieStore.get(name)?.value;
      },
      set(name: string, value: string, options: CookieOptions) {
        // Tillatt i route handlers / server actions
        cookieStore.set({ name, value, ...options });
      },
      remove(name: string, options: CookieOptions) {
        cookieStore.set({ name, value: "", ...options, maxAge: 0 });
      },
    },
  });
}

/** Bakoverkompatibelt alias brukt av eksisterende kode (f.eks. AppHeader.tsx) */
export const createClient = getSupabaseServerClient;

export default getSupabaseServerClient;
