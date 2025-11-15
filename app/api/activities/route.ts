import { NextResponse } from 'next/server';

const URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;

async function sb(path: string, init: RequestInit = {}) {
  const headers: Record<string,string> = {
    apikey: KEY,
    Authorization: `Bearer ${KEY}`,
    'Content-Type': 'application/json',
  };
  return fetch(`${URL}/rest/v1/${path}`, { ...init, headers: { ...headers, ...(init.headers||{}) }});
}

export async function GET() {
  // Kun aktive (ikke arkiverte) aktiviteter
  const columns = [
    'id',
    'name',
    'type',
    'archived',
    'has_guests',
    'has_attendance',
    'has_volunteers',
    'has_tasks',
  ].join(',');
  const res = await sb(`activity?select=${columns}&archived=eq.false`);
  if (!res.ok) return NextResponse.json({ error: await res.text() }, { status: res.status });
  return NextResponse.json(await res.json());
}

export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));
  const {
    name,
    season,
    weekday,
    capacity,
    description,
    has_guests,
    has_attendance,
    has_volunteers,
    has_tasks,
  } = body ?? {};

  const payload = {
    name,
    season,
    weekday,
    capacity,
    description,
    has_guests: Boolean(has_guests),
    has_attendance: Boolean(has_attendance),
    has_volunteers: Boolean(has_volunteers),
    has_tasks: Boolean(has_tasks),
  };

  const res = await sb('activity', {
    method: 'POST',
    headers: { Prefer: 'return=representation' },
    body: JSON.stringify(payload)
  });
  if (!res.ok) return NextResponse.json({ error: await res.text() }, { status: res.status });
  const data = await res.json();
  return NextResponse.json(data[0]);
}
