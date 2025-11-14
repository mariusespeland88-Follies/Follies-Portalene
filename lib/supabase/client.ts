// lib/supabase/client.ts
"use client";

import { createClientComponentClient } from "@/lib/supabase/browser";

let _browser: ReturnType<typeof createClientComponentClient> | null = null;

export default function getSupabaseBrowserClient() {
  if (!_browser) {
    _browser = createClientComponentClient();
  }
  return _browser;
}

// shim navnet som enkelte filer forventer
export const supabaseBrowser = getSupabaseBrowserClient;
