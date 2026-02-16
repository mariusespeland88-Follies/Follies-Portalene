// PATH: app/api/dashboard/my-activities/route.ts
import { NextRequest, NextResponse } from "next/server";
import { requireApiUser } from "@/lib/authz/apiAuth";
import { getSupabaseServiceRoleClient } from "@/lib/supabase/server";

export const runtime = "nodejs";
const BUCKET = "activity-media";

// Mapper kun felter som finnes i din schema
function mapActs(rows: any[] | null | undefined, covers?: Map<string, string | null>) {
  return (rows ?? []).map((a: any) => ({
    id: String(a.id ?? ""),
    name: a.name ?? `Aktivitet ${a.id}`,
    type: a.type ?? "offer",
    archived: !!a.archived,
    has_guests: !!a.has_guests,
    has_attendance: !!a.has_attendance,
    has_volunteers: !!a.has_volunteers,
    has_tasks: !!a.has_tasks,
    cover_url: covers?.get(String(a.id ?? "")) ?? null,
  }));
}

type SupabaseServerClient = NonNullable<ReturnType<typeof getSupabaseServiceRoleClient>>;

async function fetchCoverUrls(db: SupabaseServerClient, ids: string[]) {
  const map = new Map<string, string | null>();
  if (!ids.length) return map;

  const { data, error } = await db
    .from("activity_details")
    .select("activity_id, cover_image_path")
    .in("activity_id", ids);
  if (error) throw error;

  const rows = Array.isArray(data) ? data : [];
  const cacheBust = Date.now();

  await Promise.all(
    rows.map(async (row) => {
      const activityId = String((row as any)?.activity_id ?? "");
      const path = (row as any)?.cover_image_path as string | null;
      if (!activityId || !path) return;

      const { data: pub } = db.storage.from(BUCKET).getPublicUrl(path);
      let url: string | null = pub?.publicUrl || null;

      try {
        const { data: signed } = await db.storage.from(BUCKET).createSignedUrl(path, 60 * 60);
        if (signed?.signedUrl) url = signed.signedUrl;
      } catch {
        // ignorér signeringsfeil – fall tilbake til publicUrl hvis den finnes
      }

      if (url) {
        map.set(activityId, `${url}${url.includes("?") ? "&" : "?"}v=${cacheBust}`);
      }
    })
  );

  return map;
}

export async function GET(req: NextRequest) {
  try {
    const auth = await requireApiUser(req);
    if (!auth.ok) return auth.response;

    const db = getSupabaseServiceRoleClient();
    if (!db) {
      return NextResponse.json({ ok: false, error: "Server mangler Supabase-konfig." }, { status: 500 });
    }

    // STEP 1: Finn member_id
    let memberId: string | null = auth.memberId ?? null;
    const email = String(auth.user.email || "").trim();

    // 1a) via e-post (case-insensitiv)
    if (!memberId && email) {
      const { data: byEmail, error } = await db
        .from("members")
        .select("id")
        .ilike("email", email)
        .maybeSingle();
      if (error) throw error;
      if (byEmail?.id) memberId = String(byEmail.id);
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
          .select(
            "id, name, type, archived, has_guests, has_attendance, has_volunteers, has_tasks"
          )
          .in("id", ids);
        if (actErr) throw actErr;

        const coverMap = await fetchCoverUrls(db, ids);

        // Dedup & svar
        const seen = new Set<string>();
        const uniq = (acts ?? []).filter((a: any) => {
          const id = String(a?.id || "");
          if (!id || seen.has(id)) return false;
          seen.add(id);
          return true;
        });
        return NextResponse.json({ ok: true, activities: mapActs(uniq, coverMap) });
      }
    }

    return NextResponse.json({ ok: true, activities: [] });
  } catch (err: any) {
    return NextResponse.json({ ok: false, error: err?.message ?? "Unknown error" }, { status: 500 });
  }
}
