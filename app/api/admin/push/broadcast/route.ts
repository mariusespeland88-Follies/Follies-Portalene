import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { requireAdmin } from "@/lib/authz/apiAuth";
import { sendExpoPush } from "@/lib/push/expo";

export const runtime = "nodejs";

function createServiceClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("Mangler SUPABASE env");
  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

function uniq(values: string[]) {
  return Array.from(new Set(values.filter(Boolean)));
}

export async function POST(req: Request) {
  try {
    const auth = await requireAdmin(req);
    if (!auth.ok) return auth.response;

    const body = await req.json().catch(() => ({}));
    const title = String(body?.title ?? "").trim();
    const message = String(body?.message ?? body?.body ?? "").trim();
    const target = String(body?.target ?? "all").trim().toLowerCase();
    const deepLink = String(body?.deepLink ?? body?.deep_link ?? "").trim() || null;

    if (!title || !message) {
      return NextResponse.json(
        { error: "Mangler title/message." },
        { status: 400 }
      );
    }
    if (!["all", "members", "audience"].includes(target)) {
      return NextResponse.json({ error: "Ugyldig target." }, { status: 400 });
    }

    const db = createServiceClient();

    let memberTokens: string[] = [];
    let audienceTokens: string[] = [];

    if (target === "all" || target === "members") {
      const { data, error } = await db
        .from("member_push_tokens")
        .select("expo_push_token")
        .eq("is_active", true);
      if (error) return NextResponse.json({ error: error.message }, { status: 500 });
      memberTokens = uniq((data || []).map((r: any) => String(r?.expo_push_token ?? "").trim()));
    }

    if (target === "all" || target === "audience") {
      const { data, error } = await db
        .from("audience_push_tokens")
        .select("expo_push_token")
        .eq("is_active", true);
      if (error) return NextResponse.json({ error: error.message }, { status: 500 });
      audienceTokens = uniq((data || []).map((r: any) => String(r?.expo_push_token ?? "").trim()));
    }

    const tokens = uniq([...memberTokens, ...audienceTokens]);
    if (!tokens.length) {
      return NextResponse.json({ ok: true, sent: 0, failed: 0, tokens: 0 });
    }

    const result = await sendExpoPush(
      tokens.map((to) => ({
        to,
        title,
        body: message,
        channelId: "messages",
        data: {
          type: "admin_broadcast",
          deepLink,
          target,
          sentAt: new Date().toISOString(),
        },
      }))
    );

    if (result.deadTokens.length) {
      await Promise.all([
        db
          .from("member_push_tokens")
          .update({ is_active: false })
          .in("expo_push_token", result.deadTokens),
        db
          .from("audience_push_tokens")
          .update({ is_active: false })
          .in("expo_push_token", result.deadTokens),
      ]);
    }

    return NextResponse.json({
      ok: true,
      sent: result.sent,
      failed: result.failed,
      tokens: tokens.length,
    });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || "Ukjent feil" }, { status: 500 });
  }
}
