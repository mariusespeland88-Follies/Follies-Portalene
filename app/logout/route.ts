// app/logout/route.ts
import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/route';

export async function POST() {
  const supabase = createClient();
  await supabase.auth.signOut();
  return NextResponse.json({ ok: true });
}
