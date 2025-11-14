// app/logout/route.ts
import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/route';

export async function POST() {
  const supabase = createClient();
  await supabase.auth.signOut();
  const res = NextResponse.json({ ok: true });
  res.cookies.set({
    name: "dev_bypass",
    value: "",
    path: "/",
    sameSite: "lax",
    maxAge: 0,
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
  });
  return res;
}
