import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const runtime = "nodejs";

export async function POST(req: Request, { params }: { params: { id: string } }) {
  const id = params?.id;
  if (!id) return NextResponse.json({ error: "Mangler id" }, { status: 400 });
  try {
    const { activityIds } = await req.json();
    const setIds: string[] = Array.isArray(activityIds) ? activityIds.map(String) : [];

    const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);

    // hent eksisterende
    const { data: rows } = await supabase.from("enrollment").select("activity_id").eq("member_id", id);
    const existing = new Set((rows || []).map((r: any) => String(r.activity_id)));

    // beregn diff
    const toAdd = setIds.filter((x) => !existing.has(x));
    const toDel = [...existing].filter((x) => !setIds.includes(x));

    if (toAdd.length) {
      const payload = toAdd.map((aid) => ({ member_id: id, activity_id: aid }));
      const { error } = await supabase.from("enrollment").insert(payload);
      if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    }
    if (toDel.length) {
      const { error } = await supabase.from("enrollment").delete().eq("member_id", id).in("activity_id", toDel);
      if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ ok: true });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || "Ukjent feil" }, { status: 500 });
  }
}
