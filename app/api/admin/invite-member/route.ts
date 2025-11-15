import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const runtime = "nodejs";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000";

if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
  console.error("[invite-member] Missing Supabase configuration", {
    hasUrl: !!SUPABASE_URL,
    hasKey: !!SERVICE_ROLE_KEY,
  });
}

const supabaseAdmin =
  SUPABASE_URL && SERVICE_ROLE_KEY
    ? createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
        auth: { autoRefreshToken: false, persistSession: false },
      })
    : null;

export async function POST(req: Request) {
  if (!SUPABASE_URL || !SERVICE_ROLE_KEY || !supabaseAdmin) {
    return NextResponse.json(
      { error: "Supabase configuration is missing." },
      { status: 500 }
    );
  }

  try {
    const body = await req.json();
    const email = typeof body?.email === "string" ? body.email.trim() : "";

    if (!email) {
      return NextResponse.json(
        { error: "E-postadresse er påkrevd." },
        { status: 400 }
      );
    }

    const { data, error } = await supabaseAdmin.auth.admin.inviteUserByEmail(email, {
      redirectTo: `${SITE_URL}/login`,
    });

    if (error) {
      console.error("[invite-member] Failed to invite user", error);
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    return NextResponse.json({
      success: true,
      userId: data.user?.id ?? null,
      email,
    });
  } catch (error: any) {
    console.error("[invite-member] Unexpected error", error);
    return NextResponse.json(
      { error: error?.message || "Ukjent feil ved invitasjon." },
      { status: 500 }
    );
  }
}
