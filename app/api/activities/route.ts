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
  const res = await sb('activity?select=*&archived=eq.false');
  if (!res.ok) return NextResponse.json({ error: await res.text() }, { status: res.status });
  return NextResponse.json(await res.json());
}

export async function POST(req: Request) {
  const { name, season, weekday, capacity, description } = await req.json();
  const res = await sb('activity', {
    method: 'POST',
    headers: { Prefer: 'return=representation' },
    body: JSON.stringify({ name, season, weekday, capacity, description })
  });
  if (!res.ok) return NextResponse.json({ error: await res.text() }, { status: res.status });
  const data = await res.json();
  return NextResponse.json(data[0]);
}
