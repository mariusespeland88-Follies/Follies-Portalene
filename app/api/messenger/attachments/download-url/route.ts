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
    const storagePath = String(body?.storagePath ?? body?.storage_path ?? "").trim();
    if (!storagePath) return NextResponse.json({ error: "Mangler storagePath" }, { status: 400 });

    const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY!;
    if (!url || !key) return NextResponse.json({ error: "Mangler SUPABASE env" }, { status: 500 });

    const sb = createClient(url, key);

    const { data: att, error: attErr } = await sb
      .from("conversation_attachments")
      .select("message_id")
      .eq("storage_path", storagePath)
      .maybeSingle();

    if (attErr) return NextResponse.json({ error: attErr.message }, { status: 500 });
    if (!att) return NextResponse.json({ error: "Vedlegg finnes ikke." }, { status: 404 });

    const { data: msg, error: mErr } = await sb
      .from("conversation_messages")
      .select("conversation_id")
      .eq("id", (att as any).message_id)
      .maybeSingle();

    if (mErr) return NextResponse.json({ error: mErr.message }, { status: 500 });
    if (!msg) return NextResponse.json({ error: "Melding finnes ikke." }, { status: 404 });

    const { data: part, error: pErr } = await sb
      .from("conversation_participants")
      .select("member_id")
      .eq("conversation_id", (msg as any).conversation_id)
      .eq("member_id", auth.memberId)
      .maybeSingle();

    if (pErr) return NextResponse.json({ error: pErr.message }, { status: 500 });
    if (!part) return NextResponse.json({ error: "Ingen tilgang til vedlegget." }, { status: 403 });

    // 60 sek er fint for portal-preview
    const { data, error } = await sb.storage.from(BUCKET).createSignedUrl(String(storagePath), 60);

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    return NextResponse.json({ signedUrl: data.signedUrl, signed_url: data.signedUrl, url: data.signedUrl });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || "Ukjent feil" }, { status: 500 });
  }
}
