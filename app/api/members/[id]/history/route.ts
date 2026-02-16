// PATH: app/api/members/[id]/history/route.ts
import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { requireApiUser } from "@/lib/authz/apiAuth";

export const runtime = "nodejs";

/** Returnerer tidligere eventer (activity.type='event' med dato i fortid) medlemmet har vært påmeldt */
export async function GET(_req: Request, { params }: { params: { id: string } }) {
  const id = params?.id;
  if (!id) return NextResponse.json({ error: "Mangler id" }, { status: 400 });
  try {
    const auth = await requireApiUser(_req);
    if (!auth.ok) return auth.response;

    const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);

    const { data: rows, error } = await supabase
      .from("enrollments")
      .select("activity_id")
      .eq("member_id", id);

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    const activityIds = Array.from(
      new Set((rows ?? []).map((r: any) => String(r?.activity_id ?? "")).filter(Boolean))
    );
    if (activityIds.length === 0) return NextResponse.json({ events: [] });

    const { data: activities, error: actErr } = await supabase
      .from("activities")
      .select("id, name, type, event_date")
      .in("id", activityIds);

    if (actErr) return NextResponse.json({ error: actErr.message }, { status: 500 });

    const now = new Date();
    const events =
      (activities || [])
        .filter((a: any) => a && a.type === "event" && a.event_date)
        .filter((a: any) => new Date(a.event_date) <= now)
        .sort((a: any, b: any) => (a.event_date < b.event_date ? 1 : -1))
        .map((a: any) => ({ id: String(a.id), name: a.name as string, date: a.event_date as string }));

    return NextResponse.json({ events });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || "Ukjent feil" }, { status: 500 });
  }
}
