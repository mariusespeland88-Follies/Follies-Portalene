"use client";

import { createClientComponentClient } from "@supabase/auth-helpers-nextjs";

export type Activity = {
  id: string;
  name: string;
  type: "offer" | "event" | string;
  archived?: boolean;
  start_date?: string | null;
  end_date?: string | null;
  created_at?: string;
  updated_at?: string;
  [key: string]: any;
};

type AnyObj = Record<string, any>;
const LS_ACT_V1 = "follies.activities.v1";
const LS_ACT_OLD = "follies.activities";

const safeJSON = <T,>(s: string | null): T | null => { try { return s ? (JSON.parse(s) as T) : null; } catch { return null; } };

function readAllLS(): Activity[] {
  const v1 = safeJSON<Activity[]>(localStorage.getItem(LS_ACT_V1)) ?? [];
  const old = safeJSON<Activity[]>(localStorage.getItem(LS_ACT_OLD)) ?? [];
  const map = new Map<string, Activity>();
  [...v1, ...old].forEach(a => {
    const id = String((a as any)?.id ?? (a as any)?.uuid ?? (a as any)?._id ?? "");
    if (!id) return;
    if (!map.has(id)) map.set(id, { ...a, id });
  });
  return Array.from(map.values());
}

export async function fetchActivity(id: string): Promise<Activity | null> {
  try {
    const supabase = createClientComponentClient();
    const { data: sess } = await supabase.auth.getSession();
    if (sess?.session) {
      const { data } = await supabase
        .from("activities")
        .select("id,name,type,archived,created_at,updated_at,start_date,end_date")
        .eq("id", id)
        .maybeSingle(); // <- kaster ikke
      if (data) {
        return {
          id: String(data.id),
          name: String(data.name ?? ""),
          type: (data.type as any) ?? "offer",
          archived: !!data.archived,
          start_date: (data as any)?.start_date ?? null,
          end_date: (data as any)?.end_date ?? null,
          created_at: (data as any)?.created_at ?? undefined,
          updated_at: (data as any)?.updated_at ?? undefined,
        };
      }
    }
  } catch { /* fallthrough */ }

  // LS-fallback
  const all = readAllLS();
  return all.find(a => String(a.id) === String(id)) ?? null;
}

export async function fetchActivities(): Promise<{ data: Activity[]; source: "db" | "ls" | "mixed" }> {
  const lsAll = readAllLS();
  let dbAll: Activity[] = [];
  let usedDB = false;

  try {
    const supabase = createClientComponentClient();
    const { data: sess } = await supabase.auth.getSession();
    if (sess?.session) {
      const { data } = await supabase
        .from("activities")
        .select("id,name,type,archived,created_at,updated_at,start_date,end_date");
      if (data) {
        usedDB = true;
        dbAll = (data ?? []).map(d => ({
          id: String(d.id),
          name: String(d.name ?? ""),
          type: (d.type as any) ?? "offer",
          archived: !!d.archived,
          start_date: (d as any)?.start_date ?? null,
          end_date: (d as any)?.end_date ?? null,
          created_at: (d as any)?.created_at ?? undefined,
          updated_at: (d as any)?.updated_at ?? undefined,
        }));
      }
    }
  } catch { /* ignore */ }

  if (!usedDB) return { data: lsAll, source: "ls" };

  // Merge DB + LS (DB prioritet)
  const map = new Map<string, Activity>();
  dbAll.forEach(a => map.set(a.id, a));
  lsAll.forEach(a => { if (!map.has(a.id)) map.set(a.id, a); });

  return { data: Array.from(map.values()), source: "mixed" };
}
