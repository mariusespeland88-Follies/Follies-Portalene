import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const runtime = "nodejs";
const BUCKET = "profile-photos";

export async function POST(req: Request, { params }: { params: { id: string } }) {
  const id = params?.id;
  if (!id) return NextResponse.json({ error: "Mangler id" }, { status: 400 });

  try {
    const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);

    // bucket (public)
    const { data: buckets } = await supabase.storage.listBuckets();
    const exists = (buckets || []).some((b) => b.name === BUCKET);
    if (!exists) {
      await supabase.storage.createBucket(BUCKET, { public: true });
    }

    const form = await req.formData();
    const file = form.get("file") as File | null;
    if (!file) return NextResponse.json({ error: "Mangler fil" }, { status: 400 });

    const clean = (file.name || "avatar").replace(/[^a-zA-Z0-9._-]+/g, "-").slice(0, 140);
    const path = `${id}/${crypto.randomUUID()}-${clean}`;

    const { error: upErr } = await supabase.storage.from(BUCKET).upload(path, file, {
      upsert: false,
      contentType: file.type || "image/*",
    });
    if (upErr) return NextResponse.json({ error: upErr.message }, { status: 500 });

    // hent public URL
    const { data: pub } = await supabase.storage.from(BUCKET).getPublicUrl(path);

    // lagre på member.avatar_url
    await supabase.from("member").update({ avatar_url: pub.publicUrl }).eq("id", id);

    return NextResponse.json({ url: pub.publicUrl, path });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || "Ukjent feil" }, { status: 500 });
  }
}
