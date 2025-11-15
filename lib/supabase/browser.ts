import { createBrowserClient } from "@supabase/ssr";
import type { SupabaseClient, SupabaseClientOptions } from "@supabase/supabase-js";

type BrowserOptions<SchemaName extends string> = SupabaseClientOptions<SchemaName> & {
  isSingleton?: boolean;
};

const isStubValue = (value?: string | null) => {
  if (!value) return true;
  if (value === "undefined") return true;
  return value.startsWith("stub:");
};

const stubError = new Error("Supabase er ikke konfigurert");

class StubQueryBuilder {
  then<TResult1 = any, TResult2 = never>(
    onfulfilled?: ((value: { data: null; error: Error }) => TResult1 | PromiseLike<TResult1>) | null,
    onrejected?: ((reason: any) => TResult2 | PromiseLike<TResult2>) | null,
  ) {
    return Promise.resolve({ data: null, error: stubError }).then(onfulfilled, onrejected);
  }

  catch<TResult = never>(onrejected?: ((reason: any) => TResult | PromiseLike<TResult>) | null) {
    return Promise.resolve({ data: null, error: stubError }).catch(onrejected as any);
  }

  finally(onfinally?: (() => void) | null) {
    return Promise.resolve({ data: null, error: stubError }).finally(onfinally ?? undefined);
  }

  select() { return this; }
  insert() { return this; }
  update() { return this; }
  delete() { return this; }
  upsert() { return this; }
  eq() { return this; }
  neq() { return this; }
  in() { return this; }
  order() { return this; }
  limit() { return this; }
  range() { return this; }
  maybeSingle() { return Promise.resolve({ data: null, error: stubError }); }
  single() { return Promise.resolve({ data: null, error: stubError }); }
  returns() { return Promise.resolve({ data: null, error: stubError }); }
}

const stubBuilder = new StubQueryBuilder();

function createStubClient<
  Database,
  SchemaName extends string & keyof Database = "public" extends keyof Database ? "public" : string & keyof Database
>(): SupabaseClient<Database, SchemaName> {
  const authStub = {
    getSession: async () => ({ data: { session: null }, error: stubError }),
    getUser: async () => ({ data: { user: null }, error: stubError }),
    signInWithPassword: async () => ({ data: null, error: stubError }),
    signOut: async () => ({ error: stubError }),
    onAuthStateChange: () => ({ data: { subscription: { unsubscribe() {} } }, error: stubError }),
  } as const;

  const storageStub = {
    from() {
      return {
        upload: async () => ({ data: null, error: stubError }),
        remove: async () => ({ data: null, error: stubError }),
        download: async () => ({ data: null, error: stubError }),
      };
    },
  };

  return {
    auth: authStub,
    from() {
      return stubBuilder as unknown as any;
    },
    rpc: async () => ({ data: null, error: stubError }),
    storage: storageStub,
    channel() {
      return {
        subscribe: () => ({ data: { subscription: { unsubscribe() {} } }, error: stubError }),
        send: async () => ({ error: stubError }),
      } as any;
    },
  } as unknown as SupabaseClient<Database, SchemaName>;
}

export function createClientComponentClient<
  Database = any,
  SchemaName extends string & keyof Database = "public" extends keyof Database ? "public" : string & keyof Database
>(options?: BrowserOptions<SchemaName>): SupabaseClient<Database, SchemaName> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (isStubValue(url) || isStubValue(key)) {
    return createStubClient<Database, SchemaName>();
  }

  return createBrowserClient<Database, SchemaName>(url!, key!, options);
}
