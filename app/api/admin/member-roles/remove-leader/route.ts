import { NextResponse } from "next/server";
import { getSupabaseServiceRoleClient } from "@/lib/supabase/server";
import { requireLeader } from "@/lib/authz/apiAuth";

export const runtime = "nodejs";

const LEADER_ROLE_VALUES = ["leader", "leder", "staff"];
const LEADER_ENROLLMENT_VALUES = ["leader", "leder"];

export async function POST(req: Request) {
  try {
    const auth = await requireLeader(req);
    if (!auth.ok) return auth.response;

    const body = await req.json().catch(() => ({}));
    const memberId = String(body?.memberId ?? body?.member_id ?? "").trim();
    if (!memberId) {
      return NextResponse.json(
        { ok: false, error: "Mangler memberId." },
        { status: 400 }
      );
    }

    const db = getSupabaseServiceRoleClient();
    if (!db) {
      return NextResponse.json(
        { ok: false, error: "Service role client mangler." },
        { status: 500 }
      );
    }

    const { error: deleteRoleErr } = await db
      .from("member_roles")
      .delete()
      .eq("member_id", memberId)
      .in("role", LEADER_ROLE_VALUES);

    if (deleteRoleErr) {
      return NextResponse.json(
        { ok: false, error: deleteRoleErr.message },
        { status: 500 }
      );
    }

    // Gjør personen til "vanlig medlem" i alle aktiviteter.
    const { data: demotedRows, error: demoteErr } = await db
      .from("enrollments")
      .update({ role: "participant" })
      .eq("member_id", memberId)
      .in("role", LEADER_ENROLLMENT_VALUES)
      .select("id");

    if (demoteErr) {
      return NextResponse.json(
        { ok: false, error: demoteErr.message },
        { status: 500 }
      );
    }

    // Sikre at "member" finnes.
    const { data: currentRoles, error: roleReadErr } = await db
      .from("member_roles")
      .select("role")
      .eq("member_id", memberId);

    if (roleReadErr) {
      return NextResponse.json(
        { ok: false, error: roleReadErr.message },
        { status: 500 }
      );
    }

    const hasMemberRole = (currentRoles ?? []).some(
      (row: any) => String(row?.role ?? "").toLowerCase() === "member"
    );

    if (!hasMemberRole) {
      const { error: memberInsertErr } = await db
        .from("member_roles")
        .insert({ member_id: memberId, role: "member" });
      if (memberInsertErr) {
        return NextResponse.json(
          { ok: false, error: memberInsertErr.message },
          { status: 500 }
        );
      }
    }

    return NextResponse.json({
      ok: true,
      memberId,
      demotedEnrollments: Array.isArray(demotedRows) ? demotedRows.length : 0,
    });
  } catch (e: any) {
    return NextResponse.json(
      { ok: false, error: e?.message || "Ukjent serverfeil." },
      { status: 500 }
    );
  }
}
