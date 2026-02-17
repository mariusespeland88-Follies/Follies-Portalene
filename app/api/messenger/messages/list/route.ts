import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { requireApiMember } from "@/lib/authz/apiAuth";

export const runtime = "nodejs";

function toPositiveInt(value: unknown, fallback: number, min: number, max: number) {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(min, Math.min(max, Math.trunc(n)));
}

export async function POST(req: Request) {
  try {
    const auth = await requireApiMember(req);
    if (!auth.ok) return auth.response;

    const body = await req.json().catch(() => ({}));
    const conversationId = String(
      body?.conversationId ?? body?.conversation_id ?? ""
    ).trim();
    const limit = toPositiveInt(body?.limit, 220, 1, 500);

    if (!conversationId) {
      return NextResponse.json(
        { error: "Mangler conversationId." },
        { status: 400 }
      );
    }

    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!url || !key) {
      return NextResponse.json(
        { error: "Mangler SUPABASE env." },
        { status: 500 }
      );
    }

    const db = createClient(url, key, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    const { data: participant, error: participantErr } = await db
      .from("conversation_participants")
      .select("conversation_id")
      .eq("conversation_id", conversationId)
      .eq("member_id", auth.memberId)
      .maybeSingle();

    if (participantErr) {
      return NextResponse.json({ error: participantErr.message }, { status: 500 });
    }
    if (!participant) {
      return NextResponse.json(
        { error: "Ingen tilgang til samtalen." },
        { status: 403 }
      );
    }

    const { data: rows, error: rowsErr } = await db
      .from("conversation_messages")
      .select("id, conversation_id, sender_member_id, body, created_at")
      .eq("conversation_id", conversationId)
      .order("created_at", { ascending: false })
      .limit(limit);

    if (rowsErr) {
      return NextResponse.json({ error: rowsErr.message }, { status: 500 });
    }

    const items = (rows || [])
      .map((row: any) => ({
        id: String(row?.id ?? ""),
        conversation_id: String(row?.conversation_id ?? ""),
        sender_member_id: String(row?.sender_member_id ?? ""),
        body: row?.body != null ? String(row.body) : null,
        created_at: String(row?.created_at ?? ""),
      }))
      // chat-UI forventer eldste -> nyeste
      .reverse();

    return NextResponse.json({ ok: true, items });
  } catch (e: any) {
    return NextResponse.json(
      { error: e?.message || "Ukjent feil" },
      { status: 500 }
    );
  }
}

