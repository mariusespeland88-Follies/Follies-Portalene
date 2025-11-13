// app/logout/route.ts
import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/route';

export async function POST() {
  const supabase = createClient();
  await supabase.auth.signOut();
  const res = NextResponse.json({ ok: true });
  res.cookies.set('dev_bypass', '', {
    path: '/',
    httpOnly: true,
    sameSite: 'lax',
    maxAge: 0,
  });
  return res;
}
