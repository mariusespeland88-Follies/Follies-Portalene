import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { requireApiMember } from "@/lib/authz/apiAuth";

export const runtime = "nodejs";

const BUCKET = "chat-attachments";

export async function POST(req: Request) {
  try {
    const auth = await requireApiMember(req);
    if (!auth.ok) return auth.response;

    const body = await req.json().catch(() => ({}));
    const conversationId = String(body?.conversationId ?? body?.conversation_id ?? "").trim();
    const messageId = String(body?.messageId ?? body?.message_id ?? "").trim();
    const fileName = String(body?.fileName ?? body?.file_name ?? "").trim();
    const contentType = body?.contentType ?? body?.content_type ?? body?.mimeType ?? body?.mime_type ?? null;

    if (!conversationId || !messageId || !fileName) {
      return NextResponse.json({ error: "Mangler conversationId/messageId/fileName" }, { status: 400 });
    }

    const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY!;
    if (!url || !key) return NextResponse.json({ error: "Mangler SUPABASE env" }, { status: 500 });

    const sb = createClient(url, key);

    // Krev at innlogget medlem faktisk er deltaker i samtalen.
    const { data: p, error: pErr } = await sb
      .from("conversation_participants")
      .select("member_id")
      .eq("conversation_id", conversationId)
      .eq("member_id", auth.memberId)
      .maybeSingle();

    if (pErr) return NextResponse.json({ error: pErr.message }, { status: 500 });
    if (!p) return NextResponse.json({ error: "Ingen tilgang til samtalen." }, { status: 403 });

    const { data: msg, error: mErr } = await sb
      .from("conversation_messages")
      .select("id, conversation_id, sender_member_id")
      .eq("id", messageId)
      .maybeSingle();

    if (mErr) return NextResponse.json({ error: mErr.message }, { status: 500 });
    if (!msg) return NextResponse.json({ error: "Melding finnes ikke." }, { status: 404 });
    if (String((msg as any).conversation_id) !== conversationId) {
      return NextResponse.json({ error: "Melding hører ikke til samtalen." }, { status: 400 });
    }
    if (String((msg as any).sender_member_id) !== String(auth.memberId)) {
      return NextResponse.json({ error: "Kan kun laste opp vedlegg på egne meldinger." }, { status: 403 });
    }

    // Storage path
    const safe = String(fileName).replace(/[^\w.\-() ]+/g, "_");
    const storagePath = `conversations/${conversationId}/${messageId}/${Date.now()}-${safe}`;

    // Signed upload URL (Supabase Storage v2)
    const { data, error } = await sb.storage.from(BUCKET).createSignedUploadUrl(storagePath);

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    // data.signedUrl brukes til PUT/UPLOAD
    return NextResponse.json({ uploadUrl: data.signedUrl, storagePath, contentType: contentType ?? null });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || "Ukjent feil" }, { status: 500 });
  }
}
