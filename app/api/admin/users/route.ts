// app/api/admin/users/route.ts
import { NextResponse } from 'next/server';
import { createClient as createRouteClient } from '@/lib/supabase/route';
import { createClient as createAdminClient } from '@supabase/supabase-js';

// POST body: { email, mode: 'invite'|'create', password?, role? }
export async function POST(req: Request) {
  try {
    const body = await req.json();
    const email = String(body.email ?? '').trim().toLowerCase();
    const mode = body.mode === 'create' ? 'create' : 'invite';
    const password = body.password ? String(body.password) : undefined;
    const role = (['admin','staff','user'].includes(body.role) ? body.role : 'user') as 'admin'|'staff'|'user';

    if (!email) return NextResponse.json({ error: 'Mangler e-post' }, { status: 400 });
    if (mode === 'create' && (!password || password.length < 8))
      return NextResponse.json({ error: 'Passord må være minst 8 tegn' }, { status: 400 });

    // Sjekk at caller er admin
    const supa = createRouteClient();
    const { data: { user } } = await supa.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { data: me } = await supa.from('profiles').select('role').eq('id', user.id).maybeSingle();
    if (me?.role !== 'admin') return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

    // Bruk service role (server only)
    const admin = createAdminClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );

    if (mode === 'invite') {
      const { data, error } = await admin.auth.admin.inviteUserByEmail(email, { data: { role } });
      if (error) return NextResponse.json({ error: error.message }, { status: 400 });
      return NextResponse.json({ ok: true, invited: true, user: data.user });
    }

    // create med passord
    const { data: created, error: createErr } = await admin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { role }
    });
    if (createErr) return NextResponse.json({ error: createErr.message }, { status: 400 });

    if (created.user) {
      await admin.from('profiles').update({ role }).eq('id', created.user.id);
    }

    return NextResponse.json({ ok: true, invited: false, user: created.user });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message ?? 'Ukjent feil' }, { status: 500 });
  }
}
