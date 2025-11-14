import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createRouteHandlerClient } from "@/lib/supabase/handlers";

function toNull(s: any) {
  return typeof s === "string" && s.trim() === "" ? null : s;
}

export async function POST(req: Request) {
  let body: any = {};
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid JSON" }, { status: 400 });
  }

  // Tillatte felter ved opprettelse
  const insertable: Record<string, any> = {
    id: body.id || null, // valgfritt – hvis du genererer id på klient
    first_name: toNull(body.first_name),
    last_name: toNull(body.last_name),
    email: toNull(body.email),
    phone: toNull(body.phone),
    address: toNull(body.address),
    postal_code: toNull(body.postal_code),
    city: toNull(body.city),
    dob: toNull(body.dob),             // forventes 'YYYY-MM-DD' eller null
    start_date: toNull(body.start_date),
    start_year: body.start_year ?? null,
    guardian_name: toNull(body.guardian_name),
    guardian_phone: toNull(body.guardian_phone),
    guardian_email: toNull(body.guardian_email),
    allergies: toNull(body.allergies),
    medical_info: toNull(body.medical_info),
    internal_notes: toNull(body.internal_notes),
    archived: !!body.archived,
    avatar_url: toNull(body.avatar_url), // public URL hvis du lastet opp før opprettelse
  };

  // Fjern undefined-keys
  for (const k of Object.keys(insertable)) {
    if (insertable[k] === undefined) delete insertable[k];
  }

  const supabase = createRouteHandlerClient({ cookies });

  const { data, error } = await supabase
    .from("members")
    .insert([insertable])
    .select("id")
    .single();

  if (error) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 400 });
  }

  return NextResponse.json({ ok: true, id: data.id });
}
