"use client";

import { useEffect, useMemo, useState } from "react";
import { createClientComponentClient } from "@/lib/supabase/browser";
import { hardDeleteActivity } from "@/lib/client/hardDeleteActivity";

type AnyObj = Record<string, any>;
type DbActivity = { id: string; name?: string | null; type?: string | null; archived?: boolean | null; created_at?: string | null };

const LS_ACT_V1 = "follies.activities.v1";
const LS_ACT_OLD = "follies.activities";

const safeJSON = <T,>(s: string | null): T | null => { try { return s ? (JSON.parse(s) as T) : null; } catch { return null; } };
const S = (v: any) => String(v ?? "");

function readLocalActivityIds(): Set<string> {
  if (typeof window === "undefined") return new Set<string>();
  const v1 = safeJSON<any[]>(localStorage.getItem(LS_ACT_V1)) ?? [];
  const old = safeJSON<any[]>(localStorage.getItem(LS_ACT_OLD)) ?? [];
  const set = new Set<string>();
  [...old, ...v1].forEach(a => {
    const id = S(a?.id ?? a?.uuid ?? a?._id);
    if (id) set.add(id);
  });
  return set;
}

export default function CleanupDbActivitiesPage() {
  const supabase = createClientComponentClient();

  const [dbActs, setDbActs] = useState<DbActivity[]>([]);
  const [q, setQ] = useState("");
  const [onlyGhosts, setOnlyGhosts] = useState(true);
  const [sel, setSel] = useState<Record<string, boolean>>({});
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);

  const reload = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("activities")
      .select("id, name, type, archived, created_at")
      .order("created_at", { ascending: false });
    if (!error) setDbActs((data ?? []) as DbActivity[]);
    setLoading(false);
  };

  useEffect(() => { reload(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, []);

  const lsIds = useMemo(() => readLocalActivityIds(), [dbActs.length]); // oppdater når vi laster
  const ghosts = useMemo(() => new Set(dbActs.filter(a => !lsIds.has(S(a.id))).map(a => S(a.id))), [dbActs, lsIds]);

  const filtered = useMemo(() => {
    const query = q.trim().toLowerCase();
    return dbActs.filter((a) => {
      if (onlyGhosts && !ghosts.has(S(a.id))) return false;
      if (!query) return true;
      const name = (a.name || "").toLowerCase();
      const type = (a.type || "").toLowerCase();
      return name.includes(query) || type.includes(query) || S(a.id).toLowerCase().includes(query);
    });
  }, [dbActs, q, onlyGhosts, ghosts]);

  const allChecked = filtered.length > 0 && filtered.every(a => sel[S(a.id)]);
  const someChecked = filtered.some(a => sel[S(a.id)]);
  const setAll = (on: boolean) => {
    const next: Record<string, boolean> = {};
    filtered.forEach(a => { next[S(a.id)] = on; });
    setSel(next);
  };

  const removeSelected = async () => {
    const ids = filtered.map(a => S(a.id)).filter(id => sel[id]);
    if (!ids.length) return;
    if (!confirm(`Slette ${ids.length} aktivitet(er) permanent? Dette kan ikke angres.`)) return;
    setBusy(true);
    try {
      // Slett i serie for å få ryddig feedback hvis noe feiler
      for (const id of ids) {
        await hardDeleteActivity(id);
      }
      await reload();
      setSel({});
      alert("Ferdig: valgte aktiviteter er slettet fra databasen og ryddet lokalt.");
    } catch (e: any) {
      alert(e?.message || "Noe gikk galt under sletting.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <main className="mx-auto max-w-6xl px-4 py-8 text-neutral-900">
      <h1 className="text-2xl font-bold">Rydd opp i aktiviteter (Database)</h1>

      <div className="mt-4 grid gap-4 md:grid-cols-3">
        <div className="rounded-xl border bg-white p-4">
          <div className="text-sm">Aktiviteter i DB</div>
          <div className="text-2xl font-semibold">{dbActs.length}</div>
        </div>
        <div className="rounded-xl border bg-white p-4">
          <div className="text-sm">Aktiviteter i LocalStorage</div>
          <div className="text-2xl font-semibold">{lsIds.size}</div>
        </div>
        <div className="rounded-xl border bg-white p-4">
          <div className="text-sm">“Spøkelser” (kun i DB)</div>
          <div className="text-2xl font-semibold">{ghosts.size}</div>
        </div>
      </div>

      <div className="mt-6 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Søk navn, type eller ID…"
            className="w-72 rounded-lg border border-neutral-300 bg-white px-3 py-2 text-[15px] placeholder:text-neutral-500 focus:outline-none focus:ring-2 focus:ring-red-600"
          />
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={onlyGhosts} onChange={() => setOnlyGhosts(x => !x)} />
            <span>Vis bare spøkelser (ikke i LocalStorage)</span>
          </label>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setAll(!allChecked)}
            className="rounded-lg bg-white px-3 py-2 text-sm font-semibold text-neutral-900 ring-1 ring-neutral-300 hover:bg-neutral-100"
          >
            {allChecked ? "Fjern alle" : "Velg alle"}
          </button>
          <button
            onClick={removeSelected}
            disabled={!someChecked || busy}
            className="rounded-lg bg-red-600 px-3.5 py-2 text-sm font-semibold text-white hover:bg-red-700 disabled:opacity-50"
          >
            Slett valgte
          </button>
        </div>
      </div>

      <div className="mt-4 overflow-hidden rounded-xl border bg-white">
        {loading ? (
          <div className="p-4">Laster…</div>
        ) : filtered.length === 0 ? (
          <div className="p-4 text-sm text-neutral-600">Ingen aktiviteter matcher filtrene.</div>
        ) : (
          <table className="min-w-full text-left text-sm">
            <thead className="bg-neutral-50">
              <tr>
                <th className="px-4 py-2 w-10"></th>
                <th className="px-4 py-2">Navn</th>
                <th className="px-4 py-2">Type</th>
                <th className="px-4 py-2">Status</th>
                <th className="px-4 py-2">ID</th>
                <th className="px-4 py-2">Opprettet</th>
                <th className="px-4 py-2">I LocalStorage?</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((a) => {
                const id = S(a.id);
                const inLs = lsIds.has(id);
                return (
                  <tr key={id} className="border-t">
                    <td className="px-4 py-2 align-middle">
                      <input
                        type="checkbox"
                        checked={!!sel[id]}
                        onChange={() => setSel(s => ({ ...s, [id]: !s[id] }))}
                      />
                    </td>
                    <td className="px-4 py-2">{a.name || "Uten navn"}</td>
                    <td className="px-4 py-2">{a.type || "—"}</td>
                    <td className="px-4 py-2">{a.archived ? "Arkivert" : "Aktiv"}</td>
                    <td className="px-4 py-2 font-mono text-xs">{id}</td>
                    <td className="px-4 py-2 text-xs">{a.created_at ? new Date(a.created_at).toLocaleString() : "—"}</td>
                    <td className="px-4 py-2">
                      <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ring-1 ${inLs ? "bg-green-50 text-green-700 ring-green-200" : "bg-amber-50 text-amber-700 ring-amber-200"}`}>
                        {inLs ? "Ja" : "Nei"}
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
    </main>
  );
}
