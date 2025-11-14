// lib/supabase/service.ts
// Server-side helper for creating a Supabase client with the service role key.
// This must never be imported from the browser – it exposes full database access.

import { createClient, type SupabaseClient } from "@supabase/supabase-js";

let serviceClient: SupabaseClient | null = null;

function getEnvUrl() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (!url) throw new Error("Missing NEXT_PUBLIC_SUPABASE_URL env");
  return url;
}

function getEnvServiceKey() {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!key) throw new Error("Missing SUPABASE_SERVICE_ROLE_KEY env");
  return key;
}

export function getServiceRoleClient(): SupabaseClient {
  if (typeof window !== "undefined") {
    throw new Error("getServiceRoleClient must only be used on the server");
  }

  if (!serviceClient) {
    serviceClient = createClient(getEnvUrl(), getEnvServiceKey(), {
      auth: { persistSession: false },
    });
  }

  return serviceClient;
}

export default getServiceRoleClient;
