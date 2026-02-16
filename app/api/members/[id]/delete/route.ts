// PATH: app/api/members/[id]/delete/route.ts
import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/authz/apiAuth";
import getServiceRoleClient from "@/lib/supabase/service";

export const runtime = "nodejs";

export async function POST(
  req: Request,
  { params }: { params: { id: string } }
) {
  const auth = await requireAdmin(req);
  if (!auth.ok) return auth.response;

  const memberId = params?.id ? String(params.id) : "";
  if (!memberId) {
    return NextResponse.json({ ok: false, error: "Mangler id" }, { status: 400 });
  }

  try {
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
