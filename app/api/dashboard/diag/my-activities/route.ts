import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServiceRoleClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  const url = new URL(req.url, "http://localhost"); // FIX: robust parsing
  const email = (url.searchParams.get("email") || "").trim();
  const displayName = (url.searchParams.get("displayName") || "").trim();
  const candidatesCsv = (url.searchParams.get("candidates") || "").trim();

  const candidateIds = candidatesCsv
    ? candidatesCsv.split(",").map((s) => s.trim()).filter(Boolean)
    : [];

  const detail: any = {
    ok: true,
    inputs: { email, displayName, candidateIds },
    memberByEmail: null as null | { id: string },
    membersByName: [] as { id: string; first_name?: string | null; last_name?: string | null; email?: string | null }[],
    memberFromEnrollments: null as null | { member_id: string; activity_id?: string },
    chosenMemberId: null as string | null,
    enrollments: [] as { activity_id: string }[],
    activities: [] as any[],
    notes: [] as string[],
  };

  try {
    const db = getSupabaseServiceRoleClient();
    if (!db) {
      detail.ok = false;
      detail.notes.push("Supabase mangler konfigurasjon");
      return NextResponse.json(detail, { status: 500 });
    }

    // via e-post
    if (email) {
      const { data, error } = await db
        .from("members")
        .select("id")
        .ilike("email", email)
        .maybeSingle();
      if (error) detail.notes.push(`members(email) error: ${error.message}`);
      if (data?.id) detail.memberByEmail = { id: String(data.id) };
    }

    // via navn
    if (!detail.memberByEmail && displayName) {
      const parts = displayName.split(/\s+/).filter(Boolean);
      const fn = parts[0] || "";
      const ln = parts.slice(1).join(" ");
      if (fn) {
        const { data, error } = await db
          .from("members")
          .select("id, first_name, last_name, email")
          .ilike("first_name", fn)
          .ilike("last_name", ln || "%")
          .order("created_at", { ascending: false })
          .limit(10);
        if (error) detail.notes.push(`members(name) error: ${error.message}`);
        if (Array.isArray(data)) {
          detail.membersByName = data.map((m) => ({
            id: String(m.id), first_name: m.first_name ?? null, last_name: m.last_name ?? null, email: m.email ?? null,
          }));
        }
      }
    }

    // via enrollments i kandidat-aktiviteter
    if (!detail.memberByEmail && !detail.membersByName.length && candidateIds.length) {
      const { data, error } = await db
        .from("enrollments")
        .select("member_id, activity_id")
        .in("activity_id", candidateIds)
        .limit(1);
      if (error) detail.notes.push(`enrollments(candidates) error: ${error.message}`);
      if (Array.isArray(data) && data.length) {
        detail.memberFromEnrollments = { member_id: String(data[0].member_id), activity_id: String(data[0].activity_id) };
      }
    }

    detail.chosenMemberId =
      detail.memberByEmail?.id ||
      (detail.membersByName.length ? detail.membersByName[0].id : null) ||
      detail.memberFromEnrollments?.member_id ||
      null;

    if (detail.chosenMemberId) {
      const { data: enr, error: enrErr } = await db
        .from("enrollments")
        .select("activity_id")
        .eq("member_id", detail.chosenMemberId);
      if (enrErr) detail.notes.push(`enrollments(by member) error: ${enrErr.message}`);
      const ids = Array.from(new Set((enr ?? []).map((r: any) => String(r.activity_id)).filter(Boolean)));
      detail.enrollments = (enr ?? []).map((r: any) => ({ activity_id: String(r.activity_id) }));

      if (ids.length) {
        const { data: acts, error: actErr } = await db
          .from("activities")
          .select(
            "id, name, type, archived, start_date, end_date, has_guests, has_attendance, has_volunteers, has_tasks"
          )
          .in("id", ids);
        if (actErr) detail.notes.push(`activities(by ids) error: ${actErr.message}`);
        const seen = new Set<string>();
        detail.activities = (acts ?? []).filter((a: any) => {
          const id = String(a?.id || "");
          if (!id || seen.has(id)) return false;
          seen.add(id);
          return true;
        });
      }
    }

    if (!detail.activities.length && candidateIds.length) {
      const { data: acts, error } = await db
        .from("activities")
        .select(
          "id, name, type, archived, start_date, end_date, has_guests, has_attendance, has_volunteers, has_tasks"
        )
        .in("id", candidateIds);
      if (error) detail.notes.push(`activities(candidates) error: ${error.message}`);
      const seen = new Set<string>();
      detail.activities = (acts ?? []).filter((a: any) => {
        const id = String(a?.id || "");
        if (!id || seen.has(id)) return false;
        seen.add(id);
        return true;
      });
    }

    return NextResponse.json(detail);
  } catch (err: any) {
    detail.ok = false;
    detail.notes.push(`Fatal error: ${err?.message ?? "unknown"}`);
    return NextResponse.json(detail, { status: 500 });
  }
}
