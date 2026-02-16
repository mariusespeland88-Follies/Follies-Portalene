import { NextResponse } from "next/server";
import { requireLeader } from "@/lib/authz/apiAuth";
import { getSupabaseServiceRoleClient } from "@/lib/supabase/server";

export async function GET(req: Request) {
  const auth = await requireLeader(req);
  if (!auth.ok) return auth.response;

  const db = getSupabaseServiceRoleClient();
  if (!db) {
    return NextResponse.json(
      { error: "Supabase er ikke konfigurert" },
      { status: 500 }
    );
  }

  const { data, error } = await db
    .from("members")
    .select("*")
    .eq("archived", false);
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json(data || []);
}

export async function POST(req: Request) {
  const auth = await requireLeader(req);
  if (!auth.ok) return auth.response;

  const body = await req.json().catch(() => ({}));
  const { activities = [], ...member } = body ?? {};

  const db = getSupabaseServiceRoleClient();
  if (!db) {
    return NextResponse.json(
      { error: "Supabase er ikke konfigurert" },
      { status: 500 }
    );
  }

  const { data: created, error: memberError } = await db
    .from("members")
    .insert(member)
    .select("*")
    .single();
  if (memberError) {
    return NextResponse.json({ error: memberError.message }, { status: 500 });
  }

  const createdId = String((created as any)?.id || "");
  if (!createdId) {
    return NextResponse.json({ error: "Kunne ikke lese id for nytt medlem" }, { status: 500 });
  }

  if (Array.isArray(activities) && activities.length) {
    const rows = activities.map((activityId: string) => ({
      member_id: createdId,
      activity_id: String(activityId),
    }));

    const { error: enrollError } = await db.from("enrollments").insert(rows);
    if (enrollError) {
      await db.from("members").delete().eq("id", createdId);
      return NextResponse.json({ error: enrollError.message }, { status: 500 });
    }
  }

  return NextResponse.json(created);
}
