import { NextResponse } from "next/server";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

export const runtime = "nodejs";

const BUCKET = "activity-files";

type ActivityFile = {
  id: string;
  activityId: string;
  name: string;
  category: "image" | "text" | "audio" | "other";
  mime: string;
  size: number;
  path: string;
  uploadedAt: string;
};

async function ensureBucket(supabase: SupabaseClient) {
  const { data } = await supabase.storage.listBuckets();
  const exists = (data || []).some((b) => b.name === BUCKET);
  if (!exists) {
    await supabase.storage.createBucket(BUCKET, { public: false, fileSizeLimit: null });
  }
}

async function readManifest(supabase: SupabaseClient, activityId: string): Promise<ActivityFile[]> {
  const path = `${activityId}/manifest.json`;
  const { data, error } = await supabase.storage.from(BUCKET).download(path);
  if (error) return [];
  const text = await data.text();
  try {
    const parsed = JSON.parse(text);
    if (Array.isArray(parsed)) return parsed as ActivityFile[];
    return [];
  } catch {
    return [];
  }
}

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const activityId = searchParams.get("activityId");
    if (!activityId) return NextResponse.json({ error: "Mangler activityId" }, { status: 400 });

    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );

    await ensureBucket(supabase);
    const files = await readManifest(supabase, activityId);
    return NextResponse.json({ files });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || "Ukjent feil" }, { status: 500 });
  }
}
