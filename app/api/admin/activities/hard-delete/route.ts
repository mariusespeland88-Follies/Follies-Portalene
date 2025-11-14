import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServiceRoleClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

// Feilmønstre som trygt kan ignoreres når en tabell/kolonne ikke finnes
const IGNORE_PATTERNS = [
  /relation .* does not exist/i,                             // Postgres: relation "x" does not exist
  /does not exist/i,                                         // generisk
  /column .* does not exist/i,                               // manglende kolonne
  /could not find the table .* in the schema cache/i,        // PostgREST/Supabase schemacache
];

async function safeDelete(
  client: ReturnType<typeof getSupabaseServiceRoleClient>,
  table: string,
  col: string,
  id: string
) {
  if (!client) return;
  const { error } = await client.from(table).delete().eq(col, id);
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
    const db = getSupabaseServiceRoleClient();
    if (!db) {
      return NextResponse.json({ error: "Server mangler Supabase-konfig." }, { status: 500 });
    }

    // Slett mulige avhengigheter først. Alle er "best effort".
    // Legg gjerne til flere tabeller her hvis du får FK-feil (f.eks. 'activity_attachments' o.l.).
    await safeDelete(db, "enrollments", "activity_id", activityId);
    await safeDelete(db, "sessions", "activity_id", activityId);
    await safeDelete(db, "messages", "activity_id", activityId);
    await safeDelete(db, "activity_files", "activity_id", activityId);   // ignoreres hvis tabellen ikke finnes

    // Til slutt: selve aktiviteten
    const { error: delActErr } = await db.from("activities").delete().eq("id", activityId);
    if (delActErr) throw delActErr;

    return NextResponse.json({ ok: true });
  } catch (err: any) {
    return NextResponse.json({ error: err?.message ?? "Ukjent feil" }, { status: 500 });
  }
}
