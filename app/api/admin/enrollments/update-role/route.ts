import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const runtime = "nodejs"; // kjør på Node (bra for service-role)

// Les nøkler fra miljøvariabler (server only)
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

// Admin-klient (service role omgår RLS)
const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey);

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const activityId = String(body.activityId || "");
    const memberId = String(body.memberId || "");
    const role: "participant" | "leader" =
      body.role === "leader" ? "leader" : "participant";

    if (!supabaseUrl || !serviceRoleKey) {
      return NextResponse.json(
        { error: "Server mangler Supabase-konfig (SERVICE_ROLE/URL)." },
        { status: 500 }
      );
    }
    if (!activityId || !memberId) {
      return NextResponse.json(
        { error: "Mangler activityId eller memberId" },
        { status: 400 }
      );
    }

    // Finn eksisterende påmelding
    const { data: existing, error: findErr } = await supabaseAdmin
      .from("enrollments")
      .select("id")
      .eq("activity_id", activityId)
      .eq("member_id", memberId)
      .maybeSingle();
    if (findErr) throw findErr;

    if (!existing) {
      // Opprett ny påmelding med riktig rolle
      const { data, error } = await supabaseAdmin
        .from("enrollments")
        .insert({ activity_id: activityId, member_id: memberId, role })
        .select("id, role")
        .single();
      if (error) throw error;
      return NextResponse.json({ ok: true, data });
    }

    // Oppdater rolle
    const { data, error } = await supabaseAdmin
      .from("enrollments")
      .update({ role })
      .eq("id", existing.id)
      .select("id, role")
      .single();
    if (error) throw error;

    return NextResponse.json({ ok: true, data });
  } catch (err: any) {
    return NextResponse.json(
      { error: err?.message ?? "Ukjent feil" },
      { status: 500 }
    );
  }
}
