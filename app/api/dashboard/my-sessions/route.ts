import { NextResponse } from "next/server";
import { requireApiMember } from "@/lib/authz/apiAuth";
import { getSupabaseServiceRoleClient } from "@/lib/supabase/server";

function isoNowPlusDays(days: number) {
  const now = new Date();
  const end = new Date(now.getTime() + days * 24 * 60 * 60 * 1000);
  return { nowISO: now.toISOString(), endISO: end.toISOString() };
}

function unique(items: string[]): string[] {
  return Array.from(new Set(items.filter(Boolean)));
}

export async function GET(req: Request) {
  try {
    const auth = await requireApiMember(req);
    if (!auth.ok) return auth.response;
    const memberId = auth.memberId;
    if (!memberId) {
      return NextResponse.json({ sessions: [] });
    }

    const db = getSupabaseServiceRoleClient();
    if (!db) {
      return NextResponse.json(
        { error: "Supabase er ikke konfigurert" },
        { status: 500 }
      );
    }

    const { searchParams } = new URL(req.url);
    const daysRaw = Number(searchParams.get("days") || "30");
    const days = Math.max(
      1,
      Math.min(90, Number.isFinite(daysRaw) ? daysRaw : 30)
    );

    const { data: enrRows, error: enrError } = await db
      .from("enrollments")
      .select("activity_id")
      .eq("member_id", memberId);
    if (enrError) {
      return NextResponse.json({ error: enrError.message }, { status: 500 });
    }

    const activityIds = unique(
      (enrRows || []).map((r: any) => String(r.activity_id || ""))
    );
    if (!activityIds.length) {
      return NextResponse.json({ sessions: [] });
    }

    const { nowISO, endISO } = isoNowPlusDays(days);
    const { data: rows, error: sessionsError } = await db
      .from("activity_sessions")
      .select("id, activity_id, title, start_at, end_at, location, note")
      .in("activity_id", activityIds)
      .gte("start_at", nowISO)
      .lte("start_at", endISO)
      .order("start_at", { ascending: true });
    if (sessionsError) {
      return NextResponse.json(
        { error: sessionsError.message },
        { status: 500 }
      );
    }

    const sessions = (rows || []).map((s: any) => ({
      id: String(s?.id || ""),
      activity_id: String(s?.activity_id || ""),
      title: String(s?.title || "Økt"),
      start_at: String(s?.start_at || ""),
      end_at: String(s?.end_at || s?.start_at || ""),
      location: s?.location != null ? String(s.location) : "",
      note: s?.note != null ? String(s.note) : "",
    }));

    return NextResponse.json({ sessions });
  } catch (e: any) {
    return NextResponse.json(
      { error: e?.message || "Ukjent feil" },
      { status: 500 }
    );
  }
}
