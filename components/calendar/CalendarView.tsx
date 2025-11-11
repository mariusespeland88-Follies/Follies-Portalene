'use client';

import { useEffect, useMemo, useState } from 'react';
import { supabaseBrowser } from '@/lib/supabase/client';

type Activity = {
  id: string;
  title: string;
  start_at: string;
  end_at?: string | null;
  location?: string | null;
  category?: string | null;
};

type CalendarEvent = {
  dateKey: string;
  title: string;
  category?: string | null;
  time?: string | null;
};

const WEEKDAYS = ['Man', 'Tir', 'Ons', 'Tor', 'Fre', 'Lør', 'Søn'];

function startOfMonth(d: Date) { return new Date(d.getFullYear(), d.getMonth(), 1); }
function endOfMonth(d: Date)   { return new Date(d.getFullYear(), d.getMonth() + 1, 0); }
function addMonths(d: Date, n: number) { return new Date(d.getFullYear(), d.getMonth() + n, 1); }
function startOfWeek(d: Date) { const t = new Date(d); const dow = (t.getDay() + 6) % 7; t.setDate(t.getDate() - dow); t.setHours(0,0,0,0); return t; }
function dateKey(d: Date) { return d.toISOString().slice(0, 10); }
function isWeekend(d: Date) { const day = (d.getDay() + 6) % 7; return day >= 5; } // Lør/Søn

// Farger pr kategori (deterministisk)
const CAT_STYLES = [
  { chip: 'bg-red-50 text-red-800 border-red-200', dot: 'bg-red-600' },
  { chip: 'bg-blue-50 text-blue-800 border-blue-200', dot: 'bg-blue-600' },
  { chip: 'bg-emerald-50 text-emerald-800 border-emerald-200', dot: 'bg-emerald-600' },
  { chip: 'bg-amber-50 text-amber-900 border-amber-300', dot: 'bg-amber-600' },
  { chip: 'bg-violet-50 text-violet-800 border-violet-200', dot: 'bg-violet-600' },
  { chip: 'bg-rose-50 text-rose-800 border-rose-200', dot: 'bg-rose-600' },
  { chip: 'bg-cyan-50 text-cyan-800 border-cyan-200', dot: 'bg-cyan-600' },
  { chip: 'bg-indigo-50 text-indigo-800 border-indigo-200', dot: 'bg-indigo-600' },
];
function hashIdx(s: string) {
  let h = 0; for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
  return Math.abs(h) % CAT_STYLES.length;
}
function styFor(cat?: string | null) { return CAT_STYLES[cat ? hashIdx(cat) : 0]; }

export default function CalendarView() {
  const [cursor, setCursor] = useState<Date>(() => new Date());
  const [selected, setSelected] = useState<Date>(() => new Date());
  const [view, setView] = useState<'month' | 'week'>('month');

  const [events, setEvents] = useState<CalendarEvent[]>([]);
  const [categories, setCategories] = useState<string[]>([]);
  const [selectedCats, setSelectedCats] = useState<string[]>([]);
  const [search, setSearch] = useState('');
  const [hasCategoryCol, setHasCategoryCol] = useState(true);
  const [loading, setLoading] = useState(false);

  const monthStart = startOfMonth(cursor);
  const monthEnd   = endOfMonth(cursor);
  const monthLabel = new Intl.DateTimeFormat('no-NO', { month: 'long', year: 'numeric' }).format(monthStart);
  const todayKey   = dateKey(new Date());

  // Grid (uke/måned)
  const gridDays = useMemo(() => {
    if (view === 'week') {
      const start = startOfWeek(selected);
      return Array.from({ length: 7 }, (_, i) => new Date(start.getFullYear(), start.getMonth(), start.getDate() + i));
    }
    const out: Date[] = [];
    const dow = (monthStart.getDay() + 6) % 7; // 0=Man
    const gridStart = new Date(monthStart); gridStart.setDate(monthStart.getDate() - dow);
    for (let i = 0; i < 42; i++) { const d = new Date(gridStart); d.setDate(gridStart.getDate() + i); out.push(d); }
    return out;
  }, [cursor, monthStart, selected, view]);

  // Kategorier
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const sb = supabaseBrowser();
      const { error: probeErr } = await sb.from('activities').select('category', { head: true, count: 'exact' }).limit(1);
      if (probeErr) { setHasCategoryCol(false); setCategories([]); return; }
      setHasCategoryCol(true);
      const { data, error } = await sb.from('activities').select('category').not('category', 'is', null);
      if (!cancelled && !error) {
        const uniq = Array.from(new Set((data ?? []).map(r => (r as any).category).filter(Boolean))) as string[];
        setCategories(uniq);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  // Events
  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      const sb = supabaseBrowser();
      const startISO = new Date(monthStart.getFullYear(), monthStart.getMonth(), 1).toISOString();
      const endISO   = new Date(monthEnd.getFullYear(), monthEnd.getMonth(), monthEnd.getDate(), 23, 59, 59).toISOString();

      let q = sb.from('activities')
        .select('id, title, start_at, end_at, location, category')
        .gte('start_at', startISO)
        .lte('start_at', endISO)
        .order('start_at', { ascending: true });

      if (search.trim()) q = q.or(`title.ilike.%${search}%,location.ilike.%${search}%`);
      if (hasCategoryCol && selectedCats.length > 0) q = q.in('category', selectedCats);

      const { data, error } = await q;
      if (!cancelled) {
        if (error) {
          setEvents([]);
        } else {
          const evs: CalendarEvent[] = (data ?? []).map((a: Activity) => {
            const dt = new Date(a.start_at);
            return {
              dateKey: dateKey(dt),
              title: a.title,
              category: a.category ?? null,
              time: new Intl.DateTimeFormat('no-NO', { hour: '2-digit', minute: '2-digit' }).format(dt),
            };
          });
          setEvents(evs);
        }
        setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [cursor, search, selectedCats, hasCategoryCol, monthStart, monthEnd]);

  // Gruppér pr dag
  const byDay = useMemo(() => {
    const m = new Map<string, CalendarEvent[]>();
    for (const e of events) { if (!m.has(e.dateKey)) m.set(e.dateKey, []); m.get(e.dateKey)!.push(e); }
    return m;
  }, [events]);

  const selectedKey = dateKey(selected);
  const selectedEvents = byDay.get(selectedKey) || [];

  return (
    <div className="space-y-4">
      {/* Kontrollpanel – sterk kontrast */}
      <div className="rounded-2xl border-2 border-red-600 bg-white p-4 shadow-sm">
        <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
          <div className="flex items-center gap-3">
            <div className="text-3xl font-extrabold capitalize tracking-tight text-neutral-900">
              {monthLabel}
            </div>

            <div className="hidden md:flex items-center gap-2">
              <button
                onClick={() => setCursor(addMonths(cursor, -1))}
                className="border border-neutral-300 text-neutral-900 rounded-lg px-3 py-2 font-semibold hover:bg-neutral-50"
                aria-label="Forrige måned"
              >←</button>
              <button
                onClick={() => { const t = new Date(); setCursor(t); setSelected(t); }}
                className="border border-neutral-300 text-neutral-900 rounded-lg px-3 py-2 font-semibold hover:bg-neutral-50"
              >i dag</button>
              <button
                onClick={() => setCursor(addMonths(cursor, +1))}
                className="border border-neutral-300 text-neutral-900 rounded-lg px-3 py-2 font-semibold hover:bg-neutral-50"
                aria-label="Neste måned"
              >→</button>
            </div>

            {/* View toggle – tydelig valgt/ikke valgt */}
            <div className="ml-1 inline-flex rounded-lg overflow-hidden border border-neutral-300">
              <button
                onClick={() => setView('month')}
                className={`px-3 py-2 text-sm font-semibold ${view === 'month' ? 'bg-red-600 text-white' : 'bg-white text-neutral-900 hover:bg-neutral-50'}`}
              >
                Måned
              </button>
              <button
                onClick={() => setView('week')}
                className={`px-3 py-2 text-sm font-semibold ${view === 'week' ? 'bg-red-600 text-white' : 'bg-white text-neutral-900 hover:bg-neutral-50'}`}
              >
                Uke
              </button>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Søk tittel eller sted…"
              className="border border-neutral-300 rounded-lg px-3 py-2 text-sm w-72 bg-white text-neutral-900 placeholder:text-neutral-600 focus:outline-none focus:ring-2 focus:ring-red-500"
            />
          </div>
        </div>
      </div>

      {/* Layout: kalender + sidepanel */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Kalender */}
        <div className="lg:col-span-2 rounded-2xl border-2 border-red-600 overflow-hidden bg-white shadow-sm">
          {/* Ukedager */}
          <div className="grid grid-cols-7 gap-px bg-neutral-200 text-xs text-neutral-900">
            {WEEKDAYS.map((w) => (
              <div key={w} className="bg-neutral-50 p-3 text-center font-extrabold tracking-wide uppercase">{w}</div>
            ))}
          </div>

          {/* Dager */}
          <div className="grid grid-cols-7 gap-px bg-neutral-200">
            {gridDays.map((d, idx) => {
              const key = dateKey(d);
              const inMonth = d.getMonth() === monthStart.getMonth() || view === 'week';
              const evs = byDay.get(key) || [];
              const isToday = key === todayKey;
              const weekend = isWeekend(d);
              const isSelected = dateKey(d) === dateKey(selected);

              return (
                <button
                  key={idx}
                  onClick={() => setSelected(new Date(d))}
                  className={[
                    'relative text-left bg-white p-3 min-h-[120px] focus:outline-none focus:ring-2 focus:ring-red-500',
                    !inMonth ? 'bg-neutral-100' : '',
                    weekend && inMonth ? 'bg-neutral-50' : '',
                    isSelected ? 'ring-2 ring-red-600' : '',
                    'hover:shadow-sm transition-shadow'
                  ].join(' ')}
                >
                  {/* Dato + badge */}
                  <div className="flex items-start justify-between">
                    <div className={`text-2xl leading-none font-extrabold ${inMonth ? 'text-neutral-900' : 'text-neutral-400'}`}>
                      {d.getDate()}
                    </div>
                    {evs.length > 0 && (
                      <span className="text-[10px] leading-none px-1.5 py-0.5 rounded-full bg-red-600 text-white font-semibold shadow-sm">
                        {evs.length}
                      </span>
                    )}
                  </div>

                  {/* "i dag" chip */}
                  {isToday && (
                    <div className="mt-1">
                      <span className="text-[10px] px-1.5 py-0.5 rounded bg-red-600 text-white shadow-sm">
                        i dag
                      </span>
                    </div>
                  )}

                  {/* Events */}
                  <div className="mt-2 space-y-1">
                    {evs.slice(0, 4).map((e, i) => {
                      const s = styFor(e.category);
                      return (
                        <div
                          key={i}
                          className={`text-[12px] px-1.5 py-0.5 rounded border truncate ${s.chip}`}
                          title={e.title}
                        >
                          {e.time ? `${e.time} · ` : ''}{e.title}{e.category ? ` · ${e.category}` : ''}
                        </div>
                      );
                    })}
                    {evs.length > 4 && (
                      <div className="text-[12px] text-neutral-800">+{evs.length - 4} til</div>
                    )}
                  </div>
                </button>
              );
            })}
          </div>
        </div>

        {/* Sidepanel */}
        <aside className="rounded-2xl border border-red-300 bg-white shadow-sm p-4">
          <div className="flex items-center justify-between">
            <div className="text-xl font-extrabold text-neutral-900">
              {new Intl.DateTimeFormat('no-NO', { weekday: 'long', day: '2-digit', month: 'long' }).format(selected)}
            </div>
            <div className="text-xs font-semibold text-neutral-900">{selectedEvents.length} aktiviteter</div>
          </div>

          <div className="mt-3 space-y-2">
            {selectedEvents.length === 0 && (
              <div className="text-sm text-neutral-900">Ingen aktiviteter denne dagen.</div>
            )}
            {selectedEvents.map((e, i) => {
              const s = styFor(e.category);
              return (
                <div key={i} className={`rounded-lg border p-3 ${s.chip.replace('bg-','bg-opacity-40 bg-')}`}>
                  <div className="flex items-center gap-2">
                    <span className={`inline-block h-2.5 w-2.5 rounded-full ${s.dot}`} />
                    <div className="text-sm font-semibold text-neutral-900 truncate">{e.title}</div>
                  </div>
                  <div className="mt-1 text-sm text-neutral-900">{e.time ? e.time : 'Tid ikke satt'}</div>
                  {e.category && <div className="mt-1 text-xs text-neutral-800">Kategori: {e.category}</div>}
                </div>
              );
            })}
          </div>
        </aside>
      </div>

      {loading && <div className="text-sm text-neutral-900">Laster…</div>}
    </div>
  );
}

