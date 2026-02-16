import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { requireApiMember } from "@/lib/authz/apiAuth";

export const runtime = "nodejs";

export async function POST(req: Request) {
  try {
    const auth = await requireApiMember(req);
    if (!auth.ok) return auth.response;

    const body = await req.json().catch(() => ({}));
    const conversationId = String(body?.conversationId ?? body?.conversation_id ?? "").trim();
    const limitRaw = Number(body?.limit ?? 300);
    const limit = Math.max(1, Math.min(1000, Number.isFinite(limitRaw) ? limitRaw : 300));

    if (!conversationId) {
      return NextResponse.json({ error: "Mangler conversationId" }, { status: 400 });
    }

    const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY!;
    if (!url || !key) return NextResponse.json({ error: "Mangler SUPABASE env" }, { status: 500 });
    const db = createClient(url, key);

    const { data: part, error: pErr } = await db
      .from("conversation_participants")
      .select("member_id")
      .eq("conversation_id", conversationId)
      .eq("member_id", auth.memberId)
      .maybeSingle();

    if (pErr) return NextResponse.json({ error: pErr.message }, { status: 500 });
    if (!part) return NextResponse.json({ error: "Ingen tilgang til samtalen." }, { status: 403 });

    const { data: msgRows, error: msgErr } = await db
      .from("conversation_messages")
      .select("id, sender_member_id, created_at")
      .eq("conversation_id", conversationId)
      .order("created_at", { ascending: false })
      .limit(limit);

    if (msgErr) return NextResponse.json({ error: msgErr.message }, { status: 500 });

    const messageIds = (msgRows || []).map((m: any) => String(m.id)).filter(Boolean);
    if (!messageIds.length) return NextResponse.json({ ok: true, items: [] });

    const byMessage = new Map<string, { sender_member_id: string | null; message_created_at: string | null }>();
    for (const m of msgRows || []) {
      byMessage.set(String((m as any).id), {
        sender_member_id: (m as any).sender_member_id ? String((m as any).sender_member_id) : null,
        message_created_at: (m as any).created_at ? String((m as any).created_at) : null,
      });
    }

    const { data: attRows, error: attErr } = await db
      .from("conversation_attachments")
      .select("id, message_id, storage_path, file_name, mime_type, file_size, image_width, image_height, created_at")
      .in("message_id", messageIds)
      .order("created_at", { ascending: false });

    if (attErr) return NextResponse.json({ error: attErr.message }, { status: 500 });

    const items = (attRows || []).map((a: any) => {
      const mid = String(a.message_id || "");
      const msg = byMessage.get(mid) || { sender_member_id: null, message_created_at: null };
      return {
        id: String(a.id || ""),
        message_id: mid,
        conversation_id: conversationId,
        sender_member_id: msg.sender_member_id,
        message_created_at: msg.message_created_at,
        storage_path: String(a.storage_path || ""),
        file_name: String(a.file_name || ""),
        mime_type: a.mime_type ?? null,
        file_size: a.file_size ?? null,
        image_width: a.image_width ?? null,
        image_height: a.image_height ?? null,
        created_at: a.created_at ?? null,
      };
    });

    return NextResponse.json({ ok: true, items });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || "Ukjent feil" }, { status: 500 });
  }
}
