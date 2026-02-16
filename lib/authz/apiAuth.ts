import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { createClient, type User } from "@supabase/supabase-js";
import { createRouteHandlerClient } from "@/lib/supabase/handlers";
import { getSupabaseServiceRoleClient } from "@/lib/supabase/server";

type AuthOk = {
  ok: true;
  user: User;
  memberId: string | null;
  roles: string[];
  isLeader: boolean;
  isAdmin: boolean;
};

type AuthFail = {
  ok: false;
  response: NextResponse;
};

export type ApiAuthResult = AuthOk | AuthFail;

const LEADER_ROLES = new Set(["leader", "leder", "staff", "admin"]);

function unauthorized(message = "Unauthorized"): AuthFail {
  return {
    ok: false,
    response: NextResponse.json({ error: message }, { status: 401 }),
  };
}

function forbidden(message = "Forbidden"): AuthFail {
  return {
    ok: false,
    response: NextResponse.json({ error: message }, { status: 403 }),
  };
}

function uniqueLower(items: string[]): string[] {
  return Array.from(
    new Set(
      items
        .map((x) => String(x ?? "").trim().toLowerCase())
        .filter(Boolean)
    )
  );
}

function getBearerToken(req: Request): string | null {
  const raw = String(req.headers.get("authorization") ?? "").trim();
  if (!raw) return null;
  const m = raw.match(/^Bearer\s+(.+)$/i);
  return m?.[1]?.trim() || null;
}

async function getUserFromBearer(token: string): Promise<User | null> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anon) return null;

  const sb = createClient(url, anon, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { data, error } = await sb.auth.getUser(token);
  if (error) return null;
  return data.user ?? null;
}

async function getUserFromCookies(): Promise<User | null> {
  const sb = createRouteHandlerClient({ cookies });
  const { data, error } = await sb.auth.getUser();
  if (error) return null;
  return data.user ?? null;
}

async function loadRoleState(user: User): Promise<{
  memberId: string | null;
  roles: string[];
}> {
  const db = getSupabaseServiceRoleClient();
  if (!db) return { memberId: null, roles: [] };

  let memberId: string | null = null;
  const mergedRoles: string[] = [];

  const email = String(user.email ?? "").trim();
  if (email) {
    const { data, error } = await db
      .from("members")
      .select("id, member_roles(role)")
      .ilike("email", email)
      .maybeSingle();

    if (!error && data) {
      memberId = String((data as any).id ?? "") || null;
      const rows = Array.isArray((data as any)?.member_roles)
        ? (data as any).member_roles
        : [];
      for (const r of rows) mergedRoles.push(String((r as any)?.role ?? ""));
    }
  }

  // Fallback/tillegg: enkelte eldre admin-flow bruker profiles.role
  const { data: profile, error: pErr } = await db
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .maybeSingle();

  if (!pErr && profile?.role) mergedRoles.push(String(profile.role));

  return { memberId, roles: uniqueLower(mergedRoles) };
}

async function authenticate(req: Request): Promise<ApiAuthResult> {
  const bearer = getBearerToken(req);
  let user: User | null = null;
  if (bearer) user = await getUserFromBearer(bearer);
  if (!user) user = await getUserFromCookies();
  if (!user) return unauthorized();

  const state = await loadRoleState(user);
  const roles = state.roles;
  const isAdmin = roles.includes("admin");
  const isLeader = roles.some((r) => LEADER_ROLES.has(r));

  return {
    ok: true,
    user,
    memberId: state.memberId,
    roles,
    isLeader,
    isAdmin,
  };
}

export async function requireApiUser(req: Request): Promise<ApiAuthResult> {
  return authenticate(req);
}

export async function requireApiMember(req: Request): Promise<ApiAuthResult> {
  const auth = await authenticate(req);
  if (!auth.ok) return auth;
  if (!auth.memberId) return forbidden("Fant ikke medlem koblet til innlogget bruker.");
  return auth;
}

export async function requireLeader(req: Request): Promise<ApiAuthResult> {
  const auth = await authenticate(req);
  if (!auth.ok) return auth;
  if (!auth.isLeader) return forbidden("Kun ledere/ansatte har tilgang.");
  return auth;
}

export async function requireAdmin(req: Request): Promise<ApiAuthResult> {
  const auth = await authenticate(req);
  if (!auth.ok) return auth;
  if (!auth.isAdmin) return forbidden("Kun admin har tilgang.");
  return auth;
}
