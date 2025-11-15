import { NextResponse } from "next/server";
import { getSupabaseServiceRoleClient } from "@/lib/supabase/server";

export async function POST(
  request: Request,
  { params }: { params: { id: string } }
) {
  const guestId = params?.id;
  if (!guestId) {
    return NextResponse.json({ error: "Mangler id" }, { status: 400 });
  }

  try {
    const body = await request.json();
    const { firstName, age, gender, notes } = body ?? {};

    if (typeof age !== "number" && typeof age !== "undefined" && age !== null) {
      return NextResponse.json(
        { error: "Alder må være et tall" },
        { status: 400 }
      );
    }

    const supabase = getSupabaseServiceRoleClient();
    if (!supabase) {
      return NextResponse.json({
        id: "placeholder",
        guest_id: guestId,
        first_name: firstName ?? null,
        age: typeof age === "number" ? age : null,
        gender: gender ?? null,
        notes: notes ?? null,
      });
    }
    const { data, error } = await supabase
      .from("activity_guest_children")
      .insert({
        guest_id: guestId,
        first_name: firstName ?? null,
        age: typeof age === "number" ? age : null,
        gender: gender ?? null,
        notes: notes ?? null,
      })
      .select()
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json(data);
  } catch (error: any) {
    return NextResponse.json(
      { error: error?.message || "Ukjent feil" },
      { status: 500 }
    );
  }
}
