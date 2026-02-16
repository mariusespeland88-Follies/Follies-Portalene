import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { requireApiMember } from "@/lib/authz/apiAuth";
import { sendPushToMembers } from "@/lib/push/memberPush";

export const runtime = "nodejs";

function createServiceClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("Mangler SUPABASE env");
  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

function normalizeText(v: unknown) {
  return String(v ?? "")
    .replace(/\s+/g, " ")
    .trim();
}

function previewFromBody(v: unknown) {
  const text = normalizeText(v);
  if (!text) return "Sendte et vedlegg";
  return text.length > 140 ? `${text.slice(0, 137)}...` : text;
}

function uniq(list: string[]) {
  return Array.from(new Set(list.filter(Boolean)));
}

export async function POST(req: Request) {
  try {
    const auth = await requireApiMember(req);
    if (!auth.ok) return auth.response;

    const body = await req.json().catch(() => ({}));
    const conversationId = String(
      body?.conversationId ?? body?.conversation_id ?? ""
    ).trim();
    const messageId = String(body?.messageId ?? body?.message_id ?? "").trim();

    if (!conversationId || !messageId) {
      return NextResponse.json(
        { error: "Mangler conversationId/messageId." },
        { status: 400 }
      );
    }

    const db = createServiceClient();

    const { data: msgRow, error: msgErr } = await db
      .from("conversation_messages")
      .select("id, conversation_id, sender_member_id, body")
      .eq("id", messageId)
      .maybeSingle();

    if (msgErr) return NextResponse.json({ error: msgErr.message }, { status: 500 });
    if (!msgRow) return NextResponse.json({ error: "Melding finnes ikke." }, { status: 404 });

    const dbConversationId = String((msgRow as any).conversation_id ?? "");
    const senderMemberId = String((msgRow as any).sender_member_id ?? "");
    if (dbConversationId !== conversationId) {
      return NextResponse.json(
        { error: "Melding matcher ikke conversationId." },
        { status: 400 }
      );
    }
    if (senderMemberId !== auth.memberId) {
      return NextResponse.json(
        { error: "Du kan kun trigge varsling for egne meldinger." },
        { status: 403 }
      );
    }

    const [{ data: convRow }, { data: senderRow }, { data: participantRows, error: partErr }] =
      await Promise.all([
        db
          .from("conversations")
          .select("id, type, title")
          .eq("id", conversationId)
          .maybeSingle(),
        db
          .from("members")
          .select("first_name, last_name")
          .eq("id", senderMemberId)
          .maybeSingle(),
        db
          .from("conversation_participants")
          .select("member_id")
          .eq("conversation_id", conversationId)
          .neq("member_id", senderMemberId),
      ]);

    if (partErr) return NextResponse.json({ error: partErr.message }, { status: 500 });

    const receiverIds = uniq(
      (participantRows || []).map((r: any) => String(r?.member_id ?? ""))
    );
    if (!receiverIds.length) {
      return NextResponse.json({ ok: true, sent: 0, failed: 0, tokens: 0 });
    }

    const senderName = normalizeText(
      `${(senderRow as any)?.first_name ?? ""} ${(senderRow as any)?.last_name ?? ""}`
    );
    const senderDisplay = senderName || "Follies";
    const conversationTitle = normalizeText((convRow as any)?.title ?? "");
    const isDm = String((convRow as any)?.type ?? "").toLowerCase() === "dm";

    const title = isDm
      ? senderDisplay
      : `${senderDisplay} i ${conversationTitle || "chat"}`;
    const bodyText = previewFromBody((msgRow as any)?.body ?? null);
    const result = await sendPushToMembers(db, {
      memberIds: receiverIds,
      title,
      body: bodyText,
      data: {
        type: "chat_message",
        conversationId,
        messageId,
      },
      channelId: "messages",
    });

    return NextResponse.json({
      ok: true,
      sent: result.sent,
      failed: result.failed,
      tokens: result.tokens,
    });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || "Ukjent feil" }, { status: 500 });
  }
}
