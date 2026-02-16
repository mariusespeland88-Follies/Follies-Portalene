import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { requireAdmin } from "@/lib/authz/apiAuth";

export const runtime = "nodejs";

function createServiceClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("Mangler SUPABASE env");
  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

async function countTable(
  db: ReturnType<typeof createServiceClient>,
  table: string
): Promise<number> {
  const { count, error } = await db
    .from(table)
    .select("*", { count: "exact", head: true });
  if (error) throw error;
  return Number(count ?? 0);
}

export async function GET(req: Request) {
  try {
    const auth = await requireAdmin(req);
    if (!auth.ok) return auth.response;

    const db = createServiceClient();

    const now = Date.now();
    const weekAgoIso = new Date(now - 7 * 24 * 60 * 60 * 1000).toISOString();
    const plus14Iso = new Date(now + 14 * 24 * 60 * 60 * 1000).toISOString();

    const [
      membersTotal,
      activitiesTotal,
      enrollmentsTotal,
      conversationsTotal,
      memberPushActive,
      audiencePushActive,
      leadersRows,
      adminsRows,
      sessionsUpcomingRows,
      membersWeekRows,
      messagesWeekRows,
    ] = await Promise.all([
      countTable(db, "members"),
      countTable(db, "activities"),
      countTable(db, "enrollments"),
      countTable(db, "conversations"),
      db
        .from("member_push_tokens")
        .select("*", { count: "exact", head: true })
        .eq("is_active", true),
      db
        .from("audience_push_tokens")
        .select("*", { count: "exact", head: true })
        .eq("is_active", true),
      db.from("member_roles").select("member_id").eq("role", "leader"),
      db.from("member_roles").select("member_id").eq("role", "admin"),
      db
        .from("activity_sessions")
        .select("id")
        .gte("start_at", new Date(now).toISOString())
        .lt("start_at", plus14Iso),
      db.from("members").select("id").gte("created_at", weekAgoIso),
      db
        .from("conversation_messages")
        .select("id")
        .gte("created_at", weekAgoIso),
    ]);

    if (memberPushActive.error) throw memberPushActive.error;
    if (audiencePushActive.error) throw audiencePushActive.error;
    if (leadersRows.error) throw leadersRows.error;
    if (adminsRows.error) throw adminsRows.error;
    if (sessionsUpcomingRows.error) throw sessionsUpcomingRows.error;
    if (membersWeekRows.error) throw membersWeekRows.error;
    if (messagesWeekRows.error) throw messagesWeekRows.error;

    const leadersTotal = new Set(
      (leadersRows.data || []).map((r: any) => String(r?.member_id ?? ""))
    ).size;
    const adminsTotal = new Set(
      (adminsRows.data || []).map((r: any) => String(r?.member_id ?? ""))
    ).size;

    return NextResponse.json({
      ok: true,
      stats: {
        membersTotal,
        leadersTotal,
        adminsTotal,
        activitiesTotal,
        enrollmentsTotal,
        conversationsTotal,
        sessionsUpcoming14d: Number((sessionsUpcomingRows.data || []).length),
        membersAdded7d: Number((membersWeekRows.data || []).length),
        messages7d: Number((messagesWeekRows.data || []).length),
        memberPushActive: Number(memberPushActive.count ?? 0),
        audiencePushActive: Number(audiencePushActive.count ?? 0),
      },
    });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || "Ukjent feil" }, { status: 500 });
  }
}
