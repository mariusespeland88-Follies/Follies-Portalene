// PATH: app/api/dashboard/my-sessions/route.ts
import { NextResponse } from "next/server";

/**
 * DB-first: Hent kommende økter (activity_sessions) for innlogget bruker (via enrollments).
 * Input (query):
 *  - email (valgfri, brukes til å finne member_id)
 *  - memberId (valgfri, hvis du allerede har den)
 *  - days (valgfri, default 30, max 90)
 *
 * Output:
 *  { sessions: [{ id, activity_id, title, start_at, end_at, location?, note? }] }
 */

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || "";
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || "";

function bad(msg: string, status = 400) {
  return NextResponse.json({ error: msg }, { status });
}

function isValidHttpUrl(s: string) {
  try {
    const u = new URL(s);
    return u.protocol === "http:" || u.protocol === "https:";
  } catch {
    return false;
  }
}

async function sb(path: string) {
  // REST via PostgREST (service role)
  const url = `${SUPABASE_URL.replace(/\/+$/, "")}/rest/v1/${path}`;
  return fetch(url, {
    method: "GET",
    headers: {
      apikey: SERVICE_KEY,
      Authorization: `Bearer ${SERVICE_KEY}`,
      "Content-Type": "application/json",
    },
    cache: "no-store",
  });
}

function isoNowPlusDays(days: number) {
  const now = new Date();
  const end = new Date(now.getTime() + days * 24 * 60 * 60 * 1000);
  return { nowISO: now.toISOString(), endISO: end.toISOString() };
}

function uniq(arr: string[]) {
  return Array.from(new Set(arr.filter(Boolean)));
}

export async function GET(req: Request) {
  try {
    if (!SUPABASE_URL || !isValidHttpUrl(SUPABASE_URL)) {
      return bad(
        "NEXT_PUBLIC_SUPABASE_URL mangler eller er ugyldig (må starte med https://...).",
        500
      );
    }
    if (!SERVICE_KEY) {
      return bad("SUPABASE_SERVICE_ROLE_KEY mangler.", 500);
    }

    const { searchParams } = new URL(req.url);

    const email = (searchParams.get("email") || "").trim().toLowerCase();
    const memberIdParam = (searchParams.get("memberId") || "").trim();
    const daysRaw = Number(searchParams.get("days") || "30");
    const days = Math.max(1, Math.min(90, Number.isFinite(daysRaw) ? daysRaw : 30));

    let memberId = memberIdParam;

    // 1) Finn member_id via email hvis ikke gitt
    if (!memberId && email) {
      const r = await sb(
        `members?select=id&email=eq.${encodeURIComponent(email)}&limit=1`
      );
      if (!r.ok) return NextResponse.json({ error: await r.text() }, { status: r.status });
      const rows = (await r.json().catch(() => [])) as any[];
      memberId = rows?.[0]?.id ? String(rows[0].id) : "";
    }

    if (!memberId) {
      // Ikke error — bare ingen data
      return NextResponse.json({ sessions: [] });
    }

    // 2) Finn aktivitetene bruker er påmeldt (enrollments)
    const enrRes = await sb(
      `enrollments?select=activity_id&member_id=eq.${encodeURIComponent(memberId)}`
    );
    if (!enrRes.ok) return NextResponse.json({ error: await enrRes.text() }, { status: enrRes.status });

    const enrRows = (await enrRes.json().catch(() => [])) as any[];
    const activityIds = uniq((enrRows || []).map((r) => String(r?.activity_id || "")));

    if (activityIds.length === 0) {
      return NextResponse.json({ sessions: [] });
    }

    // 3) Hent økter for disse aktivitetene (neste X dager)
    const { nowISO, endISO } = isoNowPlusDays(days);
    const inClause = `in.(${activityIds.map((x) => `"${x}"`).join(",")})`;

    const cols = [
      "id",
      "activity_id",
      "title",
      "start_at",
      "end_at",
      "location",
      "note",
    ].join(",");

    const sessRes = await sb(
      `activity_sessions?select=${cols}` +
        `&activity_id=${inClause}` +
        `&start_at=gte.${encodeURIComponent(nowISO)}` +
        `&start_at=lte.${encodeURIComponent(endISO)}` +
        `&order=start_at.asc`
    );

    if (!sessRes.ok) return NextResponse.json({ error: await sessRes.text() }, { status: sessRes.status });

    const rows = (await sessRes.json().catch(() => [])) as any[];

    const sessions = (rows || []).map((s) => ({
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
    return NextResponse.json({ error: e?.message || "Ukjent feil" }, { status: 500 });
  }
}
