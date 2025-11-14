// lib/activity/saveActivityDBFirst.ts
"use client";
import { createClientComponentClient } from "@/lib/supabase/browser";

const LS_ACT_V1 = "follies.activities.v1";
const LS_ACT_OLD = "follies.activities";

export type NewActivity = { name: string; type: "offer" | "event"; archived?: boolean };

export async function saveActivityDBFirst(activity: NewActivity) {
  const supabase = createClientComponentClient();
  const { data: sess } = await supabase.auth.getSession();
  if (!sess?.session) throw new Error("Du er ikke innlogget");

  const payload = {
    name: activity.name,
    type: activity.type,
    archived: !!activity.archived,
  };

  const { data, error } = await supabase
    .from("activities")
    .insert(payload)
    .select("id, name, type, archived, created_at")
    .single();

  if (error) throw error;

  // Speil til localStorage etter DB-suksess
  const list = JSON.parse(localStorage.getItem(LS_ACT_V1) || "[]");
  const merged = [{ ...data }, ...list];
  localStorage.setItem(LS_ACT_V1, JSON.stringify(merged));
  localStorage.setItem(LS_ACT_OLD, JSON.stringify(merged));

  return data; // { id, name, type, archived, created_at }
}
