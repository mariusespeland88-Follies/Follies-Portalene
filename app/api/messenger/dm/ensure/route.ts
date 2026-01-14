import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const runtime = "nodejs";

export async function POST(req: Request) {
  try {
    const { meMemberId, otherMemberId } = await req.json();

    if (!meMemberId || !otherMemberId) {
      return NextResponse.json({ error: "Mangler meMemberId/otherMemberId" }, { status: 400 });
    }
    if (String(meMemberId) === String(otherMemberId)) {
      return NextResponse.json({ error: "Kan ikke starte DM med deg selv" }, { status: 400 });
    }

    const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY!;
    if (!url || !key) {
      return NextResponse.json({ error: "Mangler SUPABASE env" }, { status: 500 });
    }

    const sb = createClient(url, key);

    // Finn eksisterende DM mellom disse to
    const { data: dmCandidates, error: dmErr } = await sb
      .from("conversations")
      .select("id, type")
      .eq("type", "dm");

    if (dmErr) return NextResponse.json({ error: dmErr.message }, { status: 500 });

    const dmIds = (dmCandidates || []).map((c: any) => String(c.id));
    if (dmIds.length) {
      const { data: parts, error: pErr } = await sb
        .from("conversation_participants")
        .select("conversation_id, member_id")
        .in("conversation_id", dmIds)
        .in("member_id", [String(meMemberId), String(otherMemberId)]);

      if (pErr) return NextResponse.json({ error: pErr.message }, { status: 500 });

      const map: Record<string, Set<string>> = {};
      for (const r of parts || []) {
        const cid = String((r as any).conversation_id);
        if (!map[cid]) map[cid] = new Set();
        map[cid].add(String((r as any).member_id));
      }

      const hit = Object.entries(map).find(([, set]) => set.has(String(meMemberId)) && set.has(String(otherMemberId)));
      if (hit) {
        return NextResponse.json({ conversationId: hit[0] });
      }
    }

    // Opprett DM
    const { data: created, error: cErr } = await sb
      .from("conversations")
      .insert({
        type: "dm",
        title: null,
        activity_id: null,
        created_by: meMemberId,
      })
      .select("id")
      .single();

    if (cErr) return NextResponse.json({ error: cErr.message }, { status: 500 });

    const conversationId = String((created as any).id);

    // Sett participants (begge)
    const { error: insErr } = await sb.from("conversation_participants").insert([
      { conversation_id: conversationId, member_id: meMemberId, role: "member" },
      { conversation_id: conversationId, member_id: otherMemberId, role: "member" },
    ]);

    if (insErr) return NextResponse.json({ error: insErr.message }, { status: 500 });

    return NextResponse.json({ conversationId });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || "Ukjent feil" }, { status: 500 });
  }
}
