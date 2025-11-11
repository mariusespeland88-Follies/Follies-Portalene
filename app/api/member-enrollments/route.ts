import { NextResponse } from 'next/server';

const URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;

async function sb(path: string, init: RequestInit = {}) {
  const headers: Record<string,string> = {
    apikey: KEY, Authorization: `Bearer ${KEY}`, 'Content-Type': 'application/json'
  };
  return fetch(`${URL}/rest/v1/${path}`, { ...init, headers: { ...headers, ...(init.headers||{}) }});
}

export async function PUT(req: Request, { params }: { params: { id: string } }) {
  const { activity_ids = [] } = await req.json().catch(()=>({}));

  // Slett eksisterende
  const del = await sb(`enrollment?member_id=eq.${params.id}`, { method: 'DELETE' });
  if (!del.ok) return NextResponse.json({ error: await del.text() }, { status: del.status });

  // Legg inn nye
  if (Array.isArray(activity_ids) && activity_ids.length) {
    const rows = activity_ids.map((a: string) => ({ member_id: params.id, activity_id: a }));
    const ins = await sb('enrollment', { method: 'POST', body: JSON.stringify(rows) });
    if (!ins.ok) return NextResponse.json({ error: await ins.text() }, { status: ins.status });
  }

  return NextResponse.json({ success: true });
}
