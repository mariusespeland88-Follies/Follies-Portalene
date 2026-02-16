import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { isExpoPushToken } from "@/lib/push/expo";

export const runtime = "nodejs";

function createServiceClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("Mangler SUPABASE env");
  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({}));
    const expoPushToken = String(
      body?.expoPushToken ?? body?.token ?? body?.expo_push_token ?? ""
    ).trim();

    if (!isExpoPushToken(expoPushToken)) {
      return NextResponse.json({ error: "Ugyldig push-token." }, { status: 400 });
    }

    const db = createServiceClient();
    const now = new Date().toISOString();
    const platform = String(body?.platform ?? "").trim().toLowerCase() || null;
    const appVersion =
      String(body?.appVersion ?? body?.app_version ?? "").trim() || null;
    const locale = String(body?.locale ?? "").trim() || null;

    const { error } = await db.from("audience_push_tokens").upsert(
      {
        expo_push_token: expoPushToken,
        platform,
        app_version: appVersion,
        locale,
        is_active: true,
        last_seen_at: now,
      },
      { onConflict: "expo_push_token" }
    );

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ ok: true });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || "Ukjent feil" }, { status: 500 });
  }
}
