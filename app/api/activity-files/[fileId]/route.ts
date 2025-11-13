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

export async function PATCH(req: Request, { params }: { params: { fileId: string } }) {
  try {
    const { searchParams } = new URL(req.url);
    const activityId = searchParams.get("activityId");
    if (!activityId) return NextResponse.json({ error: "Mangler activityId" }, { status: 400 });

    const body = await req.json().catch(() => ({}));
    const { name, category } = body as Partial<Pick<ActivityFile, "name" | "category">>;

    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );

    const manifest = await readManifest(supabase, activityId);
    const idx = manifest.findIndex((f) => f.id === params.fileId);
    if (idx === -1) return NextResponse.json({ error: "Fil ikke funnet" }, { status: 404 });

    if (typeof name === "string" && name.trim()) manifest[idx].name = name.trim();
    if (category === "image" || category === "text" || category === "audio" || category === "other") {
      manifest[idx].category = category;
    }

    await writeManifest(supabase, activityId, manifest);
    return NextResponse.json({ ok: true });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || "Ukjent feil" }, { status: 500 });
  }
}

export async function DELETE(req: Request, { params }: { params: { fileId: string } }) {
  try {
    const { searchParams } = new URL(req.url);
    const activityId = searchParams.get("activityId");
    if (!activityId) return NextResponse.json({ error: "Mangler activityId" }, { status: 400 });

    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );

    const manifest = await readManifest(supabase, activityId);
    const idx = manifest.findIndex((f) => f.id === params.fileId);
    if (idx === -1) return NextResponse.json({ error: "Fil ikke funnet" }, { status: 404 });

    const path = manifest[idx].path;

    const { error: rmErr } = await supabase.storage.from(BUCKET).remove([path]);
    if (rmErr) return NextResponse.json({ error: rmErr.message }, { status: 500 });

    manifest.splice(idx, 1);
    await writeManifest(supabase, activityId, manifest);
    return NextResponse.json({ ok: true });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || "Ukjent feil" }, { status: 500 });
  }
}
