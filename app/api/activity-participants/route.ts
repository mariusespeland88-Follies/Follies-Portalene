import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

/**
 * Returnerer { participants: { id, name }[] } for gitt ?id=<activity_id>
 * Leser fra Supabase på server (Service Role key via server-env).
 * Forventer tabeller:
 *  - enrollment (member_id, activity_id, status?) — aktive rader gir medlemskap
 *  - member (id, first_name, last_name, archived)
 */

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const activityId = searchParams.get("id");
    if (!activityId) {
      return NextResponse.json({ error: "Mangler ?id" }, { status: 400 });
    }

    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY! // server only
    );

    // Hent aktive enrollments for denne aktiviteten
    // NB: Tilpass evt. hvor "status" brukes; her antar vi null eller "active" er gyldig.
    const { data: rows, error } = await supabase
      .from("enrollment")
      .select("member:member(id, first_name, last_name, archived)")
      .eq("activity_id", activityId);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    const participants =
      (rows ?? [])
        .map((r: any) => r.member)
        .filter((m: any) => m && !m.archived)
        .map((m: any) => ({
          id: String(m.id),
          name: [m.first_name, m.last_name].filter(Boolean).join(" ") || "Uten navn",
        }));

    return NextResponse.json({ participants });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || "Ukjent feil" }, { status: 500 });
  }
}
