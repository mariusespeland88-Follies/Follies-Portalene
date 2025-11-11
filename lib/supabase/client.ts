// lib/supabase/client.ts
"use client";

import { createClient } from "@supabase/supabase-js";

let _browser: ReturnType<typeof createClient> | null = null;

export default function getSupabaseBrowserClient() {
  if (_browser) return _browser;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
  _browser = createClient(url, anon);
  return _browser;
}

// shim navnet som enkelte filer forventer
export const supabaseBrowser = getSupabaseBrowserClient;
