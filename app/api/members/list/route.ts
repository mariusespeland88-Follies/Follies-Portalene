import { NextResponse } from "next/server";
import { cookies } from "next/headers";

import { createRouteHandlerClient } from "@/lib/supabase/handlers";
import getServiceRoleClient from "@/lib/supabase/service";

export const runtime = "nodejs";

type RawMember = {
  id: string | number;
  first_name?: string | null;
  last_name?: string | null;
  email?: string | null;
  phone?: string | null;
  avatar_url?: string | null;
  created_at?: string | null;
  member_roles?: Array<{ role?: string | null }> | null;
};

function normalizeMembers(rows: RawMember[] | null | undefined) {
  const members = (rows ?? []).map((row) => ({
    id: String(row.id ?? ""),
    first_name: row.first_name ?? "",
    last_name: row.last_name ?? "",
    email: row.email ?? "",
    phone: row.phone ?? "",
    avatar_url: row.avatar_url ?? "",
    created_at: row.created_at ?? null,
  }));

  const roles: Record<string, { roles: string[] }> = {};
  for (const row of rows ?? []) {
    const id = String(row.id ?? "");
    if (!id) continue;
    const list = Array.isArray(row.member_roles)
      ? row.member_roles.map((r) => String(r?.role ?? "")).filter(Boolean)
      : [];
    roles[id] = { roles: list };
  }

  return { members, roles };
}

export async function GET(req: Request) {
  try {
    const cookieStore = cookies;
    const supabase = createRouteHandlerClient({ cookies: cookieStore });
    const {
      data: { session },
    } = await supabase.auth.getSession();

    if (!session) {
      return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
    }

    const url = new URL(req.url);
    const email = (url.searchParams.get("email") || "").trim();
    const id = (url.searchParams.get("id") || "").trim();
    const limitParam = url.searchParams.get("limit");
    const limit = limitParam ? Number(limitParam) : undefined;

    const admin = getServiceRoleClient();

    let query = admin
      .from("members")
      .select("id, first_name, last_name, email, phone, avatar_url, created_at, member_roles ( role )")
      .order("created_at", { ascending: false });

    if (email) query = query.ilike("email", email);
    if (id) query = query.eq("id", id);
    if (limit && Number.isFinite(limit)) query = query.limit(Math.max(1, Number(limit)));

    const { data, error } = await query;

    if (error) {
      return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
    }

    const { members, roles } = normalizeMembers(data ?? []);

    return NextResponse.json({ ok: true, members, roles });
  } catch (err: any) {
    const message = err?.message || "Unknown error";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
