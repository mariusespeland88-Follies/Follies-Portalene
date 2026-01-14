import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const runtime = "nodejs";

const BUCKET = "chat-attachments";

export async function POST(req: Request) {
  try {
    const { conversationId, messageId, fileName, contentType } = await req.json();

    if (!conversationId || !messageId || !fileName) {
      return NextResponse.json({ error: "Mangler conversationId/messageId/fileName" }, { status: 400 });
    }

    const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY!;
    if (!url || !key) return NextResponse.json({ error: "Mangler SUPABASE env" }, { status: 500 });

    const sb = createClient(url, key);

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
