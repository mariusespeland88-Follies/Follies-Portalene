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
  const { data, error } = await supabase.storage.from(BUCKET).download(`${activityId}/manifest.json`);
  if (error) return [];
  const text = await data.text();
  try { return JSON.parse(text) as ActivityFile[]; } catch { return []; }
}

async function writeManifest(supabase: SupabaseClient, activityId: string, items: ActivityFile[]) {
  const blob = new Blob([JSON.stringify(items, null, 2)], { type: "application/json" });
  await supabase.storage.from(BUCKET).upload(`${activityId}/manifest.json`, blob, { upsert: true, contentType: "application/json" });
}

function safeName(name: string) {
  return name.replace(/[^a-zA-Z0-9._-]+/g, "-").slice(0, 180);
}

export async function POST(req: Request) {
  try {
    const form = await req.formData();
    const activityId = String(form.get("activityId") || "");
    const category = String(form.get("category") || "other") as ActivityFile["category"];
    if (!activityId) return NextResponse.json({ error: "Mangler activityId" }, { status: 400 });

    const files = form.getAll("file") as File[];
    if (!files || files.length === 0) return NextResponse.json({ error: "Ingen filer" }, { status: 400 });

    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );

    await ensureBucket(supabase);
    const manifest = await readManifest(supabase, activityId);

    const created: ActivityFile[] = [];
    for (const file of files) {
      const id = crypto.randomUUID();
      const clean = safeName(file.name || "fil");
      const path = `${activityId}/${id}-${clean}`;

      // last opp
      const { error: upErr } = await supabase.storage.from(BUCKET).upload(path, file, {
        upsert: false,
        contentType: file.type || "application/octet-stream",
      });
      if (upErr) return NextResponse.json({ error: upErr.message }, { status: 500 });

      const item: ActivityFile = {
        id,
        activityId,
        name: file.name || "fil",
        category,
        mime: file.type || "application/octet-stream",
        size: file.size || 0,
        path,
        uploadedAt: new Date().toISOString(),
      };
      manifest.push(item);
      created.push(item);
    }

    await writeManifest(supabase, activityId, manifest);
    return NextResponse.json({ files: created });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || "Ukjent feil" }, { status: 500 });
  }
}
