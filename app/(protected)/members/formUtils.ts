export type Activity = {
  id: string;
  name: string;
  type: "offer" | "event";
  archived?: boolean;
  has_guests?: boolean;
  has_attendance?: boolean;
  has_volunteers?: boolean;
  has_tasks?: boolean;
};

const LS_ACT_V1 = "follies.activities.v1";
const LS_ACT_OLD = "follies.activities";

const safeJSON = <T,>(s: string | null): T | null => {
  try {
    return s ? (JSON.parse(s) as T) : null;
  } catch {
    return null;
  }
};

const normalizeActivityType = (raw: any): "offer" | "event" => {
  const value = String(raw ?? "").toLowerCase();
  const isEvent =
    value.includes("event") ||
    value.includes("konsert") ||
    value.includes("forest") ||
    value.includes("åpen") ||
    value.includes("open");
  return isEvent ? "event" : "offer";
};

export function readActivitiesNormalized(): Activity[] {
  if (typeof window === "undefined") return [];

  const v1 = safeJSON<any[]>(window.localStorage.getItem(LS_ACT_V1)) ?? [];
  const old = safeJSON<any[]>(window.localStorage.getItem(LS_ACT_OLD)) ?? [];
  const merged = [...old, ...v1];

  const normalized = merged.map((entry, index) => {
    const id = String(entry?.id ?? entry?.uuid ?? entry?._id ?? `a-${index}`);
    const name =
      entry?.name ??
      entry?.title ??
      entry?.navn ??
      entry?.programName ??
      `Aktivitet ${id}`;

    const type = normalizeActivityType(entry?.type ?? entry?.category ?? entry?.kategori);
    const archived = !!(
      entry?.archived ||
      entry?.is_archived ||
      String(entry?.status ?? "").toLowerCase() === "archived"
    );

    const flags = activityFlags(entry);

    return {
      id,
      name,
      type,
      archived,
      ...flags,
    } as Activity;
  });

  const map = new Map<string, Activity>();
  for (const activity of normalized) {
    map.set(activity.id, activity);
  }

  return Array.from(map.values()).filter((activity) => !activity.archived);
}

export const INPUT_CLASS =
  "mt-1 w-full rounded-xl border border-neutral-700 bg-neutral-900 px-4 py-2 text-[16px] text-neutral-100 " +
  "placeholder:text-neutral-400 focus:border-red-500 focus:outline-none focus:ring-2 focus:ring-red-500";

export const FILE_INPUT_CLASS =
  "mt-3 block w-full text-base text-neutral-200 file:mr-3 file:rounded-lg file:border-0 file:bg-neutral-800 " +
  "file:px-3 file:py-2 file:text-base file:font-medium file:text-neutral-100 hover:file:bg-neutral-700";

export const MAX_IMAGE_BYTES = 10 * 1024 * 1024;

export const nullIfEmpty = (value: any) =>
  typeof value === "string" && value.trim() === "" ? null : value;

export const numberOrNull = (value: any) => {
  if (value === "" || value === null || value === undefined) return null;
  const num = Number(value);
  return Number.isFinite(num) ? num : null;
};

export const cleanDate = (value: any) => {
  if (!value) return null;
  const str = String(value).trim();
  return /^\d{4}-\d{2}-\d{2}$/.test(str) ? str : null;
};

export const safeHttpUrl = (value: any) => {
  if (!value) return null;
  const str = String(value);
  if (str.startsWith("blob:")) return null;
  return /^https?:\/\//i.test(str) ? str : null;
};

export function mergeActivities(base: Activity[], extra: Activity[]): Activity[] {
  const map = new Map<string, Activity>();
  for (const entry of [...base, ...extra]) {
    const id = String(entry?.id ?? "");
    if (!id) continue;
    map.set(id, {
      id,
      name: entry?.name ?? `Aktivitet ${id}`,
      type: normalizeActivityType(entry?.type),
      archived: !!entry?.archived,
      ...activityFlags(entry),
    });
  }
  return Array.from(map.values()).sort((a, b) => a.name.localeCompare(b.name));
}

function activityFlags(entry: any) {
  return {
    has_guests: Boolean(entry?.has_guests ?? entry?.hasGuests ?? false),
    has_attendance: Boolean(entry?.has_attendance ?? entry?.hasAttendance ?? false),
    has_volunteers: Boolean(entry?.has_volunteers ?? entry?.hasVolunteers ?? false),
    has_tasks: Boolean(entry?.has_tasks ?? entry?.hasTasks ?? false),
  };
}

export type MemberFormState = {
  first_name: string;
  last_name: string;
  email: string;
  phone: string;
  start_year: string;
  start_date: string;
  dob: string;
  address: string;
  postal_code: string;
  city: string;
  guardian_name: string;
  guardian_phone: string;
  guardian_email: string;
  allergies: string;
  medical_info: string;
  internal_notes: string;
  archived: boolean;
  avatar_url: string | null;
};

export const emptyMemberFormState = (): MemberFormState => ({
  first_name: "",
  last_name: "",
  email: "",
  phone: "",
  start_year: "",
  start_date: "",
  dob: "",
  address: "",
  postal_code: "",
  city: "",
  guardian_name: "",
  guardian_phone: "",
  guardian_email: "",
  allergies: "",
  medical_info: "",
  internal_notes: "",
  archived: false,
  avatar_url: null,
});
