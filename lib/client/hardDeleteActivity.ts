export type HardDeleteOpts = { redirectToList?: boolean };

const LS_ACT_V1 = "follies.activities.v1";
const LS_ACT_OLD = "follies.activities";
const LS_COVERS = "follies.activityCovers.v1";
const LS_SESS = "follies.activitySessions.v1";
const LS_CAL = "follies.calendar.v1";
const LS_PERMS_V1 = "follies.perms.v1";

const safeJSON = <T,>(s: string | null): T | null => { try { return s ? (JSON.parse(s) as T) : null; } catch { return null; } };

function removeFromArrayStore<T extends { id?: string }>(key: string, id: string) {
  const arr = safeJSON<T[]>(localStorage.getItem(key)) ?? [];
  const next = arr.filter((x) => String((x as any)?.id ?? "") !== String(id));
  localStorage.setItem(key, JSON.stringify(next));
}

function removeFromCovers(id: string) {
  const covers = safeJSON<Record<string, any>>(localStorage.getItem(LS_COVERS)) ?? {};
  if (covers[id]) {
    delete covers[id];
    localStorage.setItem(LS_COVERS, JSON.stringify(covers));
  }
}

function removeSessions(id: string) {
  const sess = safeJSON<Record<string, any[]>>(localStorage.getItem(LS_SESS)) ?? {};
  if (sess[id]) {
    delete sess[id];
    localStorage.setItem(LS_SESS, JSON.stringify(sess));
  }
}

function removeCalendarEntries(id: string) {
  const cal = safeJSON<any[]>(localStorage.getItem(LS_CAL)) ?? [];
  const next = cal.filter((e) => String(e?.activity_id ?? "") !== String(id));
  localStorage.setItem(LS_CAL, JSON.stringify(next));
}

function removePermsForActivity(id: string) {
  const raw = safeJSON<any>(localStorage.getItem(LS_PERMS_V1)) ?? null;
  if (!raw) return;
  let changed = false;

  if (raw.perOffer && typeof raw.perOffer === "object") {
    if (raw.perOffer[id]) { delete raw.perOffer[id]; changed = true; }
  }
  if (raw.byUser && typeof raw.byUser === "object") {
    for (const [uid, amap] of Object.entries<any>(raw.byUser)) {
      if (amap && typeof amap === "object" && amap[id]) { delete amap[id]; changed = true; }
    }
  }
  if (Array.isArray(raw?.entries)) {
    raw.entries = raw.entries.filter((r: any) => String(r?.activityId ?? "") !== String(id));
    changed = true;
  }
  if (Array.isArray(raw)) {
    const next = raw.filter((r: any) => String(r?.activityId ?? "") !== String(id));
    if (next.length !== raw.length) {
      localStorage.setItem(LS_PERMS_V1, JSON.stringify(next));
      return;
    }
  }
  if (changed) localStorage.setItem(LS_PERMS_V1, JSON.stringify(raw));
}

export async function hardDeleteActivity(activityId: string, opts: HardDeleteOpts = {}) {
  // 1) DB: hard delete via admin-API
  const res = await fetch("/api/admin/activities/hard-delete", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ activityId }),
  });
  const j = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(j?.error || "Kunne ikke slette aktiviteten i databasen");

  // 2) LocalStorage speil
  removeFromArrayStore(LS_ACT_V1, activityId);
  removeFromArrayStore(LS_ACT_OLD, activityId);
  removeFromCovers(activityId);
  removeSessions(activityId);
  removeCalendarEntries(activityId);
  removePermsForActivity(activityId);

  // 3) Navigasjon (valgfritt)
  if (opts.redirectToList) {
    window.location.href = "/activities";
  }
}
