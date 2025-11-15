import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServiceRoleClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

// Mapper kun felter som finnes i din schema
function mapActs(rows: any[] | null | undefined) {
  return (rows ?? []).map((a: any) => ({
    id: String(a.id),
    name: a.name ?? `Aktivitet ${a.id}`,
    type: a.type ?? "offer",
    archived: !!a.archived,
  }));
}

export async function GET(req: NextRequest) {
  try {
    const db = getSupabaseServiceRoleClient();
    if (!db) {
      return NextResponse.json({ ok: false, error: "Server mangler Supabase-konfig." }, { status: 500 });
    }

    // Robust parsing i Node-runtime
    const url = new URL(req.url, "http://localhost");
    const email = (url.searchParams.get("email") || "").trim();
    const displayName = (url.searchParams.get("displayName") || "").trim();
    const candidatesCsv = (url.searchParams.get("candidates") || "").trim();
    const candidateIds = candidatesCsv ? candidatesCsv.split(",").map(s => s.trim()).filter(Boolean) : [];

    // STEP 1: Finn member_id
    let memberId: string | null = null;

    // 1a) via e-post (case-insensitiv)
    if (email) {
      const { data: byEmail, error } = await db
        .from("members")
        .select("id")
        .ilike("email", email)
        .maybeSingle();
      if (error) throw error;
      if (byEmail?.id) memberId = String(byEmail.id);
    }

    // 1b) via navn (fornavn + etternavn) om ikke funnet
    if (!memberId && displayName) {
      const parts = displayName.split(/\s+/).filter(Boolean);
      const fn = parts[0] || "";
      const ln = parts.slice(1).join(" ");
      if (fn) {
        const { data: byName, error } = await db
          .from("members")
          .select("id")
          .ilike("first_name", fn)
          .ilike("last_name", ln || "%")
          .order("created_at", { ascending: false })
          .limit(5);
        if (error) throw error;
        if (Array.isArray(byName) && byName.length) {
          memberId = String(byName[0].id);
        }
      }
    }

    // 1c) via enrollments i kandidat-aktiviteter (hvis sendt inn)
    if (!memberId && candidateIds.length) {
      const { data: viaEnr, error } = await db
        .from("enrollments")
        .select("member_id, activity_id")
        .in("activity_id", candidateIds)
        .limit(1);
      if (error) throw error;
      if (Array.isArray(viaEnr) && viaEnr.length) {
        memberId = String(viaEnr[0].member_id);
      }
    }

    // STEP 2: Har vi memberId → hent enrollments → aktiviteter (uten start_date/end_date)
    if (memberId) {
      const { data: enr, error: enrErr } = await db
        .from("enrollments")
        .select("activity_id")
        .eq("member_id", memberId);
      if (enrErr) throw enrErr;

      const ids = Array.from(new Set((enr ?? []).map((r: any) => String(r.activity_id)).filter(Boolean)));
      if (ids.length) {
        const { data: acts, error: actErr } = await db
          .from("activities")
          .select("id, name, type, archived")
          .in("id", ids);
        if (actErr) throw actErr;

        // Dedup & svar
        const seen = new Set<string>();
        const uniq = (acts ?? []).filter((a: any) => {
          const id = String(a?.id || "");
          if (!id || seen.has(id)) return false;
          seen.add(id);
          return true;
        });
        return NextResponse.json({ ok: true, activities: mapActs(uniq) });
      }
    }

    // STEP 3: Fallback – returnér kandidat-aktiviteter direkte hvis sendt inn
    if (candidateIds.length) {
      const { data: acts, error } = await db
        .from("activities")
        .select("id, name, type, archived")
        .in("id", candidateIds);
      if (error) throw error;
      return NextResponse.json({ ok: true, activities: mapActs(acts) });
    }

    return NextResponse.json({ ok: true, activities: [] });
  } catch (err: any) {
    return NextResponse.json({ ok: false, error: err?.message ?? "Unknown error" }, { status: 500 });
  }
}
