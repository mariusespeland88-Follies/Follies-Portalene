import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServiceRoleClient } from "@/lib/supabase/server";

export const runtime = "nodejs"; // kjør på Node (bra for service-role)

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const activityId = String(body.activityId || "");
    const memberId = String(body.memberId || "");
    const role: "participant" | "leader" =
      body.role === "leader" ? "leader" : "participant";

    const supabaseAdmin = getSupabaseServiceRoleClient();
    if (!supabaseAdmin) {
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

    const existingRow = (existing as { id: string } | null) ?? null;

    if (!existingRow) {
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
      .eq("id", existingRow.id)
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
