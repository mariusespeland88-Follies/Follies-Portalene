// PATH: app/api/members/[id]/delete/route.ts
import { NextResponse } from "next/server";
import { cookies } from "next/headers";

import { createRouteHandlerClient } from "@/lib/supabase/handlers";
import getServiceRoleClient from "@/lib/supabase/service";

export const runtime = "nodejs";

export async function POST(
  _req: Request,
  { params }: { params: { id: string } }
) {
  const memberId = params?.id ? String(params.id) : "";
  if (!memberId) {
    return NextResponse.json({ ok: false, error: "Mangler id" }, { status: 400 });
  }

  try {
    const cookieStore = cookies;
    const supabase = createRouteHandlerClient({ cookies: cookieStore });
    const {
      data: { session },
    } = await supabase.auth.getSession();

    if (!session) {
      return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
    }

    const admin = getServiceRoleClient();

    try {
      await admin.from("enrollments").delete().eq("member_id", memberId);
    } catch (e) {
      console.error("Feil ved sletting av enrollments:", e);
    }

    try {
      await admin.from("messages").delete().eq("member_id", memberId);
    } catch (e) {
      console.error("Feil ved sletting av messages:", e);
    }

    const { error: delErr } = await admin.from("members").delete().eq("id", memberId);
    if (delErr) {
      return NextResponse.json({ ok: false, error: delErr.message }, { status: 500 });
    }

    return NextResponse.json({ ok: true });
  } catch (err: any) {
    const message = err?.message || "Ukjent feil";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
