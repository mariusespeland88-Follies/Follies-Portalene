import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createRouteHandlerClient } from "@/lib/supabase/handlers";

// Håndter lagring fra Rediger-siden
export async function PUT(req: Request, { params }: { params: { id: string } }) {
  const { id } = params;
  if (!id) return NextResponse.json({ ok: false, error: "Missing id" }, { status: 400 });

  let payload: any = {};
  try {
    payload = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid JSON" }, { status: 400 });
  }

  // Plukk bare felter vi tillater å oppdatere
  const allowed = new Set([
    "first_name",
    "last_name",
    "email",
    "phone",
    "address",
    "postal_code",
    "city",
    "dob",          // forventes 'YYYY-MM-DD' eller null (frontenden din normaliserer nå)
    "start_date",   // samme
    "start_year",   // number eller null
    "guardian_name",
    "guardian_phone",
    "guardian_email",
    "allergies",
    "medical_info",
    "internal_notes",
    "archived",
    "avatar_url",   // public URL fra Storage (ikke blob:)
  ]);

  const update: Record<string, any> = {};
  for (const [k, v] of Object.entries(payload || {})) {
    if (allowed.has(k)) update[k] = v === "" ? null : v;
  }

  // Koble til Supabase med brukersesjonen (cookies)
  const supabase = createRouteHandlerClient({ cookies });

  const { error } = await supabase
    .from("members")
    .update(update)
    .eq("id", id);

  if (error) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 400 });
  }

  return NextResponse.json({ ok: true, id });
}
