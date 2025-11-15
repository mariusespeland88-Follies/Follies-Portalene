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
  const normalized: Activity = {
    ...(row as Record<string, any>),
    id: String(rawId),
    name: String(row.name ?? ""),
    type: String(row.type ?? ""),
    archived: row.archived ?? false,
    has_guests:
      typeof row.has_guests === "boolean" ? row.has_guests : Boolean(row.has_guests),
    has_attendance:
      typeof row.has_attendance === "boolean" ? row.has_attendance : Boolean(row.has_attendance),
    has_volunteers:
      typeof row.has_volunteers === "boolean" ? row.has_volunteers : Boolean(row.has_volunteers),
    has_tasks:
      typeof row.has_tasks === "boolean" ? row.has_tasks : Boolean(row.has_tasks),
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

  // Ny nøkkel først
  const fromNew = safeJSON<Activity[]>(localStorage.getItem(LS_KEY));
  if (Array.isArray(fromNew)) return fromNew;

  // Gammel fallback-nøkkel
  const fromOld = safeJSON<Activity[]>(localStorage.getItem(LS_FALLBACK_KEY));
  if (Array.isArray(fromOld)) return fromOld;

  return [];
}

function saveAllToLocalStorage(list: Activity[]): void {
  if (!hasWindow()) return;
  localStorage.setItem(LS_KEY, JSON.stringify(list));
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

  const hasGuestsValue =
    typeof a.has_guests === "boolean"
      ? a.has_guests
      : typeof (a as any).hasGuests === "boolean"
      ? (a as any).hasGuests
      : false;
  const hasAttendanceValue =
    typeof a.has_attendance === "boolean"
      ? a.has_attendance
      : typeof (a as any).hasAttendance === "boolean"
      ? (a as any).hasAttendance
      : false;
  const hasVolunteersValue =
    typeof a.has_volunteers === "boolean"
      ? a.has_volunteers
      : typeof (a as any).hasVolunteers === "boolean"
      ? (a as any).hasVolunteers
      : false;
  const hasTasksValue =
    typeof a.has_tasks === "boolean"
      ? a.has_tasks
      : typeof (a as any).hasTasks === "boolean"
      ? (a as any).hasTasks
      : false;

  const idx = current.findIndex((x) => String(x.id) === String(id));
  const next: Activity = {
    ...a,
    id, // sørg for at id settes eksplisitt
    name: (a.name ?? "").toString(),
    type: (a.type ?? "").toString(),
    archived: a.archived ?? false,
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
