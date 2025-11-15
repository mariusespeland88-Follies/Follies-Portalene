import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseServiceRoleClient } from '@/lib/supabase/server';

export async function GET() {
  const supabase = getSupabaseServiceRoleClient();
  if (!supabase) {
    return NextResponse.json([], { status: 200 });
  }
  const { data, error } = await supabase.from('program').select('*').order('season', { ascending: false });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}

export async function POST(req: NextRequest) {
  const body = await req.json();
  const supabase = getSupabaseServiceRoleClient();
  if (!supabase) {
    return NextResponse.json({ error: 'Supabase er ikke konfigurert' }, { status: 500 });
  }
  const { data, error } = await supabase.from('program').insert(body).select().single();
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json(data);
}
