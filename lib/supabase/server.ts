// lib/supabase/server.ts
import { createClient } from "@supabase/supabase-js";

let _admin: ReturnType<typeof createClient> | null = null;

export function getSupabaseAdmin() {
  if (_admin) return _admin;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const service = process.env.SUPABASE_SERVICE_ROLE_KEY!;
  _admin = createClient(url, service, {
    auth: { persistSession: false, autoRefreshToken: false }
  });
  return _admin;
}

// shim for eksisterende importnavn
export const supabaseAdmin = getSupabaseAdmin;
