import { NextResponse } from 'next/server';

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;

async function sb(path: string) {
  return fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    headers: { apikey: KEY, Authorization: `Bearer ${KEY}` }
  });
}

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const member = searchParams.get('member');
  if (!member) return NextResponse.json([], { status: 200 });
  const res = await sb(`enrollment?select=activity_id&member_id=eq.${member}`);
  if (!res.ok) return NextResponse.json({ error: await res.text() }, { status: res.status });
  return NextResponse.json(await res.json());
}
