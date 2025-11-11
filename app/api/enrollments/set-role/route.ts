// app/api/enrollments/set-role/route.ts
import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const runtime = "nodejs";        // kjør på server
export const dynamic = "force-dynamic"; // ingen cache

function srv() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY!; // server only
  if (!url || !key) throw new Error("Mangler SUPABASE env (URL / SERVICE_ROLE_KEY)");
  return createClient(url, key);
}

function normRole(input: string | null): "leader" | "participant" {
  const v = (input || "").trim().toLowerCase();
  return v === "leader" || v === "leder" ? "leader" : "participant";
}

export async function GET(req: Request) {
  try {
    const supabase = srv();
    const url = new URL(req.url);
    const memberId = url.searchParams.get("member");
    const activityId = url.searchParams.get("activity");
    const role = normRole(url.searchParams.get("role") || "leader");

    if (!memberId || !activityId) {
      return NextResponse.json(
        { ok: false, error: "Missing ?member=<uuid>&activity=<uuid>&role=leader|participant" },
        { status: 400 }
      );
    }

    const { data, error } = await supabase
      .from("enrollments")
      .upsert({ member_id: memberId, activity_id: activityId, role }, { onConflict: "member_id,activity_id" })
      .select("*");

    if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true, role, affected: data?.length ?? 0, rows: data || [] });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message || String(e) }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const supabase = srv();
    const body = (await req.json()) as { member: string; activity: string; role?: string | null };
    const memberId = body?.member;
    const activityId = body?.activity;
    const role = normRole(body?.role || "leader");

    if (!memberId || !activityId) {
      return NextResponse.json(
        { ok: false, error: "Body must include { member: <uuid>, activity: <uuid>, role?: 'leader'|'participant' }" },
        { status: 400 }
      );
    }

    const { data, error } = await supabase
      .from("enrollments")
      .upsert({ member_id: memberId, activity_id: activityId, role }, { onConflict: "member_id,activity_id" })
      .select("*");

    if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true, role, affected: data?.length ?? 0, rows: data || [] });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message || String(e) }, { status: 500 });
  }
}
