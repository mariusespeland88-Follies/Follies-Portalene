import { NextResponse } from "next/server";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

export const runtime = "nodejs";

const BUCKET = "activity-files";

type ActivityFile = {
  id: string;
  path: string;
};

async function readManifest(supabase: SupabaseClient, activityId: string) {
  const { data, error } = await supabase.storage.from(BUCKET).download(`${activityId}/manifest.json`);
  if (error) return [] as ActivityFile[];
  const text = await data.text();
  try { return JSON.parse(text) as ActivityFile[]; } catch { return [] as ActivityFile[]; }
}

export async function GET(req: Request, { params }: { params: { fileId: string } }) {
  try {
    const { searchParams } = new URL(req.url);
    const activityId = searchParams.get("activityId");
    if (!activityId) return NextResponse.json({ error: "Mangler activityId" }, { status: 400 });

    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );

    const manifest = await readManifest(supabase, activityId);
    const item = manifest.find((f) => f.id === params.fileId);
    if (!item) return NextResponse.json({ error: "Fil ikke funnet" }, { status: 404 });

    const { data, error } = await supabase.storage.from(BUCKET).createSignedUrl(item.path, 60 * 60);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    return NextResponse.json({ url: data.signedUrl });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || "Ukjent feil" }, { status: 500 });
  }
}
