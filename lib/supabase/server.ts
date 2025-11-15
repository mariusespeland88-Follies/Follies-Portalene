// lib/supabase/server.ts
import { cookies } from "next/headers";
import { createServerClient, type CookieOptions } from "@supabase/ssr";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import type { SupabaseClient } from "@supabase/supabase-js";

let _admin: ReturnType<typeof createSupabaseClient> | null = null;

const isStubValue = (value?: string | null) => {
  if (!value) return true;
  if (value === "undefined") return true;
  return value.startsWith("stub:");
};

function createAdminClient(url: string, service: string) {
  if (_admin) return _admin;
  _admin = createSupabaseClient(url, service, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  return _admin;
}

export function getSupabaseServiceRoleClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const service = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (isStubValue(url) || isStubValue(service)) {
    return null;
  }
  if (!url || !service) {
    return null;
  }
  return createAdminClient(url, service);
}

export function getSupabaseAdmin() {
  const client = getSupabaseServiceRoleClient();
  if (!client) {
    throw new Error("Supabase service role mangler konfigurasjon");
  }
  return client;
}

// shim for eksisterende importnavn
export const supabaseAdmin = getSupabaseServiceRoleClient();

export function createClient(): SupabaseClient {
  const cookieStore = cookies();

  const mutableCookies = cookieStore as unknown as {
    set?: (options: { name: string; value: string } & CookieOptions) => void;
  };

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        get(name: string) {
          return cookieStore.get(name)?.value;
        },
        set(name: string, value: string, options: CookieOptions) {
          try {
            mutableCookies.set?.({ name, value, ...options });
          } catch {
            // Ignorer fordi cookies() kan være read-only i serverkomponenter
          }
        },
        remove(name: string, options: CookieOptions) {
          try {
            mutableCookies.set?.({ name, value: "", ...options });
          } catch {
            // Ignorer fordi cookies() kan være read-only i serverkomponenter
          }
        },
      },
    }
  );
}
