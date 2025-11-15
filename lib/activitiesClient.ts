"use client";

// Midlertidig, men funksjonell klient for aktiviteter.
// Bruker localStorage som lagring foreløpig, slik at portalen lever fint
// i både dev og på Vercel. Senere kan vi bytte til ekte Supabase-kall
// uten å endre app-koden som bruker disse funksjonene.

export type ActivityLike = {
  id?: string;
  name?: string;
  type?: string;
  archived?: boolean;
  has_participants?: boolean | null;
  has_leaders?: boolean | null;
  has_sessions?: boolean | null;
  has_files?: boolean | null;
  has_messages?: boolean | null;
  has_guests?: boolean | null;
  has_attendance?: boolean | null;
  has_volunteers?: boolean | null;
  has_tasks?: boolean | null;
  [k: string]: any;
};

export type Activity = {
  id: string;
  name: string;
  type: string;
  archived?: boolean;
  has_participants?: boolean | null;
  has_leaders?: boolean | null;
  has_sessions?: boolean | null;
  has_files?: boolean | null;
  has_messages?: boolean | null;
  has_guests?: boolean | null;
  has_attendance?: boolean | null;
  has_volunteers?: boolean | null;
  has_tasks?: boolean | null;
  [k: string]: any;
};

// Enkel, generisk type for aktiviteter (kan snevres inn senere)
export type ActivityType = string;

const LS_KEY = "follies.activities.v1";

function normalizeActivityRecord(row: any): Activity | null {
  if (!row) return null;
  const rawId = row.id ?? row.uuid ?? row._id ?? row.slug ?? null;
  if (!rawId) return null;
  const boolFromRow = (
    snakeValue: any,
    fallbackKeys: string[],
    defaultValue: boolean
  ): boolean => {
    if (typeof snakeValue === "boolean") return snakeValue;
    if (snakeValue !== undefined && snakeValue !== null) {
      return Boolean(snakeValue);
    }
    for (const key of fallbackKeys) {
      const candidate = (row as any)?.[key];
      if (typeof candidate === "boolean") return candidate;
      if (candidate !== undefined && candidate !== null) {
        return Boolean(candidate);
      }
    }
    return defaultValue;
  };

  const normalized: Activity = {
    ...(row as Record<string, any>),
    id: String(rawId),
    name: String(row.name ?? ""),
    type: String(row.type ?? ""),
    archived: row.archived ?? false,
    has_participants: boolFromRow(row.has_participants, ["hasParticipants"], true),
    has_leaders: boolFromRow(row.has_leaders, ["hasLeaders"], true),
    has_sessions: boolFromRow(row.has_sessions, ["hasSessions"], true),
    has_files: boolFromRow(row.has_files, ["hasFiles"], true),
    has_messages: boolFromRow(row.has_messages, ["hasMessages"], true),
    has_guests: boolFromRow(row.has_guests, ["hasGuests"], false),
    has_attendance: boolFromRow(row.has_attendance, ["hasAttendance"], false),
    has_volunteers: boolFromRow(row.has_volunteers, ["hasVolunteers"], false),
    has_tasks: boolFromRow(row.has_tasks, ["hasTasks"], false),
  };
  return normalized;
}

function upsertLocalActivity(activity: Activity): void {
  if (!hasWindow()) return;
  const current = loadAllFromLocalStorage();
  const idx = current.findIndex((a) => String(a.id) === String(activity.id));
  if (idx >= 0) {
    current[idx] = { ...current[idx], ...activity };
  } else {
    current.push(activity);
  }
  saveAllToLocalStorage(current);
}

const LS_FALLBACK_KEY = "follies.activities";

function dedupeAndNormalize(lists: any[][]): Activity[] {
  const map = new Map<string, Activity>();
  for (const list of lists) {
    for (const entry of list) {
      const normalized = normalizeActivityRecord(entry);
      if (!normalized) continue;
      const prev = map.get(normalized.id) ?? {};
      map.set(normalized.id, { ...prev, ...normalized });
    }
  }
  return Array.from(map.values());
}

function safeJSON<T>(s: string | null): T | null {
  try {
    return s ? (JSON.parse(s) as T) : null;
  } catch {
    return null;
  }
}

function hasWindow(): boolean {
  return typeof window !== "undefined";
}

function loadAllFromLocalStorage(): Activity[] {
  if (!hasWindow()) return [];

  const fromNew = safeJSON<any[]>(localStorage.getItem(LS_KEY)) ?? [];
  const fromOld = safeJSON<any[]>(localStorage.getItem(LS_FALLBACK_KEY)) ?? [];

  return dedupeAndNormalize([fromOld, fromNew]);
}

function saveAllToLocalStorage(list: Activity[]): void {
  if (!hasWindow()) return;
  const normalized = dedupeAndNormalize([Array.isArray(list) ? list : []]);
  const json = JSON.stringify(normalized);
  localStorage.setItem(LS_KEY, json);
  localStorage.setItem(LS_FALLBACK_KEY, json);
}

/**
 * Hent ALLE aktiviteter (fra localStorage inntil vi kobler på DB).
 * Matcher eksisterende bruk: `const res = await fetchActivities(); res.data ...`
 */
export async function fetchActivities(): Promise<{ data: Activity[] }> {
  const data = loadAllFromLocalStorage();
  return { data };
}

/**
 * Hent ÉN aktivitet etter id.
 * Matcher eksisterende bruk: `const a = await fetchActivity(id);`
 * (altså direkte Activity | null, ikke `{ data: ... }` her).
 */
export async function fetchActivity(id: string): Promise<Activity | null> {
  const all = loadAllFromLocalStorage();
  const localHit = all.find((a) => String(a.id) === String(id)) ?? null;

  if (typeof window !== 'undefined') {
    try {
      const res = await fetch(`/api/activities/${encodeURIComponent(id)}`);
      if (res.ok) {
        const json = await res.json();
        const fromDb = normalizeActivityRecord(json);
        if (fromDb) {
          upsertLocalActivity(fromDb);
          return fromDb;
        }
      }
    } catch (err) {
      console.warn('fetchActivity: kunne ikke hente fra API', err);
    }
  }

  return localHit;
}

/**
 * Lagre/oppdater én aktivitet.
 * - Hvis id finnes: oppdaterer eksisterende i localStorage.
 * - Hvis id mangler: lager ny id og pusher inn.
 *
 * Returnerer selve aktiviteten, ikke `{ data: ... }`.
 */
export async function saveActivity(a: ActivityLike): Promise<Activity> {
  const id =
    a.id ??
    (hasWindow() && "crypto" in window
      ? crypto.randomUUID()
      : `${Date.now()}`);

  const current = loadAllFromLocalStorage();

  const normalizedBoolean = (
    primary: any,
    fallbackKeys: string[],
    defaultValue: boolean
  ): boolean => {
    if (typeof primary === "boolean") return primary;
    if (primary !== undefined && primary !== null) return Boolean(primary);
    for (const key of fallbackKeys) {
      const candidate = (a as any)?.[key];
      if (typeof candidate === "boolean") return candidate;
      if (candidate !== undefined && candidate !== null) {
        return Boolean(candidate);
      }
    }
    return defaultValue;
  };

  const hasParticipantsValue = normalizedBoolean(
    a.has_participants,
    ["hasParticipants"],
    true
  );
  const hasLeadersValue = normalizedBoolean(a.has_leaders, ["hasLeaders"], true);
  const hasSessionsValue = normalizedBoolean(
    a.has_sessions,
    ["hasSessions"],
    true
  );
  const hasFilesValue = normalizedBoolean(a.has_files, ["hasFiles"], true);
  const hasMessagesValue = normalizedBoolean(
    a.has_messages,
    ["hasMessages"],
    true
  );
  const hasGuestsValue = normalizedBoolean(a.has_guests, ["hasGuests"], false);
  const hasAttendanceValue = normalizedBoolean(
    a.has_attendance,
    ["hasAttendance"],
    false
  );
  const hasVolunteersValue = normalizedBoolean(
    a.has_volunteers,
    ["hasVolunteers"],
    false
  );
  const hasTasksValue = normalizedBoolean(a.has_tasks, ["hasTasks"], false);

  const idx = current.findIndex((x) => String(x.id) === String(id));
  const next: Activity = {
    ...a,
    id, // sørg for at id settes eksplisitt
    name: (a.name ?? "").toString(),
    type: (a.type ?? "").toString(),
    archived: a.archived ?? false,
    has_participants: hasParticipantsValue,
    has_leaders: hasLeadersValue,
    has_sessions: hasSessionsValue,
    has_files: hasFilesValue,
    has_messages: hasMessagesValue,
    has_guests: hasGuestsValue,
    has_attendance: hasAttendanceValue,
    has_volunteers: hasVolunteersValue,
    has_tasks: hasTasksValue,
  };

  if (idx >= 0) {
    current[idx] = next;
  } else {
    current.push(next);
  }

  saveAllToLocalStorage(current);
  return next;
}
