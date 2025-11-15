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

export async function GET(_req: Request, { params }: { params: { id: string } }) {
  const selectFields = [
    "id",
    "name",
    "type",
    "season",
    "weekday",
    "capacity",
    "description",
    "archived",
    "start_date",
    "end_date",
    "has_guests",
    "has_attendance",
    "has_volunteers",
    "has_tasks",
  ].join(",");

  const res = await sb(`activity?id=eq.${params.id}&select=${selectFields}`);
  if (!res.ok) return NextResponse.json({ error: await res.text() }, { status: res.status });
  const data = await res.json();
  return NextResponse.json(data[0] || null);
}

export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  const body = await req.json();
  const allowed = [
    'name',
    'type',
    'season',
    'weekday',
    'capacity',
    'description',
    'archived',
    'start_date',
    'end_date',
    'has_guests',
    'has_attendance',
    'has_volunteers',
    'has_tasks',
  ];
  const payload: Record<string, any> = {};
  for (const k of allowed) if (k in body) payload[k] = body[k];

  const res = await sb(`activity?id=eq.${params.id}`, {
    method: 'PATCH',
    headers: { Prefer: 'return=representation' },
    body: JSON.stringify(payload),
  });

  if (!res.ok) return NextResponse.json({ error: await res.text() }, { status: res.status });
  const data = await res.json();
  return NextResponse.json(data[0] || null);
}

export async function DELETE(_req: Request, { params }: { params: { id: string } }) {
  // "Slett" = arkiver
  const res = await sb(`activity?id=eq.${params.id}`, {
    method: 'PATCH',
    headers: { Prefer: 'return=representation' },
    body: JSON.stringify({ archived: true }),
  });
  if (!res.ok) return NextResponse.json({ error: await res.text() }, { status: res.status });
  return NextResponse.json({ success: true });
}
