import { NextResponse } from "next/server";

import { getSupabaseServiceRoleClient } from "@/lib/supabase/server";

const ACTIVITY_COLUMNS = [
  "id",
  "name",
  "type",
  "season",
  "weekday",
  "capacity",
  "description",
  "archived",
  "start_date",
  "end_date",
  "has_guests",
  "has_attendance",
  "has_volunteers",
  "has_tasks",
].join(",");

const LOOKUP_COLUMNS = ["id", "code", "slug", "legacy_id"];

type ActivityFetchResult = { data: any | null; error: string | null };

async function fetchActivityByIdentifier(
  identifier: string
): Promise<ActivityFetchResult> {
  const client = getSupabaseServiceRoleClient();
  if (!client) return { data: null, error: "Supabase er ikke konfigurert" };
  const supabase = client as any;

  for (const column of LOOKUP_COLUMNS) {
    const { data, error } = await supabase
      .from("activities")
      .select(ACTIVITY_COLUMNS)
      .eq(column as any, identifier)
      .maybeSingle();

    if (error) {
      const message = `${error.message ?? ""} ${error.details ?? ""}`.toLowerCase();
      if (message.includes("column") && message.includes("does not exist")) {
        // Column not present in schema – try next candidate.
        continue;
      }
      return {
        data: null,
        error: error.message || "Kunne ikke hente aktiviteten",
      };
    }

    if (data) {
      return { data, error: null };
    }
  }

  return { data: null, error: null };
}

export async function GET(_req: Request, { params }: { params: { id: string } }) {
  const identifier = params.id;
  if (!identifier) {
    return NextResponse.json({ error: "Mangler aktivitets-ID" }, { status: 400 });
  }

  const { data, error } = await fetchActivityByIdentifier(identifier);
  if (error) {
    return NextResponse.json({ error }, { status: 500 });
  }

  return NextResponse.json(data ?? null);
}

export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  const identifier = params.id;
  if (!identifier) {
    return NextResponse.json({ error: "Mangler aktivitets-ID" }, { status: 400 });
  }

  const body = await req.json();
  const allowed = [
    "name",
    "type",
    "season",
    "weekday",
    "capacity",
    "description",
    "archived",
    "start_date",
    "end_date",
    "has_guests",
    "has_attendance",
    "has_volunteers",
    "has_tasks",
  ];
  const payload: Record<string, any> = {};
  for (const k of allowed) if (k in body) payload[k] = body[k];

  const client = getSupabaseServiceRoleClient();
  if (!client) {
    return NextResponse.json(
      { error: "Supabase er ikke konfigurert" },
      { status: 500 }
    );
  }

  const { data: existing, error: lookupError } = await fetchActivityByIdentifier(
    identifier
  );
  if (lookupError) {
    return NextResponse.json({ error: lookupError }, { status: 500 });
  }
  if (!existing) {
    return NextResponse.json(
      { error: "Fant ikke aktiviteten" },
      { status: 404 }
    );
  }

  const supabase = client as any;

  const { data, error } = await supabase
    .from("activities")
    .update(payload)
    .eq("id", existing.id)
    .select(ACTIVITY_COLUMNS)
    .maybeSingle();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json(data ?? existing);
}

export async function DELETE(_req: Request, { params }: { params: { id: string } }) {
  const identifier = params.id;
  if (!identifier) {
    return NextResponse.json({ error: "Mangler aktivitets-ID" }, { status: 400 });
  }

  const client = getSupabaseServiceRoleClient();
  if (!client) {
    return NextResponse.json(
      { error: "Supabase er ikke konfigurert" },
      { status: 500 }
    );
  }

  const { data: existing, error } = await fetchActivityByIdentifier(identifier);
  if (error) {
    return NextResponse.json({ error }, { status: 500 });
  }
  if (!existing) {
    return NextResponse.json(
      { error: "Fant ikke aktiviteten" },
      { status: 404 }
    );
  }

  const supabase = client as any;

  const { error: updateError } = await supabase
    .from("activities")
    .update({ archived: true })
    .eq("id", existing.id);

  if (updateError) {
    return NextResponse.json({ error: updateError.message }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}
