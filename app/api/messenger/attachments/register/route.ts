import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const runtime = "nodejs";

export async function POST(req: Request) {
  try {
    const { messageId, storagePath, fileName, mimeType, fileSize, imageWidth, imageHeight } =
      await req.json();

    if (!messageId || !storagePath || !fileName) {
      return NextResponse.json({ error: "Mangler messageId/storagePath/fileName" }, { status: 400 });
    }

    const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY!;
    if (!url || !key) return NextResponse.json({ error: "Mangler SUPABASE env" }, { status: 500 });

    const sb = createClient(url, key);

    const { error } = await sb.from("conversation_attachments").insert({
      message_id: String(messageId),
      storage_path: String(storagePath),
      file_name: String(fileName),
      mime_type: mimeType ?? null,
      file_size: typeof fileSize === "number" ? fileSize : null,
      image_width: typeof imageWidth === "number" ? imageWidth : null,
      image_height: typeof imageHeight === "number" ? imageHeight : null,
    });

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    return NextResponse.json({ ok: true });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || "Ukjent feil" }, { status: 500 });
  }
}
