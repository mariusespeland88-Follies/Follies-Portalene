import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const runtime = "nodejs";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const db = createClient(supabaseUrl, serviceRoleKey);

export async function POST(req: NextRequest) {
  try {
    const { activityId } = await req.json();
    if (!activityId) {
      return NextResponse.json({ error: "Mangler activityId" }, { status: 400 });
    }

    // 1) Slett avhengigheter trygt (ignorer tabeller som ikke finnes i ditt prosjekt)
    const tryDelete = async (table: string, col = "activity_id") => {
      const { error } = await db.from(table).delete().eq(col, activityId);
      // Ignorer "relation does not exist" eller manglende kolonne – dette er for idempotens
      if (error && !/does not exist|column .* does not exist/i.test(error.message)) throw error;
    };

    await tryDelete("enrollments", "activity_id");
    await tryDelete("activity_files", "activity_id");
    await tryDelete("messages", "activity_id");
    await tryDelete("sessions", "activity_id");

    // 2) Selve aktiviteten
    const { error: delActErr } = await db.from("activities").delete().eq("id", activityId);
    if (delActErr) throw delActErr;

    return NextResponse.json({ ok: true });
  } catch (err: any) {
    return NextResponse.json({ error: err?.message ?? "Ukjent feil" }, { status: 500 });
  }
}
