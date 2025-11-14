import { NextResponse } from "next/server";
import { getSupabaseServiceRoleClient } from "@/lib/supabase/server";

function mapGuest(row: any) {
  return {
    id: row.id,
    activity_id: row.activity_id,
    first_name: row.first_name,
    last_name: row.last_name,
    phone: row.phone,
    email: row.email,
    is_norwegian: row.is_norwegian,
    notes: row.notes,
    present: row.present,
    present_marked_at: row.present_marked_at,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const activityId = searchParams.get("activityId");
  if (!activityId) {
    return NextResponse.json(
      { error: "activityId er påkrevd" },
      { status: 400 }
    );
  }

  const supabase = getSupabaseServiceRoleClient();
  if (!supabase) {
    return NextResponse.json([], { status: 200 });
  }

  const { data: guests, error } = await supabase
    .from("activity_guests")
    .select("*")
    .eq("activity_id", activityId)
    .order("last_name", { ascending: true })
    .order("first_name", { ascending: true });

  if (error) {
    return NextResponse.json(
      { error: error.message },
      { status: 500 }
    );
  }

  const guestList = (guests ?? []) as any[];
  const guestIds = guestList.map((g) => g.id);

  let childrenMap: Record<string, any[]> = {};
  if (guestIds.length > 0) {
    const { data: children, error: childErr } = await supabase
      .from("activity_guest_children")
      .select("*")
      .in("guest_id", guestIds);

    if (childErr) {
      return NextResponse.json(
        { error: childErr.message },
        { status: 500 }
      );
    }

    const childRows = (children ?? []) as any[];
    childrenMap = childRows.reduce<Record<string, any[]>>((acc, child) => {
      const gid = String(child.guest_id);
      if (!acc[gid]) acc[gid] = [];
      acc[gid].push(child);
      return acc;
    }, {});
  }

  const payload = guestList.map((guest) => {
    const gid = String(guest.id);
    const childRows = (childrenMap[gid] || []) as any[];
    return {
      ...mapGuest(guest),
      children: childRows.map((child) => ({
        id: child.id,
        guest_id: child.guest_id,
        first_name: child.first_name,
        age: child.age,
        gender: child.gender,
        notes: child.notes,
        created_at: child.created_at,
      })),
    };
  });

  return NextResponse.json(payload);
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const {
      activityId,
      firstName,
      lastName,
      phone,
      email,
      isNorwegian,
      notes,
    } = body ?? {};

    if (!activityId || !firstName || !lastName || !phone) {
      return NextResponse.json(
        { error: "Mangler påkrevde felt" },
        { status: 400 }
      );
    }

    const supabase = getSupabaseServiceRoleClient();
    if (!supabase) {
      return NextResponse.json(
        { error: "Supabase er ikke konfigurert" },
        { status: 500 }
      );
    }
    const { data, error } = await supabase
      .from("activity_guests")
      .insert({
        activity_id: activityId,
        first_name: firstName,
        last_name: lastName,
        phone,
        email,
        is_norwegian: typeof isNorwegian === "boolean" ? isNorwegian : null,
        notes,
      })
      .select()
      .single();

    if (error) {
      return NextResponse.json(
        { error: error.message },
        { status: 500 }
      );
    }

    return NextResponse.json(mapGuest(data));
  } catch (error: any) {
    return NextResponse.json(
      { error: error?.message || "Ukjent feil" },
      { status: 500 }
    );
  }
}
