import { createBrowserClient } from "@supabase/ssr";
import type { SupabaseClient, SupabaseClientOptions } from "@supabase/supabase-js";

type BrowserOptions<SchemaName extends string> = SupabaseClientOptions<SchemaName> & {
  isSingleton?: boolean;
};

function getEnvUrl() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (!url) throw new Error("Missing NEXT_PUBLIC_SUPABASE_URL env");
  return url;
}

function getEnvKey() {
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!key) throw new Error("Missing NEXT_PUBLIC_SUPABASE_ANON_KEY env");
  return key;
}

export function createClientComponentClient<
  Database = any,
  SchemaName extends string & keyof Database = "public" extends keyof Database ? "public" : string & keyof Database
>(options?: BrowserOptions<SchemaName>): SupabaseClient<Database, SchemaName> {
  return createBrowserClient<Database, SchemaName>(getEnvUrl(), getEnvKey(), options);
}
