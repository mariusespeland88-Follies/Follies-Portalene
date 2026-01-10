// PATH: app/api/messages/my/route.ts
import { NextResponse } from "next/server";
import { cookies } from "next/headers";

import { createRouteHandlerClient } from "@/lib/supabase/handlers";
import getServiceRoleClient from "@/lib/supabase/service";

export const runtime = "nodejs";

export async function GET() {
  try {
    const cookieStore = cookies;
    const supabase = createRouteHandlerClient({ cookies: cookieStore });
    const {
      data: { session },
    } = await supabase.auth.getSession();

    if (!session) {
      return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
    }

    const email = (session.user.email || "").trim();
    if (!email) {
      return NextResponse.json({ ok: true, messages: [] });
    }

    const admin = getServiceRoleClient();

    const { data: memberRows, error: memberErr } = await admin
      .from("members")
      .select("id")
      .ilike("email", email)
      .limit(1);

    if (memberErr) {
      return NextResponse.json({ ok: false, error: memberErr.message }, { status: 500 });
    }

    const memberId = memberRows?.[0]?.id ? String(memberRows[0].id) : null;
    if (!memberId) {
      return NextResponse.json({ ok: true, messages: [] });
    }

    const { data, error } = await admin
      .from("messages")
      .select("id, member_id, activity_id, scope, target, subject, body, created_at, created_by_name, created_by_email")
      .eq("member_id", memberId)
      .order("created_at", { ascending: false });

    if (error) {
      return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
    }

    return NextResponse.json({ ok: true, messages: data ?? [] });
  } catch (err: any) {
    const message = err?.message || "Unknown error";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
