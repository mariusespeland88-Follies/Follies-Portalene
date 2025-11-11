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
  const memberId = params.id;
  const { activity_ids = [] } = await req.json().catch(()=>({}));

  // 1) Hent eksisterende enrollments
  const curRes = await sb(`enrollment?select=activity_id&member_id=eq.${memberId}`);
  if (!curRes.ok) return NextResponse.json({ error: await curRes.text() }, { status: curRes.status });
  const current: Array<{ activity_id: string }> = await curRes.json();

  const currentIds = new Set(current.map(r => r.activity_id));
  const newIds = new Set<string>(Array.isArray(activity_ids) ? activity_ids : []);

  // Diff
  const toAdd = [...newIds].filter(id => !currentIds.has(id));
  const toRemove = [...currentIds].filter(id => !newIds.has(id));

  // 2) Legg til nye enrollments + historikk-start
  if (toAdd.length) {
    // upsert enrollments
    const rows = toAdd.map(a => ({ member_id: memberId, activity_id: a }));
    const ins = await sb('enrollment', { method: 'POST', body: JSON.stringify(rows) });
    if (!ins.ok) return NextResponse.json({ error: await ins.text() }, { status: ins.status });

    // for hver ny: hvis det ikke finnes en åpen historikkrad, legg inn start
    const today = new Date().toISOString().slice(0,10);
    for (const actId of toAdd) {
      // Sjekk om det finnes en åpen rad
      const openCheck = await sb(
        `member_activity_history?select=id&member_id=eq.${memberId}&activity_id=eq.${actId}&end_date=is.null&limit=1`
      );
      if (!openCheck.ok) continue;
      const open = await openCheck.json();
      if (open.length === 0) {
        await sb('member_activity_history', {
          method: 'POST',
          body: JSON.stringify([{ member_id: memberId, activity_id: actId, start_date: today }]),
        }).catch(()=>{});
      }
    }
  }

  // 3) Fjern enrollments som ikke lenger er valgt + historikk-slutt
  if (toRemove.length) {
    for (const actId of toRemove) {
      // Slett enrollment
      await sb(`enrollment?member_id=eq.${memberId}&activity_id=eq.${actId}`, { method: 'DELETE' }).catch(()=>{});

      // Sett end_date på åpen historikkrad
      const today = new Date().toISOString().slice(0,10);
      await sb(
        `member_activity_history?member_id=eq.${memberId}&activity_id=eq.${actId}&end_date=is.null`,
        { method: 'PATCH', body: JSON.stringify({ end_date: today }) }
      ).catch(()=>{});
    }
  }

  return NextResponse.json({ success: true, added: toAdd, removed: toRemove });
}
