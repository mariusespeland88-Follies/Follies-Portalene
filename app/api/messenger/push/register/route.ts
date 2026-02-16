import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { requireApiMember } from "@/lib/authz/apiAuth";

export const runtime = "nodejs";

const TOKEN_RE = /^(ExponentPushToken|ExpoPushToken)\[[^\]]+\]$/;

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
    const auth = await requireApiMember(req);
    if (!auth.ok) return auth.response;

    const body = await req.json().catch(() => ({}));
    const expoPushToken = String(
      body?.expoPushToken ?? body?.token ?? body?.expo_push_token ?? ""
    ).trim();

    if (!TOKEN_RE.test(expoPushToken)) {
      return NextResponse.json({ error: "Ugyldig push-token." }, { status: 400 });
    }

    const platformRaw = String(body?.platform ?? "").trim().toLowerCase();
    const platform = platformRaw || null;
    const deviceId = String(body?.deviceId ?? body?.device_id ?? "").trim() || null;
    const appVersion =
      String(body?.appVersion ?? body?.app_version ?? "").trim() || null;
    const locale = String(body?.locale ?? "").trim() || null;
    const now = new Date().toISOString();

    const db = createServiceClient();

    // Hvis token tidligere har vært koblet til en annen member, deaktiver den koblingen.
    await db
      .from("member_push_tokens")
      .update({ is_active: false, last_seen_at: now })
      .eq("expo_push_token", expoPushToken)
      .neq("member_id", auth.memberId);

    const { error } = await db.from("member_push_tokens").upsert(
      {
        member_id: auth.memberId,
        expo_push_token: expoPushToken,
        platform,
        device_id: deviceId,
        app_version: appVersion,
        locale,
        is_active: true,
        last_seen_at: now,
      },
      { onConflict: "member_id,expo_push_token" }
    );

    if (error) {
      if (String((error as any)?.code ?? "") === "42P01") {
        return NextResponse.json(
          { error: "Tabellen member_push_tokens finnes ikke enda." },
          { status: 500 }
        );
      }
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ ok: true });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || "Ukjent feil" }, { status: 500 });
  }
}
