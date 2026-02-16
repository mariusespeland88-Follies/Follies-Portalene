import { NextResponse } from "next/server";

import { requireApiMember } from "@/lib/authz/apiAuth";
import { getSupabaseServiceRoleClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

type CalendarEventRow = {
  id: string;
  member_id: string;
  title: string;
  start_at: string;
  end_at: string;
  note: string | null;
  created_at: string;
  updated_at: string;
  created_by_member_id: string | null;
};

function mapCalendarEvent(row: CalendarEventRow) {
  return {
    id: String(row.id),
    member_id: String(row.member_id),
    title: String(row.title ?? "Hendelse"),
    start_at: String(row.start_at),
    end_at: String(row.end_at),
    note: row.note ?? null,
    created_at: String(row.created_at),
    updated_at: String(row.updated_at),
    created_by_member_id: row.created_by_member_id
      ? String(row.created_by_member_id)
      : null,
  };
}

function toIso(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  const d = new Date(trimmed);
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString();
}

export async function GET(request: Request) {
  const auth = await requireApiMember(request);
  if (!auth.ok) return auth.response;
  const memberId = String(auth.memberId ?? "").trim();
  if (!memberId) {
    return NextResponse.json({ events: [] });
  }

  const supabase = getSupabaseServiceRoleClient();
  if (!supabase) {
    return NextResponse.json({ events: [] });
  }

  const { searchParams } = new URL(request.url);
  const allRequested = searchParams.get("all") === "1";
  const showAll = allRequested && auth.isAdmin;

  let query = supabase
    .from("member_calendar_events")
    .select(
      "id, member_id, title, start_at, end_at, note, created_at, updated_at, created_by_member_id"
    )
    .order("start_at", { ascending: true });

  if (!showAll) {
    query = query.eq("member_id", memberId);
  }

  const { data, error } = await query;
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({
    member_id: auth.memberId,
    is_admin: auth.isAdmin,
    events: (data ?? []).map((row) => mapCalendarEvent(row as CalendarEventRow)),
  });
}

export async function POST(request: Request) {
  try {
    const auth = await requireApiMember(request);
    if (!auth.ok) return auth.response;

    const supabase = getSupabaseServiceRoleClient();
    if (!supabase) {
      return NextResponse.json(
        { error: "Supabase er ikke konfigurert" },
        { status: 500 }
      );
    }

    const body = await request.json().catch(() => ({}));

    const title = String(body?.title ?? "").trim();
    const startAt = toIso(body?.startAt);
    const endAt = toIso(body?.endAt);
    const note =
      typeof body?.note === "string" && body.note.trim().length > 0
        ? body.note.trim()
        : null;

    let memberId = String(auth.memberId ?? "").trim();
    if (auth.isAdmin && typeof body?.memberId === "string" && body.memberId.trim()) {
      memberId = body.memberId.trim();
    }

    if (!memberId || !title || !startAt || !endAt) {
      return NextResponse.json(
        { error: "Mangler påkrevde felt (title, startAt, endAt)." },
        { status: 400 }
      );
    }

    if (new Date(endAt).getTime() < new Date(startAt).getTime()) {
      return NextResponse.json(
        { error: "Sluttid kan ikke være før starttid." },
        { status: 400 }
      );
    }

    const { data, error } = await supabase
      .from("member_calendar_events")
      .insert({
        member_id: memberId,
        title,
        start_at: startAt,
        end_at: endAt,
        note,
        created_by_member_id: auth.memberId,
      })
      .select(
        "id, member_id, title, start_at, end_at, note, created_at, updated_at, created_by_member_id"
      )
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ event: mapCalendarEvent(data as CalendarEventRow) });
  } catch (err: any) {
    return NextResponse.json(
      { error: err?.message || "Ukjent feil" },
      { status: 500 }
    );
  }
}
