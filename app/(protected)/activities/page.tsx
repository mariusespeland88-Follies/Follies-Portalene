"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { createClientComponentClient } from "@/lib/supabase/browser";

type AnyObj = Record<string, any>;
type ActivityType = "offer" | "event" | "show";
type Activity = {
  id: string;
  name: string;
  type: ActivityType;
  archived?: boolean;
  slug?: string | null;
  raw?: AnyObj;
  has_guests?: boolean;
  has_attendance?: boolean;
  has_volunteers?: boolean;
  has_tasks?: boolean;
};

const LS_ACT_V1 = "follies.activities.v1";
const LS_ACT_OLD = "follies.activities";
const LS_FILES = "follies.activityFiles.v1";
const LS_COVERS = "follies.activityCovers.v1"; // { [activityId]: { dataUrl, mime, updated_at } }

const safeJSON = <T,>(s: string | null): T | null => { try { return s ? (JSON.parse(s) as T) : null; } catch { return null; } };

function slugify(s: string) {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .replace(/--+/g, "-");
}

const hasWindow = () => typeof window !== "undefined";

const activityIdKey = (obj: AnyObj | null | undefined, fallback: string): string => {
  if (!obj) return fallback;
  const candidate =
    obj.id ??
    obj.uuid ??
    obj._id ??
    obj.activityId ??
    obj.activity_id ??
    obj.slug ??
    obj.slugified ??
    null;
  if (candidate === undefined || candidate === null) return fallback;
  const key = String(candidate).trim();
  return key || fallback;
};

function readActivityStore(): AnyObj[] {
  if (!hasWindow()) return [];
  const v1 = safeJSON<AnyObj[]>(localStorage.getItem(LS_ACT_V1)) ?? [];
  const old = safeJSON<AnyObj[]>(localStorage.getItem(LS_ACT_OLD)) ?? [];
  const map = new Map<string, AnyObj>();
  [...old, ...v1].forEach((item, idx) => {
    const key = activityIdKey(item, `ls-${idx}`);
    map.set(key, coerceActivityFlags(item));
  });
  return Array.from(map.values());
}

function coerceActivityFlags(item: AnyObj | null | undefined): AnyObj {
  const base = { ...(item ?? {}) } as AnyObj;
  base.has_guests = Boolean(item?.has_guests ?? item?.hasGuests ?? false);
  base.has_attendance = Boolean(item?.has_attendance ?? item?.hasAttendance ?? false);
  base.has_volunteers = Boolean(item?.has_volunteers ?? item?.hasVolunteers ?? false);
  base.has_tasks = Boolean(item?.has_tasks ?? item?.hasTasks ?? false);
  return base;
}

function writeActivityStore(list: AnyObj[]): void {
  if (!hasWindow()) return;
  const arr = Array.isArray(list) ? list.map((item) => coerceActivityFlags(item)) : [];
  const json = JSON.stringify(arr);
  localStorage.setItem(LS_ACT_V1, json);
  localStorage.setItem(LS_ACT_OLD, json);
}

function mergeActivityRecords(primary: AnyObj[], fallback: AnyObj[]): AnyObj[] {
  const map = new Map<string, AnyObj>();
  fallback.forEach((item, idx) => {
    const key = activityIdKey(item, `fb-${idx}`);
    map.set(key, coerceActivityFlags(item));
  });
  primary.forEach((item, idx) => {
    const key = activityIdKey(item, `db-${idx}`);
    const prev = map.get(key) || {};
    map.set(key, { ...coerceActivityFlags(prev), ...coerceActivityFlags(item) });
  });
  return Array.from(map.values());
}

function normalizeActivitiesFromRaw(list: AnyObj[]): Activity[] {
  const normalized = list.map((a, idx) => {
    const id = activityIdKey(a, `a-${idx}`);
    const name = a?.name ?? a?.title ?? a?.navn ?? a?.programName ?? `Aktivitet ${id}`;
    const rawType = String(a?.type ?? a?.category ?? a?.kategori ?? "").toLowerCase();

    let type: ActivityType = "offer";
    if (rawType.includes("forest")) type = "show";
    else if (rawType.includes("event") || rawType.includes("konsert") || rawType.includes("åpen") || rawType.includes("open")) type = "event";
    else type = "offer";

    const archived = !!(a?.archived || a?.is_archived || String(a?.status || "").toLowerCase() === "archived");
    const slugSource = a?.slug ?? a?.seo_slug ?? null;
    const slug = slugSource ? String(slugSource) : slugify(name);
    const hasGuests = Boolean(a?.has_guests ?? a?.hasGuests ?? false);
    const hasAttendance = Boolean(a?.has_attendance ?? a?.hasAttendance ?? false);
    const hasVolunteers = Boolean(a?.has_volunteers ?? a?.hasVolunteers ?? false);
    const hasTasks = Boolean(a?.has_tasks ?? a?.hasTasks ?? false);

    return {
      id,
      name,
      type,
      archived,
      slug,
      raw: a,
      has_guests: hasGuests,
      has_attendance: hasAttendance,
      has_volunteers: hasVolunteers,
      has_tasks: hasTasks,
    };
  });

  const map = new Map<string, Activity>();
  for (const entry of normalized) map.set(entry.id, entry);
  return Array.from(map.values());
}

const pickFirst = (obj: AnyObj | null | undefined, keys: string[]): any => {
  if (!obj) return null;
  for (const k of keys) {
    const v = (obj as any)[k];
    if (v !== undefined && v !== null && String(v).trim?.() !== "") return v;
  }
  return null;
};

function firstUrlLike(v: any): string | null {
  if (!v) return null;
  if (typeof v === "string") return v;
  if (Array.isArray(v)) {
    for (const it of v) {
      const u = firstUrlLike(it?.url || it?.src || it?.image || it?.href || it);
      if (u) return u;
    }
  } else if (typeof v === "object") {
    return (
      v.url || v.src || v.image || v.href ||
      firstUrlLike(v.file) || firstUrlLike(v.cover) || firstUrlLike(v.photo) || null
    );
  }
  return null;
}

function readCoverStore(): Record<string, { dataUrl: string; mime: string; updated_at: string }> {
  return safeJSON<Record<string, { dataUrl: string; mime: string; updated_at: string }>>(localStorage.getItem(LS_COVERS)) ?? {};
}

/** Hent cover: prioriter opplastet cover; ellers fallbacks fra aktivitetens egne felt; ellers logo */
function coverOf(a: Activity): string {
  const covers = readCoverStore();
  const coverEntry = covers[a.id];
  if (coverEntry?.dataUrl) return coverEntry.dataUrl;

  const r = a.raw || {};
  const candidates: (string | null)[] = [
    pickFirst(r, ["image_url","imageUrl","image","cover_url","cover","banner_url","poster_url","thumbnail","thumb","picture","photo","hero","img"]),
    firstUrlLike(r.cover),
    firstUrlLike(r.banner),
    firstUrlLike(r.poster),
    firstUrlLike(r.images),
    firstUrlLike(r.media),
  ];
  return candidates.find(Boolean) || "/Images/follies-logo.jpg";
}

export default function ActivitiesPage() {
  const [all, setAll] = useState<Activity[]>([]);
  const [q, setQ] = useState("");
  const [tab, setTab] = useState<ActivityType>("offer");

  const supabase = useMemo(() => createClientComponentClient(), []);

  const refreshFromStorage = useCallback(() => {
    setAll(normalizeActivitiesFromRaw(readActivityStore()));
  }, []);

  useEffect(() => {
    refreshFromStorage();
    const onStorage = (e: StorageEvent) => {
      if ([LS_ACT_V1, LS_ACT_OLD, LS_FILES, LS_COVERS].includes(e.key || "")) {
        refreshFromStorage();
      }
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, [refreshFromStorage]);

  const loadFromSupabase = useCallback(async () => {
    try {
      const { data: sessionData } = await supabase.auth.getSession();
      if (!sessionData?.session) return;

      const { data, error } = await supabase
        .from("activities")
        .select(
          "id, name, type, archived, has_guests, has_attendance, has_volunteers, has_tasks"
        );
      if (error) throw error;

      const rows = Array.isArray(data) ? data : [];
      const normalizedRows = rows.map((row, idx) => ({
        ...row,
        id: activityIdKey(row as AnyObj, `db-${idx}`),
      }));

      const merged = mergeActivityRecords(normalizedRows, readActivityStore());
      writeActivityStore(merged);
      setAll(normalizeActivitiesFromRaw(merged));
    } catch {
      // behold lokal data hvis Supabase ikke svarer
    }
  }, [supabase]);

  useEffect(() => {
    loadFromSupabase();
    const handler = () => loadFromSupabase();
    try { window.addEventListener("follies:auth-sync", handler); } catch {}
    return () => {
      try { window.removeEventListener("follies:auth-sync", handler); } catch {}
    };
  }, [loadFromSupabase]);

  const filtered = useMemo(() => {
    const list = all.filter((a) => a.type === tab && !a.archived);
    const query = q.trim().toLowerCase();
    if (!query) return list;
    return list.filter((a) => a.name.toLowerCase().includes(query));
  }, [all, q, tab]);

  return (
    <div className="mx-auto max-w-6xl px-4 py-8">
      {/* Tittel + søk + Ny */}
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-3xl font-semibold tracking-tight text-black">Aktiviteter</h1>
        <div className="flex items-center gap-2">
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder={`Søk i ${tab === "offer" ? "Tilbud" : tab === "event" ? "Eventer" : "Forestilling"}…`}
            className="w-64 rounded-lg border border-neutral-300 bg-white px-3 py-2 text-[15px] text-neutral-900 placeholder:text-neutral-500 focus:outline-none focus:ring-2 focus:ring-red-600"
          />
          <Link href="/activities/new" className="rounded-lg bg-red-600 px-3.5 py-2 text-sm font-semibold text-white hover:bg-red-700">
            Ny aktivitet
          </Link>
        </div>
      </div>

      {/* Faner: Tilbud / Eventer / Forestilling */}
      <div className="mb-6 flex gap-2">
        {([
          ["offer", "Tilbud"],
          ["event", "Eventer"],
          ["show", "Forestilling"],
        ] as const).map(([key, label]) => (
          <button
            key={key}
            onClick={() => setTab(key)}
            className={`rounded-lg px-3.5 py-2 text-sm font-semibold ring-1 ${
              tab === key
                ? "bg-black text-white ring-black"
                : "bg-white text-neutral-900 ring-neutral-300 hover:bg-neutral-100"
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {/* Grid med store bildekort */}
      {filtered.length === 0 ? (
        <div className="rounded-2xl border border-zinc-300 bg-white p-6 text-neutral-800 shadow-md">
          Ingen {tab === "offer" ? "tilbud" : tab === "event" ? "eventer" : "forestilling"} funnet.
        </div>
      ) : (
        <ul className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {filtered.map((a) => {
            const img = coverOf(a);
            return (
              <li
                key={a.id}
                className="group overflow-hidden rounded-2xl border border-zinc-300 bg-white shadow-md transition hover:shadow-lg"
              >
                {/* Bilde (16:9) */}
                <div className="relative">
                  <div className="pt-[56.25%]" />
                  <div className="absolute inset-0">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={img} alt="" className="absolute inset-0 h-full w-full object-cover transition-transform duration-300 group-hover:scale-[1.03]" />
                    <div className="absolute inset-0 bg-gradient-to-t from-black/55 via-black/25 to-black/5" />
                    <div className="absolute left-3 top-3">
                      <span className="rounded-full bg-white/90 px-2.5 py-1 text-[11px] font-semibold text-neutral-900 shadow ring-1 ring-black/10">
                        {a.type === "event" ? "Event" : a.type === "show" ? "Forestilling" : "Tilbud"}
                      </span>
                    </div>
                    <div className="absolute bottom-3 left-3 right-3">
                      <h3 className="line-clamp-2 text-[15px] font-semibold leading-5 text-white drop-shadow">
                        {a.name}
                      </h3>
                    </div>
                  </div>
                </div>

                {/* Handlinger – **Slett** fjernet; bare Åpne/Rediger */}
                <div className="flex items-center justify-end gap-2 p-3">
                  <Link href={`/activities/${a.id}`} className="rounded-lg bg-white px-3 py-1.5 text-sm font-semibold text-neutral-900 ring-1 ring-neutral-300 transition hover:bg-neutral-100">
                    Åpne
                  </Link>
                  <Link href={`/activities/${a.id}/edit`} className="rounded-lg bg-black px-3 py-1.5 text-sm font-semibold text-white transition hover:bg-neutral-800">
                    Rediger
                  </Link>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
