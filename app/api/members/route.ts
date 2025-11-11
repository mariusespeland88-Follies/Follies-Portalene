import { NextResponse } from 'next/server';

const URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;

async function sb(path: string, init: RequestInit = {}) {
  const headers: Record<string,string> = {
    apikey: KEY,
    Authorization: `Bearer ${KEY}`,
    'Content-Type': 'application/json',
  };
  const res = await fetch(`${URL}/rest/v1/${path}`, { ...init, headers: { ...headers, ...(init.headers||{}) }});
  return res;
}

export async function GET() {
  const res = await sb(`member?select=*&archived=eq.false`);
  if (!res.ok) return NextResponse.json({ error: await res.text() }, { status: res.status });
  return NextResponse.json(await res.json());
}

export async function POST(req: Request) {
  const body = await req.json();

  // forventer { first_name, last_name, email?, phone?, city?, address?, postal_code?, notes_public?, activities: [activity_id, ...] }
  const { activities = [], ...member } = body;

  // 1) Opprett medlem
  const resMember = await sb('member', {
    method: 'POST',
    headers: { Prefer: 'return=representation' },
    body: JSON.stringify(member),
  });
  if (!resMember.ok) return NextResponse.json({ error: await resMember.text() }, { status: resMember.status });
  const created = (await resMember.json())[0];

  // 2) Lag påmeldinger (enrollment)
  if (Array.isArray(activities) && activities.length) {
    const rows = activities.map((a: string) => ({ member_id: created.id, activity_id: a }));
    const resEnr = await sb('enrollment', { method: 'POST', body: JSON.stringify(rows) });
    if (!resEnr.ok) {
      // rull tilbake medlem dersom påmelding feiler
      await sb(`member?id=eq.${created.id}`, { method: 'DELETE' }).catch(()=>{});
      return NextResponse.json({ error: await resEnr.text() }, { status: resEnr.status });
    }
  }

  return NextResponse.json(created);
}
