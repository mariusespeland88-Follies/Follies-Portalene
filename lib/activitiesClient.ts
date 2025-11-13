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
  [k: string]: any;
};

export type Activity = {
  id: string;
  name: string;
  type: string;
  archived?: boolean;
  [k: string]: any;
};

// Enkel, generisk type for aktiviteter (kan snevres inn senere)
export type ActivityType = string;

const LS_KEY = "follies.activities.v1";
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
  const found = all.find((a) => String(a.id) === String(id)) ?? null;
  return found;
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

  const idx = current.findIndex((x) => String(x.id) === String(id));
  const next: Activity = {
    ...a,
    id, // sørg for at id settes eksplisitt
    name: (a.name ?? "").toString(),
    type: (a.type ?? "").toString(),
    archived: a.archived ?? false,
  };

  if (idx >= 0) {
    current[idx] = next;
  } else {
    current.push(next);
  }

  saveAllToLocalStorage(current);
  return next;
}
