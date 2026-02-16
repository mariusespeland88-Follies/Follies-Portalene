import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { requireLeader } from "@/lib/authz/apiAuth";

export const runtime = "nodejs";

function hasLeaderRole(roles: string[]) {
  const r = roles.map((x) => String(x).toLowerCase());
  return r.includes("leader") || r.includes("leder") || r.includes("staff") || r.includes("admin");
}

export async function POST(req: Request) {
  try {
    const auth = await requireLeader(req);
    if (!auth.ok) return auth.response;

    const body = await req.json().catch(() => ({}));
    const meMemberId = String(auth.memberId ?? "").trim();
    if (!meMemberId) {
      return NextResponse.json({ error: "Fant ikke medlem for innlogget bruker." }, { status: 403 });
    }
    const title = body?.title;
    const memberIds = body?.memberIds ?? body?.member_ids;
    const ids: string[] = Array.isArray(memberIds) ? memberIds.map(String) : [];

    if (!meMemberId) return NextResponse.json({ error: "Mangler meMemberId" }, { status: 400 });
    if (!title || !String(title).trim()) return NextResponse.json({ error: "Mangler tittel" }, { status: 400 });
    if (!ids.length) return NextResponse.json({ error: "Mangler memberIds" }, { status: 400 });

    const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY!;
    if (!url || !key) return NextResponse.json({ error: "Mangler SUPABASE env" }, { status: 500 });

    const sb = createClient(url, key);

    // Sjekk lederrolle via member_roles (som usePermissions også bruker)
    const { data: rows, error: rErr } = await sb
      .from("members")
      .select("id, member_roles(role)")
      .eq("id", String(meMemberId))
      .maybeSingle();

    if (rErr) return NextResponse.json({ error: rErr.message }, { status: 500 });

    const roles = Array.isArray((rows as any)?.member_roles)
      ? (rows as any).member_roles.map((x: any) => String(x.role))
      : [];

    if (!hasLeaderRole(roles)) {
      return NextResponse.json({ error: "Kun ledere kan opprette grupper." }, { status: 403 });
    }

    const { data: created, error: cErr } = await sb
      .from("conversations")
      .insert({
        type: "group",
        title: String(title).trim(),
        activity_id: null,
        created_by: meMemberId,
      })
      .select("id")
      .single();

    if (cErr) return NextResponse.json({ error: cErr.message }, { status: 500 });

    const conversationId = String((created as any).id);
    const unique = Array.from(new Set([String(meMemberId), ...ids]));

    const payload = unique.map((mid) => ({
      conversation_id: conversationId,
      member_id: mid,
      role: mid === String(meMemberId) ? "leader" : "member",
    }));

    const { error: pErr } = await sb.from("conversation_participants").insert(payload);
    if (pErr) return NextResponse.json({ error: pErr.message }, { status: 500 });

    return NextResponse.json({ conversationId, conversation_id: conversationId });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || "Ukjent feil" }, { status: 500 });
  }
}
