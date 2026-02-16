import type { SupabaseClient } from "@supabase/supabase-js";
import { sendExpoPush, type ExpoPushPayload } from "@/lib/push/expo";

function uniq(values: string[]) {
  return Array.from(new Set(values.filter(Boolean)));
}

export async function getActiveMemberTokens(
  db: SupabaseClient,
  memberIds: string[]
): Promise<string[]> {
  const ids = uniq(memberIds.map((x) => String(x ?? "").trim()));
  if (!ids.length) return [];

  const { data, error } = await db
    .from("member_push_tokens")
    .select("expo_push_token")
    .in("member_id", ids)
    .eq("is_active", true);

  if (error) throw error;

  return uniq((data || []).map((r: any) => String(r?.expo_push_token ?? "").trim()));
}

export async function deactivateMemberTokens(
  db: SupabaseClient,
  tokens: string[]
): Promise<void> {
  const safe = uniq(tokens.map((x) => String(x ?? "").trim()));
  if (!safe.length) return;

  await db
    .from("member_push_tokens")
    .update({ is_active: false })
    .in("expo_push_token", safe);
}

export async function sendPushToMembers(
  db: SupabaseClient,
  opts: {
    memberIds: string[];
    title: string;
    body: string;
    data?: Record<string, any>;
    channelId?: string;
  }
) {
  const tokens = await getActiveMemberTokens(db, opts.memberIds);
  if (!tokens.length) {
    return { sent: 0, failed: 0, tokens: 0, deadTokens: [] as string[] };
  }

  const payloads: ExpoPushPayload[] = tokens.map((token) => ({
    to: token,
    title: String(opts.title ?? "").trim(),
    body: String(opts.body ?? "").trim(),
    data: opts.data ?? {},
    channelId: opts.channelId ?? "messages",
    sound: "default",
    priority: "high",
  }));

  const result = await sendExpoPush(payloads);
  if (result.deadTokens.length) {
    await deactivateMemberTokens(db, result.deadTokens);
  }

  return {
    sent: result.sent,
    failed: result.failed,
    tokens: tokens.length,
    deadTokens: result.deadTokens,
  };
}
