import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { requireApiMember } from "@/lib/authz/apiAuth";

export const runtime = "nodejs";

export async function POST(req: Request) {
  try {
    const auth = await requireApiMember(req);
    if (!auth.ok) return auth.response;

    const body = await req.json().catch(() => ({}));
    const messageId = String(body?.messageId ?? body?.message_id ?? "").trim();
    const storagePath = String(body?.storagePath ?? body?.storage_path ?? "").trim();
    const fileName = String(body?.fileName ?? body?.file_name ?? "").trim();
    const mimeType = body?.mimeType ?? body?.mime_type ?? null;
    const fileSizeRaw = body?.fileSize ?? body?.file_size;
    const imageWidthRaw = body?.imageWidth ?? body?.image_width ?? body?.width;
    const imageHeightRaw = body?.imageHeight ?? body?.image_height ?? body?.height;
    const fileSize = Number(fileSizeRaw);
    const imageWidth = Number(imageWidthRaw);
    const imageHeight = Number(imageHeightRaw);

    if (!messageId || !storagePath || !fileName) {
      return NextResponse.json({ error: "Mangler messageId/storagePath/fileName" }, { status: 400 });
    }

    const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY!;
    if (!url || !key) return NextResponse.json({ error: "Mangler SUPABASE env" }, { status: 500 });

    const sb = createClient(url, key);

    const { data: msg, error: mErr } = await sb
      .from("conversation_messages")
      .select("id, conversation_id, sender_member_id")
      .eq("id", messageId)
      .maybeSingle();

    if (mErr) return NextResponse.json({ error: mErr.message }, { status: 500 });
    if (!msg) return NextResponse.json({ error: "Melding finnes ikke." }, { status: 404 });

    if (String((msg as any).sender_member_id) !== String(auth.memberId)) {
      return NextResponse.json({ error: "Kan kun registrere vedlegg på egne meldinger." }, { status: 403 });
    }

    const { data: inserted, error } = await sb
      .from("conversation_attachments")
      .insert({
      message_id: String(messageId),
      storage_path: String(storagePath),
      file_name: String(fileName),
      mime_type: mimeType ?? null,
      file_size: Number.isFinite(fileSize) ? fileSize : null,
      image_width: Number.isFinite(imageWidth) ? imageWidth : null,
      image_height: Number.isFinite(imageHeight) ? imageHeight : null,
      })
      .select("id")
      .single();

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    const attachmentId = String((inserted as any)?.id ?? "");
    return NextResponse.json({ ok: true, attachment_id: attachmentId });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || "Ukjent feil" }, { status: 500 });
  }
}
