import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { requireApiMember } from "@/lib/authz/apiAuth";

export const runtime = "nodejs";

function displayName(first: unknown, last: unknown, email: unknown) {
  const fn = String(first ?? "").trim();
  const ln = String(last ?? "").trim();
  const full = `${fn} ${ln}`.trim();
  if (full) return full;
  return String(email ?? "").trim() || "Ukjent";
}

export async function POST(req: Request) {
  try {
    const auth = await requireApiMember(req);
    if (!auth.ok) return auth.response;

    const body = await req.json().catch(() => ({}));
    const q = String(body?.q ?? "").trim();
    const limitRaw = Number(body?.limit ?? 30);
    const limit = Math.max(1, Math.min(80, Number.isFinite(limitRaw) ? limitRaw : 30));

    if (!q) return NextResponse.json({ ok: true, items: [] });

    const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY!;
    if (!url || !key) {
      return NextResponse.json({ error: "Mangler SUPABASE env" }, { status: 500 });
    }
    const db = createClient(url, key);

    const like = `%${q.replace(/%/g, "")}%`;
    const { data, error } = await db
      .from("members")
      .select("id, first_name, last_name, email, avatar_url, archived")
      .eq("archived", false)
      .neq("id", auth.memberId)
      .or(`first_name.ilike.${like},last_name.ilike.${like},email.ilike.${like}`)
      .limit(limit);

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    const items = (data || []).map((m: any) => ({
      id: String(m.id),
      name: displayName(m.first_name, m.last_name, m.email),
      first_name: m.first_name ?? null,
      last_name: m.last_name ?? null,
      email: m.email ?? null,
      avatar_url: m.avatar_url ?? null,
    }));

    return NextResponse.json({ ok: true, items });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || "Ukjent feil" }, { status: 500 });
  }
}
