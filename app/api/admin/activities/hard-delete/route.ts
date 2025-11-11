import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const runtime = "nodejs";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const db = createClient(supabaseUrl, serviceRoleKey);

// Feilmønstre som trygt kan ignoreres når en tabell/kolonne ikke finnes
const IGNORE_PATTERNS = [
  /relation .* does not exist/i,                             // Postgres: relation "x" does not exist
  /does not exist/i,                                         // generisk
  /column .* does not exist/i,                               // manglende kolonne
  /could not find the table .* in the schema cache/i,        // PostgREST/Supabase schemacache
];

async function safeDelete(table: string, col: string, id: string) {
  const { error } = await db.from(table).delete().eq(col, id);
  if (error) {
    const msg = `${error.message || ""} ${error.details || ""}`.toLowerCase();
    if (IGNORE_PATTERNS.some((re) => re.test(msg))) {
      // ignorerer stille hvis tabell/kolonne ikke finnes i prosjektet
      return;
    }
    throw error;
  }
}

export async function POST(req: NextRequest) {
  try {
    const { activityId } = await req.json();
    if (!activityId) {
      return NextResponse.json({ error: "Mangler activityId" }, { status: 400 });
    }
    if (!supabaseUrl || !serviceRoleKey) {
      return NextResponse.json({ error: "Server mangler Supabase-konfig." }, { status: 500 });
    }

    // Slett mulige avhengigheter først. Alle er "best effort".
    // Legg gjerne til flere tabeller her hvis du får FK-feil (f.eks. 'activity_attachments' o.l.).
    await safeDelete("enrollments", "activity_id", activityId);
    await safeDelete("sessions", "activity_id", activityId);
    await safeDelete("messages", "activity_id", activityId);
    await safeDelete("activity_files", "activity_id", activityId);   // ignoreres hvis tabellen ikke finnes

    // Til slutt: selve aktiviteten
    const { error: delActErr } = await db.from("activities").delete().eq("id", activityId);
    if (delActErr) throw delActErr;

    return NextResponse.json({ ok: true });
  } catch (err: any) {
    return NextResponse.json({ error: err?.message ?? "Ukjent feil" }, { status: 500 });
  }
}
