import { createServerClient } from "@supabase/ssr";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { NextRequest, NextResponse } from "next/server";
import type { CookieOptions } from "@supabase/ssr";

type CookieTuple = { name: string; value: string; options: CookieOptions };

type CookiesGetter = () => {
  get(name: string): { value: string } | undefined;
  getAll(): Array<{ name: string; value: string }>;
  set: (...args: any[]) => void;
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

export function createRouteHandlerClient<
  Database = any,
  SchemaName extends string & keyof Database = "public" extends keyof Database ? "public" : string & keyof Database
>({ cookies }: { cookies: CookiesGetter }): SupabaseClient<Database, SchemaName> {
  const store = cookies();
  return createServerClient<Database, SchemaName>(getEnvUrl(), getEnvKey(), {
    cookies: {
      getAll() {
        return store.getAll().map(({ name, value }) => ({ name, value }));
      },
      setAll(cookiesToSet: CookieTuple[]) {
        if (typeof store.set === "function") {
          cookiesToSet.forEach(({ name, value, options }) => {
            store.set({ name, value, ...(options ?? {}) });
          });
        }
      },
    },
  });
}

export function createMiddlewareClient<
  Database = any,
  SchemaName extends string & keyof Database = "public" extends keyof Database ? "public" : string & keyof Database
>({ req, res }: { req: NextRequest; res: NextResponse }): SupabaseClient<Database, SchemaName> {
  return createServerClient<Database, SchemaName>(getEnvUrl(), getEnvKey(), {
    cookies: {
      getAll() {
        return req.cookies.getAll().map(({ name, value }) => ({ name, value }));
      },
      setAll(cookiesToSet: CookieTuple[]) {
        cookiesToSet.forEach(({ name, value, options }) => {
          res.cookies.set({ name, value, ...(options ?? {}) });
        });
      },
    },
  });
}
