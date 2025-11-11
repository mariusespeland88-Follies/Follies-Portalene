import { NextResponse } from "next/server";
import { createClient as createAdminClient } from "@supabase/supabase-js";

// Kjører i Node (ikke edge) slik at Service Role kan brukes trygt
export const runtime = "nodejs";

type Body = {
  first_name?: string;
  last_name?: string;
  email: string;
  phone?: string;
  avatar_url?: string;
  asAdmin?: boolean;
};

/**
 * POST /api/admin/create-leader
 * - Idempotent opprett/oppdater av member + roller for gitt e-post.
 * - Setter alltid rollen "leader" og (valgfritt) "admin".
 * - Returnerer { ok: true, member_id } på suksess.
 *
 * Krever:
 *  - NEXT_PUBLIC_SUPABASE_URL
 *  - SUPABASE_SERVICE_ROLE_KEY
 */
export async function POST(req: Request) {
  try {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const serviceRole = process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (!url || !serviceRole) {
      return NextResponse.json(
        { ok: false, error: "Server mangler Supabase-konfig (URL/Service Role)." },
        { status: 500 },
      );
    }

    const admin = createAdminClient(url, serviceRole);

    const body = (await req.json()) as Body;
    const email = String(body.email || "").trim().toLowerCase();
    const first_name = (body.first_name || "").trim();
    const last_name = (body.last_name || "").trim();
    const phone = (body.phone || "").trim();
    const avatar_url = (body.avatar_url || "").trim();
    const asAdmin = !!body.asAdmin;

    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return NextResponse.json({ ok: false, error: "Ugyldig e-post." }, { status: 400 });
    }

    // 1) Finn/lag medlem i 'members'
    let member_id: string | null = null;

    {
      const { data: found, error: findErr } = await admin
        .from("members")
        .select("id")
        .ilike("email", email)
        .limit(1);

      if (findErr) {
        return NextResponse.json({ ok: false, error: `DB-feil (members lookup): ${findErr.message}` }, { status: 500 });
      }

      if (found && found.length > 0) {
        member_id = String(found[0].id);
        // Oppdater eventuelle felter vi har fått inn
        const patch: Record<string, any> = {};
        if (first_name) patch.first_name = first_name;
        if (last_name) patch.last_name = last_name;
        if (phone) patch.phone = phone;
        if (avatar_url) patch.avatar_url = avatar_url;

        if (Object.keys(patch).length > 0) {
          const { error: updErr } = await admin.from("members").update(patch).eq("id", member_id);
          if (updErr) {
            return NextResponse.json({ ok: false, error: `DB-feil (members update): ${updErr.message}` }, { status: 500 });
          }
        }
      } else {
        const insertRow: Record<string, any> = {
          email,
          first_name: first_name || null,
          last_name: last_name || null,
          phone: phone || null,
          avatar_url: avatar_url || null,
        };
        const { data: ins, error: insErr } = await admin
          .from("members")
          .insert(insertRow)
          .select("id")
          .single();

        if (insErr || !ins) {
          return NextResponse.json({ ok: false, error: `DB-feil (members insert): ${insErr?.message || "ukjent"}` }, { status: 500 });
        }
        member_id = String(ins.id);
      }
    }

    // 2) Sørg for roller i 'member_roles'
    {
      // Hent eksisterende roller
      const { data: rolesNow, error: rolesErr } = await admin
        .from("member_roles")
        .select("role")
        .eq("member_id", member_id);

      if (rolesErr) {
        return NextResponse.json({ ok: false, error: `DB-feil (roles lookup): ${rolesErr.message}` }, { status: 500 });
      }

      const have = new Set<string>((rolesNow ?? []).map((r: any) => String(r.role).toLowerCase()));
      const needed = new Set<string>(["member", "leader", ...(asAdmin ? ["admin"] : [])]);

      const toInsert = Array.from(needed).filter((r) => !have.has(r));
      if (toInsert.length > 0) {
        const rows = toInsert.map((r) => ({ member_id, role: r }));
        const { error: insRoleErr } = await admin.from("member_roles").insert(rows);
        if (insRoleErr) {
          return NextResponse.json({ ok: false, error: `DB-feil (roles insert): ${insRoleErr.message}` }, { status: 500 });
        }
      }
    }

    // 3) (Valgfritt) Sørg for at Auth-bruker finnes – best effort, ikke kritisk
    //    Vi prøver å finne brukeren i Auth. Hvis ikke finnes, lar vi det være – du kan logge inn via /login (magic link).
    try {
      const { data: authUser } = await admin.auth.admin.getUserByEmail(email);
      if (!authUser?.user) {
        // Du kan alternativt invitere opprettes her:
        // await admin.auth.admin.inviteUserByEmail(email);
        // Men vi lar dette være opt-in/manuel for nå.
      }
    } catch {
      // ignorer
    }

    return NextResponse.json({ ok: true, member_id }, { status: 200 });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message || "Ukjent serverfeil." }, { status: 500 });
  }
}
