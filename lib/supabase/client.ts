"use client";
import { createClientComponentClient } from "@supabase/auth-helpers-nextjs";

/** Bruk denne fra server-komponenter som trenger en klient i browser */
export function getSupabaseBrowserClient() {
  return createClientComponentClient();
}
export default getSupabaseBrowserClient;
