// PATH: app/api/activities/route.ts
import { NextResponse } from 'next/server';
import { createClient } from "@supabase/supabase-js";
import { requireApiUser, requireLeader } from "@/lib/authz/apiAuth";

function adminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}

export async function GET(req: Request) {
  const auth = await requireApiUser(req);
  if (!auth.ok) return auth.response;

  const db = adminClient();
  if (!db) return NextResponse.json({ error: "Mangler Supabase-konfig." }, { status: 500 });

  // Ny sannhet: activities
  const { data, error } = await db
    .from("activities")
    .select("id, name, title, type, event_date, archived, has_guests, has_attendance, has_volunteers, has_tasks, tab_config")
    .eq("archived", false)
    .order("created_at", { ascending: false });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data ?? []);
}

export async function POST(req: Request) {
  const auth = await requireLeader(req);
  if (!auth.ok) return auth.response;

  const db = adminClient();
  if (!db) return NextResponse.json({ error: "Mangler Supabase-konfig." }, { status: 500 });

  const body = await req.json().catch(() => ({}));
  const {
    name,
    title,
    type,
    event_date,
    has_guests,
    has_attendance,
    has_volunteers,
    has_tasks,
    archived,
  } = body ?? {};

  const payload = {
    name: String(name ?? "").trim(),
    title: title != null ? String(title) : null,
    type: String(type ?? "offer").trim() || "offer",
    event_date: event_date ? String(event_date) : null,
    archived: Boolean(archived),
    has_guests: Boolean(has_guests),
    has_attendance: Boolean(has_attendance),
    has_volunteers: Boolean(has_volunteers),
    has_tasks: Boolean(has_tasks),
  };

  if (!payload.name) {
    return NextResponse.json({ error: "Mangler navn" }, { status: 400 });
  }

  const { data, error } = await db
    .from("activities")
    .insert(payload)
    .select("id, name, title, type, event_date, archived, has_guests, has_attendance, has_volunteers, has_tasks, tab_config")
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}
