// lib/activity/saveActivityDBFirst.ts
"use client";
import { createClientComponentClient } from "@/lib/supabase/browser";

const LS_ACT_V1 = "follies.activities.v1";
const LS_ACT_OLD = "follies.activities";

export type NewActivity = {
  name: string;
  type: "offer" | "event";
  archived?: boolean;
  has_participants?: boolean;
  has_leaders?: boolean;
  has_sessions?: boolean;
  has_files?: boolean;
  has_messages?: boolean;
  has_guests?: boolean;
  has_attendance?: boolean;
  has_volunteers?: boolean;
  has_tasks?: boolean;
};

export async function saveActivityDBFirst(activity: NewActivity) {
  const supabase = createClientComponentClient();
  const { data: sess } = await supabase.auth.getSession();
  if (!sess?.session) throw new Error("Du er ikke innlogget");

  const payload = {
    name: activity.name,
    type: activity.type,
    archived: !!activity.archived,
    has_participants: activity.has_participants ?? true,
    has_leaders: activity.has_leaders ?? true,
    has_sessions: activity.has_sessions ?? true,
    has_files: activity.has_files ?? true,
    has_messages: activity.has_messages ?? true,
    has_guests: !!activity.has_guests,
    has_attendance: !!activity.has_attendance,
    has_volunteers: !!activity.has_volunteers,
    has_tasks: !!activity.has_tasks,
  };

  const { data, error } = await supabase
    .from("activities")
    .insert(payload)
    .select(
      "id, name, type, archived, created_at, has_participants, has_leaders, has_sessions, has_files, has_messages, has_guests, has_attendance, has_volunteers, has_tasks"
    )
    .single();

  if (error) throw error;

  // Speil til localStorage etter DB-suksess
  const list = JSON.parse(localStorage.getItem(LS_ACT_V1) || "[]");
  const merged = [{ ...data }, ...list];
  localStorage.setItem(LS_ACT_V1, JSON.stringify(merged));
  localStorage.setItem(LS_ACT_OLD, JSON.stringify(merged));

  return data; // { id, name, type, archived, created_at }
}
