import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const runtime = "nodejs";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const db = createClient(supabaseUrl, serviceRoleKey);

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const email = String(body?.email || "").trim();
    const displayName = String(body?.displayName || "").trim(); // NYTT: navn fra dashboard
    const candidateActivityIds: string[] = Array.isArray(body?.candidateActivityIds)
      ? body.candidateActivityIds.map((s: any) => String(s))
      : [];

    if (!email) {
      return NextResponse.json({ ok: false, error: "Missing email" }, { status: 400 });
    }

    // 1) Finn via e-post (case-insensitiv)
    const { data: byEmail } = await db
      .from("members")
      .select("id, email")
      .ilike("email", email)
      .maybeSingle();

    if (byEmail?.id) {
      return NextResponse.json({ ok: true, memberId: byEmail.id, matched: "email" });
    }

    // 2) Prøv å finne via NAVN om vi har det (bruk fornavn/etternavn)
    let nameFirst = "";
    let nameLast = "";
    if (displayName) {
      const parts = displayName
        .split(/\s+/)
        .map((s) => s.trim())
        .filter(Boolean);
      if (parts.length >= 2) {
        nameFirst = parts[0];
        nameLast = parts.slice(1).join(" ");
      } else if (parts.length === 1) {
        nameFirst = parts[0];
      }
    }

    if (nameFirst) {
      // eksakt (case-insensitiv) på fornavn/etternavn
      const { data: byName } = await db
        .from("members")
        .select("id, email, first_name, last_name")
        .ilike("first_name", nameFirst)
        .ilike("last_name", nameLast || "%")
        .limit(5);

      if (Array.isArray(byName) && byName.length) {
        // velg en kandidat som allerede er brukt i enrollments (hvis mulig)
        let chosen = byName[0];
        if (candidateActivityIds.length) {
          const ids = candidateActivityIds;
          for (const cand of byName) {
            const { data: used } = await db
              .from("enrollments")
              .select("id")
              .eq("member_id", cand.id)
              .in("activity_id", ids)
              .limit(1);
            if (Array.isArray(used) && used.length) {
              chosen = cand;
              break;
            }
          }
        }
        // Sett e-post hvis den mangler eller er tom/annen casing
        if (!chosen.email || chosen.email.toLowerCase() !== email.toLowerCase()) {
          await db.from("members").update({ email }).eq("id", chosen.id);
        }
        return NextResponse.json({ ok: true, memberId: chosen.id, matched: "name" });
      }
    }

    // 3) Fall-back: forsøk via enrollments i kandidat-aktiviteter (gjenbruk første treff)
    if (candidateActivityIds.length) {
      const { data: viaEnr } = await db
        .from("enrollments")
        .select("member_id, members!inner(id, email)")
        .in("activity_id", candidateActivityIds)
        .limit(1);

      const mId = Array.isArray(viaEnr) && viaEnr.length
        ? String(viaEnr[0].member_id || viaEnr[0].members?.id)
        : null;

      if (mId) {
        // Sett e-post hvis mangler/ulik
        const { data: mRow } = await db.from("members").select("email").eq("id", mId).maybeSingle();
        if (!mRow?.email || mRow.email.toLowerCase() !== email.toLowerCase()) {
          await db.from("members").update({ email }).eq("id", mId);
        }
        return NextResponse.json({ ok: true, memberId: mId, matched: "enrollment" });
      }
    }

    // 4) Opprett ny member
    const toInsert: any = { email };
    if (nameFirst) toInsert.first_name = nameFirst;
    if (nameLast) toInsert.last_name = nameLast;

    const { data: created, error: cErr } = await db
      .from("members")
      .insert(toInsert)
      .select("id")
      .single();
    if (cErr) throw cErr;

    return NextResponse.json({ ok: true, memberId: created.id, matched: "created" });
  } catch (err: any) {
    return NextResponse.json({ ok: false, error: err?.message ?? "Unknown error" }, { status: 500 });
  }
}
