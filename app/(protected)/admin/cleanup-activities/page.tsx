"use client";

import { useEffect, useMemo, useState } from "react";
import { createClientComponentClient } from "@supabase/auth-helpers-nextjs";

type AnyObj = Record<string, any>;
type DbActivity = { id: string; name?: string | null; type?: string | null; archived?: boolean | null };

const LS_ACT_V1 = "follies.activities.v1";
const LS_ACT_OLD = "follies.activities";
const LS_COVERS = "follies.activityCovers.v1";
const LS_SESS = "follies.activitySessions.v1";
const LS_CAL = "follies.calendar.v1";
const LS_PERMS_V1 = "follies.perms.v1";

const safeJSON = <T,>(s: string | null): T | null => { try { return s ? (JSON.parse(s) as T) : null; } catch { return null; } };
const S = (v: any) => String(v ?? "");

function readLsActivities(): AnyObj[] {
  const v1 = safeJSON<AnyObj[]>(localStorage.getItem(LS_ACT_V1)) ?? [];
  const old = safeJSON<AnyObj[]>(localStorage.getItem(LS_ACT_OLD)) ?? [];
  // dedup by id
  const map = new Map<string, AnyObj>();
  [...old, ...v1].forEach(a => {
    const id = S(a?.id ?? a?.uuid ?? a?._id);
    if (id) map.set(id, { ...a, id });
  });
  return Array.from(map.values());
}

function removeFromArrayStore<T extends { id?: string }>(key: string, id: string) {
  const arr = safeJSON<T[]>(localStorage.getItem(key)) ?? [];
  const next = arr.filter((x) => S((x as any)?.id ?? "") !== S(id));
  localStorage.setItem(key, JSON.stringify(next));
}

function removeCovers(id: string) {
  const covers = safeJSON<Record<string, any>>(localStorage.getItem(LS_COVERS)) ?? {};
  if (covers[id]) { delete covers[id]; localStorage.setItem(LS_COVERS, JSON.stringify(covers)); }
}
function removeSessions(id: string) {
  const sess = safeJSON<Record<string, any[]>>(localStorage.getItem(LS_SESS)) ?? {};
  if (sess[id]) { delete sess[id]; localStorage.setItem(LS_SESS, JSON.stringify(sess)); }
}
function removeCalendar(id: string) {
  const cal = safeJSON<any[]>(localStorage.getItem(LS_CAL)) ?? [];
  const next = cal.filter((e) => S(e?.activity_id) !== S(id));
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
    raw.entries = raw.entries.filter((r: any) => S(r?.activityId) !== S(id));
    changed = true;
  }
  if (Array.isArray(raw)) {
    const next = raw.filter((r: any) => S(r?.activityId) !== S(id));
    if (next.length !== raw.length) {
      localStorage.setItem(LS_PERMS_V1, JSON.stringify(next));
      return;
    }
  }
  if (changed) localStorage.setItem(LS_PERMS_V1, JSON.stringify(raw));
}

export default function CleanupActivitiesPage() {
  const supabase = createClientComponentClient();

  const [dbActs, setDbActs] = useState<DbActivity[]>([]);
  const [lsActs, setLsActs] = useState<AnyObj[]>([]);
  const [sel, setSel] = useState<Record<string, boolean>>({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      setLoading(true);
      const { data } = await supabase.from("activities").select("id, name, type, archived");
      setDbActs((data ?? []) as DbActivity[]);
      setLsActs(readLsActivities());
      setLoading(false);
    })();
  }, [supabase]);

  const dbIdSet = useMemo(() => new Set(dbActs.map(a => S(a.id))), [dbActs]);
  const ghosts = useMemo(() => lsActs.filter(a => !dbIdSet.has(S(a.id))), [lsActs, dbIdSet]);

  const toggle = (id: string) => setSel(s => ({ ...s, [id]: !s[id] }));
  const allChecked = ghosts.length > 0 && ghosts.every(g => sel[S(g.id)]);
  const someChecked = ghosts.some(g => sel[S(g.id)]);
  const setAll = (on: boolean) => {
    const next: Record<string, boolean> = {};
    ghosts.forEach(g => { next[S(g.id)] = on; });
    setSel(next);
  };

  const removeSelected = () => {
    const ids = ghosts.map(g => S(g.id)).filter(id => sel[id]);
    if (!ids.length) return;
    ids.forEach(id => {
      removeFromArrayStore(LS_ACT_V1, id);
      removeFromArrayStore(LS_ACT_OLD, id);
      removeCovers(id);
      removeSessions(id);
      removeCalendar(id);
      removePermsForActivity(id);
    });
    // refresh list
    setLsActs(readLsActivities());
    setSel({});
  };

  return (
    <main className="mx-auto max-w-5xl px-4 py-8 text-neutral-900">
      <h1 className="text-2xl font-bold">Rydd opp aktiviteter (lokal/DB)</h1>
      {loading ? (
        <div className="mt-4">Laster…</div>
      ) : (
        <>
          <div className="mt-4 rounded-xl border p-4 text-sm">
            <div>DB-aktiviteter: <b>{dbActs.length}</b></div>
            <div>LocalStorage-aktiviteter: <b>{lsActs.length}</b></div>
            <div>Spøkelser (kun i LocalStorage): <b>{ghosts.length}</b></div>
          </div>

          <div className="mt-6 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <input
                id="chk-all"
                type="checkbox"
                checked={allChecked}
                ref={(el) => { if (el) el.indeterminate = !allChecked && someChecked; }}
                onChange={(e) => setAll(e.target.checked)}
              />
              <label htmlFor="chk-all" className="text-sm">Velg alle</label>
            </div>
            <button
              disabled={!someChecked}
              onClick={removeSelected}
              className="rounded-lg bg-red-600 px-3.5 py-2 text-sm font-semibold text-white hover:bg-red-700 disabled:opacity-50"
            >
              Fjern valgte fra enheten
            </button>
          </div>

          <ul className="mt-4 divide-y rounded-xl border bg-white">
            {ghosts.length === 0 ? (
              <li className="p-4 text-sm text-neutral-600">Ingen spøkelses-aktiviteter funnet i LocalStorage.</li>
            ) : ghosts.map(g => (
              <li key={S(g.id)} className="flex items-center justify-between gap-3 p-4">
                <div className="flex items-center gap-3">
                  <input type="checkbox" checked={!!sel[S(g.id)]} onChange={() => toggle(S(g.id))} />
                  <div>
                    <div className="font-medium">{g.name || g.title || g.navn || `Uten navn (${S(g.id)})`}</div>
                    <div className="text-xs text-neutral-600">ID: {S(g.id)}</div>
                  </div>
                </div>
                <button
                  onClick={() => { setSel(s => ({ ...s, [S(g.id)]: true })); removeSelected(); }}
                  className="rounded-lg bg-white px-3 py-1.5 text-sm font-semibold text-neutral-900 ring-1 ring-neutral-300 hover:bg-neutral-100"
                >
                  Fjern
                </button>
              </li>
            ))}
          </ul>
        </>
      )}
    </main>
  );
}
