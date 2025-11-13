'use client';

import { useMemo, useState } from 'react';

type Tilbud = {
  id: string;
  type: 'tilbud';
  name: string;
  description?: string;
  leaders?: string[];      // navn på ledere/lærere
  capacity?: number | null;
  membersCount?: number;   // hvor mange som er påmeldt (placeholder)
  imageUrl?: string;
  files?: { name: string; url: string }[];
  // Ukeplan: fritekst per uke eller periode
  plan?: { label: string; text: string; leader?: string }[];
};

type Eventer = {
  id: string;
  type: 'event';
  title: string;
  date: string;            // YYYY-MM-DD
  timeStart?: string;      // HH:mm
  timeEnd?: string;        // HH:mm
  location?: string;
  imageUrl?: string;
  ticketType: 'billetter' | 'møt opp';
  ticketUrl?: string;      // hvis "billetter"
  description?: string;
  programRef?: string;     // knytte til et tilbud (valgfritt senere)
};

type Item = Tilbud | Eventer;

function uuid() {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) return crypto.randomUUID();
  return Math.random().toString(36).slice(2);
}

export default function ActivitiesView() {
  // MOCK-data så du ser UI med en gang
  const [items, setItems] = useState<Item[]>([
    {
      id: uuid(),
      type: 'tilbud',
      name: 'Barneteater',
      description: 'Faste plasser. Øving hver tirsdag.',
      leaders: ['Lise', 'Per'],
      capacity: 20,
      membersCount: 14,
      imageUrl: '/Images/follies-logo.jpg',
      plan: [
        { label: 'Uke 34', text: 'Introduksjon og øvelser', leader: 'Lise' },
        { label: 'Uke 35', text: 'Scene 1 og 2', leader: 'Per' },
      ],
    },
    {
      id: uuid(),
      type: 'event',
      title: 'Spotlight – Åpen scene',
      date: new Date().toISOString().slice(0,10),
      timeStart: '19:00',
      location: 'Klubbscenen',
      ticketType: 'møt opp',
      description: 'Gratis, bare å møte opp! Ta med instrument.',
    },
  ]);

  // UI state
  const [tab, setTab] = useState<'tilbud' | 'event'>('tilbud');
  const [query, setQuery] = useState('');
  const [showForm, setShowForm] = useState<'tilbud' | 'event' | null>(null);
  const [editing, setEditing] = useState<Item | null>(null);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return items.filter((it) => {
      if (tab === 'tilbud' && it.type !== 'tilbud') return false;
      if (tab === 'event' && it.type !== 'event') return false;
      if (!q) return true;
      if (it.type === 'tilbud') {
        const t = `${it.name} ${it.description ?? ''} ${(it.leaders ?? []).join(' ')}`.toLowerCase();
        return t.includes(q);
      } else {
        const t = `${it.title} ${it.description ?? ''} ${it.location ?? ''}`.toLowerCase();
        return t.includes(q);
      }
    });
  }, [items, tab, query]);

  function handleSaveTilbud(data: Omit<Tilbud, 'id' | 'type'>, existingId?: string) {
    if (existingId) {
      setItems(prev => prev.map(it => it.id === existingId ? { id: existingId, type: 'tilbud', ...data } : it));
    } else {
      setItems(prev => [{ id: uuid(), type: 'tilbud', ...data }, ...prev]);
    }
    setShowForm(null);
    setEditing(null);
  }

  function handleSaveEvent(data: Omit<Eventer, 'id' | 'type'>, existingId?: string) {
    if (existingId) {
      setItems(prev => prev.map(it => it.id === existingId ? { id: existingId, type: 'event', ...data } : it));
    } else {
      setItems(prev => [{ id: uuid(), type: 'event', ...data }, ...prev]);
    }
    setShowForm(null);
    setEditing(null);
  }

  function startEdit(it: Item) {
    setEditing(it);
    setShowForm(it.type);
    setTab(it.type); // hopp til riktig tab
  }

  return (
    <div className="space-y-4">
      {/* Toppkontroller */}
      <div className="rounded-2xl border bg-white p-3 shadow-sm">
        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div className="inline-flex rounded-lg overflow-hidden border border-neutral-300">
            <button
              onClick={() => setTab('tilbud')}
              className={`px-4 py-2 text-sm font-semibold ${tab === 'tilbud' ? 'bg-red-600 text-white' : 'bg-white text-neutral-900 hover:bg-neutral-50'}`}
            >
              Tilbud
            </button>
            <button
              onClick={() => setTab('event')}
              className={`px-4 py-2 text-sm font-semibold ${tab === 'event' ? 'bg-red-600 text-white' : 'bg-white text-neutral-900 hover:bg-neutral-50'}`}
            >
              Eventer
            </button>
          </div>

          <div className="flex items-center gap-2">
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={tab === 'tilbud' ? 'Søk i tilbud…' : 'Søk i eventer…'}
              className="border border-neutral-300 rounded-lg px-3 py-2 text-sm w-72 bg-white text-neutral-900 placeholder:text-neutral-600 focus:outline-none focus:ring-2 focus:ring-red-500"
            />
            <button
              onClick={() => { setShowForm(tab); setEditing(null); }}
              className="rounded-lg bg-red-600 text-white px-4 py-2 text-sm font-semibold hover:bg-red-700"
            >
              Ny {tab === 'tilbud' ? 'tilbud' : 'event'}
            </button>
          </div>
        </div>
      </div>

      {/* Lister */}
      {tab === 'tilbud' ? (
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {filtered.map(it => it.type === 'tilbud' && (
            <div key={it.id} className="rounded-xl border bg-white shadow-sm overflow-hidden flex flex-col">
              {it.imageUrl && <img src={it.imageUrl} alt="" className="h-36 w-full object-cover" />}
              <div className="p-3 space-y-2 flex-1">
                <div className="flex items-start justify-between">
                  <h3 className="font-extrabold text-neutral-900">{it.name}</h3>
                  {typeof it.membersCount === 'number' && (
                    <span className="text-xs rounded-full bg-black text-white px-2 py-0.5">
                      {it.membersCount}/{it.capacity ?? '∞'}
                    </span>
                  )}
                </div>
                {it.leaders && it.leaders.length > 0 && (
                  <div className="text-xs text-neutral-700">Ansvar: {it.leaders.join(', ')}</div>
                )}
                {it.description && <p className="text-sm text-neutral-800 line-clamp-3">{it.description}</p>}

                {it.plan && it.plan.length > 0 && (
                  <div className="mt-1 border-t pt-2">
                    <div className="text-xs font-semibold text-neutral-900 mb-1">Ukeplan</div>
                    <ul className="space-y-1 max-h-24 overflow-auto pr-1">
                      {it.plan.map((p, idx) => (
                        <li key={idx} className="text-xs text-neutral-800">
                          <span className="font-semibold">{p.label}:</span> {p.text} {p.leader ? <em className="text-neutral-600">({p.leader})</em> : null}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
              <div className="p-3 flex items-center justify-between gap-2 border-t">
                <button
                  className="text-xs border rounded-lg px-2 py-1 hover:bg-neutral-50"
                  title="Se deltakere (kommer)"
                >
                  Deltakere
                </button>
                <div className="flex gap-2">
                  <button
                    className="text-xs border rounded-lg px-2 py-1 hover:bg-neutral-50"
                    onClick={() => startEdit(it)}
                  >
                    Rediger
                  </button>
                  <button
                    className="text-xs border rounded-lg px-2 py-1 hover:bg-neutral-50"
                    title="Legg til uke i ukeplan (kommer)"
                  >
                    + Uke
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {filtered.map(it => it.type === 'event' && (
            <div key={it.id} className="rounded-xl border bg-white shadow-sm overflow-hidden flex flex-col">
              {it.imageUrl && <img src={it.imageUrl} alt="" className="h-36 w-full object-cover" />}
              <div className="p-3 space-y-2 flex-1">
                <div className="flex items-start justify-between">
                  <h3 className="font-extrabold text-neutral-900">{it.title}</h3>
                  <span className="text-xs rounded-full bg-red-600 text-white px-2 py-0.5">
                    {formatDateBadge(it.date, it.timeStart)}
                  </span>
                </div>
                <div className="text-xs text-neutral-700">
                  {it.location ? it.location : 'Ukjent sted'} · {it.ticketType === 'billetter' ? 'Billetter' : 'Møt opp'}
                </div>
                {it.description && <p className="text-sm text-neutral-800 line-clamp-3">{it.description}</p>}
              </div>
              <div className="p-3 flex items-center justify-between gap-2 border-t">
                {it.ticketType === 'billetter' && it.ticketUrl ? (
                  <a href={it.ticketUrl} target="_blank" className="text-xs bg-black text-white rounded-lg px-2 py-1 hover:opacity-90">
                    Kjøp billetter
                  </a>
                ) : (
                  <span className="text-xs text-neutral-700">Gratis · Møt opp</span>
                )}
                <button
                  className="text-xs border rounded-lg px-2 py-1 hover:bg-neutral-50"
                  onClick={() => startEdit(it)}
                >
                  Rediger
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Skjema: opprett / rediger */}
      {showForm === 'tilbud' && (
        <Drawer onClose={() => { setShowForm(null); setEditing(null); }}>
          <TilbudForm
            initial={editing?.type === 'tilbud' ? editing : undefined}
            onSubmit={(data) => handleSaveTilbud(data, editing?.id)}
          />
        </Drawer>
      )}
      {showForm === 'event' && (
        <Drawer onClose={() => { setShowForm(null); setEditing(null); }}>
          <EventForm
            initial={editing?.type === 'event' ? editing : undefined}
            onSubmit={(data) => handleSaveEvent(data, editing?.id)}
          />
        </Drawer>
      )}
    </div>
  );
}

/* -------------------- Helper components -------------------- */

function Drawer({ children, onClose }: { children: React.ReactNode; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-50">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div className="absolute right-0 top-0 h-full w-full sm:w-[520px] bg-white shadow-2xl p-4 overflow-auto">
        <div className="flex items-center justify-between mb-3">
          <div className="font-semibold text-neutral-900">Skjema</div>
          <button onClick={onClose} className="text-sm border rounded-lg px-2 py-1 hover:bg-neutral-50">Lukk</button>
        </div>
        {children}
      </div>
    </div>
  );
}

function formatDateBadge(date: string, time?: string) {
  try {
    const d = new Date(date + (time ? `T${time}:00` : 'T00:00:00'));
    const day = d.toLocaleDateString('no-NO', { day: '2-digit' });
    const mon = d.toLocaleDateString('no-NO', { month: 'short' });
    return `${day}. ${mon}${time ? ` · ${time}` : ''}`;
  } catch {
    return date;
  }
}

/* -------------------- Forms -------------------- */

function TilbudForm({
  initial,
  onSubmit,
}: {
  initial?: Tilbud;
  onSubmit: (data: Omit<Tilbud, 'id' | 'type'>) => void;
}) {
  const [name, setName] = useState(initial?.name ?? '');
  const [description, setDescription] = useState(initial?.description ?? '');
  const [leaders, setLeaders] = useState((initial?.leaders ?? []).join(', '));
  const [capacity, setCapacity] = useState<string>(initial?.capacity ? String(initial.capacity) : '');
  const [imageUrl, setImageUrl] = useState(initial?.imageUrl ?? '');
  const [files, setFiles] = useState<{ name: string; url: string }[]>(initial?.files ?? []);
  const [plan, setPlan] = useState<{ label: string; text: string; leader?: string }[]>(initial?.plan ?? []);

  return (
    <form
      className="space-y-3"
      onSubmit={(e) => {
        e.preventDefault();
        onSubmit({
          name,
          description,
          leaders: leaders.split(',').map(s => s.trim()).filter(Boolean),
          capacity: capacity ? Number(capacity) : null,
          imageUrl: imageUrl || undefined,
          files,
          plan,
          membersCount: initial?.membersCount ?? 0,
        });
      }}
    >
      <h3 className="text-lg font-extrabold">Tilbud</h3>
      <div className="space-y-2">
        <Field label="Navn" required>
          <input value={name} onChange={e=>setName(e.target.value)} required className="input" />
        </Field>
        <Field label="Beskrivelse">
          <textarea value={description} onChange={e=>setDescription(e.target.value)} rows={3} className="input" />
        </Field>
        <Field label="Ledere/lærere (kommaseparert)">
          <input value={leaders} onChange={e=>setLeaders(e.target.value)} className="input" />
        </Field>
        <div className="grid grid-cols-2 gap-2">
          <Field label="Kapasitet">
            <input type="number" min={0} value={capacity} onChange={e=>setCapacity(e.target.value)} className="input" />
          </Field>
          <Field label="Bilde (URL)">
            <input value={imageUrl} onChange={e=>setImageUrl(e.target.value)} className="input" placeholder="https://…" />
          </Field>
        </div>

        {/* Filer */}
        <div className="border rounded-lg p-2">
          <div className="flex items-center justify-between">
            <div className="font-semibold">Filer</div>
            <button type="button" className="text-xs border rounded px-2 py-1" onClick={()=>setFiles(f=>[...f,{name:'Ny fil', url:''}])}>+ Legg til</button>
          </div>
          <div className="mt-2 space-y-2">
            {files.map((f, idx)=>(
              <div key={idx} className="grid grid-cols-5 gap-2 items-center">
                <input value={f.name} onChange={e=>setFiles(arr=>arr.map((x,i)=>i===idx?{...x,name:e.target.value}:x))} className="input col-span-2" placeholder="Navn" />
                <input value={f.url} onChange={e=>setFiles(arr=>arr.map((x,i)=>i===idx?{...x,url:e.target.value}:x))} className="input col-span-3" placeholder="https://…" />
              </div>
            ))}
            {files.length===0 && <div className="text-sm text-neutral-600">Ingen filer.</div>}
          </div>
        </div>

        {/* Ukeplan */}
        <div className="border rounded-lg p-2">
          <div className="flex items-center justify-between">
            <div className="font-semibold">Ukeplan</div>
            <button type="button" className="text-xs border rounded px-2 py-1" onClick={()=>setPlan(p=>[...p,{label:`Uke ${p.length+1}`, text:''}])}>+ Legg til uke</button>
          </div>
          <div className="mt-2 space-y-2">
            {plan.map((p, idx)=>(
              <div key={idx} className="grid grid-cols-7 gap-2">
                <input value={p.label} onChange={e=>setPlan(arr=>arr.map((x,i)=>i===idx?{...x,label:e.target.value}:x))} className="input col-span-2" placeholder="Uke 35 / Periode" />
                <input value={p.leader ?? ''} onChange={e=>setPlan(arr=>arr.map((x,i)=>i===idx?{...x,leader:e.target.value}:x))} className="input col-span-2" placeholder="Leder (valgfritt)" />
                <input value={p.text} onChange={e=>setPlan(arr=>arr.map((x,i)=>i===idx?{...x,text:e.target.value}:x))} className="input col-span-3" placeholder="Hva skjer denne uka" />
              </div>
            ))}
            {plan.length===0 && <div className="text-sm text-neutral-600">Ingen ukeplan lagt til.</div>}
          </div>
        </div>
      </div>

      <div className="pt-2 flex justify-end gap-2">
        <button type="submit" className="rounded-lg bg-red-600 text-white px-4 py-2 text-sm font-semibold hover:bg-red-700">
          {initial ? 'Lagre endringer' : 'Opprett tilbud'}
        </button>
      </div>
    </form>
  );
}

function EventForm({
  initial,
  onSubmit,
}: {
  initial?: Eventer;
  onSubmit: (data: Omit<Eventer, 'id' | 'type'>) => void;
}) {
  const [title, setTitle] = useState(initial?.title ?? '');
  const [date, setDate] = useState(initial?.date ?? new Date().toISOString().slice(0,10));
  const [timeStart, setTimeStart] = useState(initial?.timeStart ?? '');
  const [timeEnd, setTimeEnd] = useState(initial?.timeEnd ?? '');
  const [location, setLocation] = useState(initial?.location ?? '');
  const [imageUrl, setImageUrl] = useState(initial?.imageUrl ?? '');
  const [ticketType, setTicketType] = useState<Eventer['ticketType']>(initial?.ticketType ?? 'møt opp');
  const [ticketUrl, setTicketUrl] = useState(initial?.ticketUrl ?? '');
  const [description, setDescription] = useState(initial?.description ?? '');

  return (
    <form
      className="space-y-3"
      onSubmit={(e) => {
        e.preventDefault();
        onSubmit({
          title, date, timeStart: timeStart || undefined, timeEnd: timeEnd || undefined,
          location: location || undefined, imageUrl: imageUrl || undefined,
          ticketType, ticketUrl: ticketType === 'billetter' ? (ticketUrl || undefined) : undefined,
          description: description || undefined,
        });
      }}
    >
      <h3 className="text-lg font-extrabold">Event</h3>
      <div className="grid grid-cols-2 gap-2">
        <Field label="Tittel" required className="col-span-2">
          <input value={title} onChange={e=>setTitle(e.target.value)} required className="input" />
        </Field>
        <Field label="Dato" required>
          <input type="date" value={date} onChange={e=>setDate(e.target.value)} required className="input" />
        </Field>
        <Field label="Start (valgfritt)">
          <input type="time" value={timeStart} onChange={e=>setTimeStart(e.target.value)} className="input" />
        </Field>
        <Field label="Slutt (valgfritt)">
          <input type="time" value={timeEnd} onChange={e=>setTimeEnd(e.target.value)} className="input" />
        </Field>
        <Field label="Sted" className="col-span-2">
          <input value={location} onChange={e=>setLocation(e.target.value)} className="input" placeholder="Hallen / Hovedscenen / …" />
        </Field>
        <Field label="Bilde (URL)" className="col-span-2">
          <input value={imageUrl} onChange={e=>setImageUrl(e.target.value)} className="input" placeholder="https://…" />
        </Field>

        <div className="col-span-2">
          <div className="text-xs font-semibold text-neutral-900 mb-1">Billetter</div>
          <div className="flex items-center gap-3 text-sm">
            <label className="inline-flex items-center gap-1">
              <input type="radio" checked={ticketType==='møt opp'} onChange={()=>setTicketType('møt opp')} />
              <span>Møt opp (gratis)</span>
            </label>
            <label className="inline-flex items-center gap-1">
              <input type="radio" checked={ticketType==='billetter'} onChange={()=>setTicketType('billetter')} />
              <span>Billetter</span>
            </label>
            {ticketType==='billetter' && (
              <input value={ticketUrl} onChange={e=>setTicketUrl(e.target.value)} placeholder="Lenke til kjøp" className="input flex-1" />
            )}
          </div>
        </div>

        <Field label="Info" className="col-span-2">
          <textarea value={description} onChange={e=>setDescription(e.target.value)} rows={4} className="input" />
        </Field>
      </div>

      <div className="pt-2 flex justify-end gap-2">
        <button type="submit" className="rounded-lg bg-red-600 text-white px-4 py-2 text-sm font-semibold hover:bg-red-700">
          {initial ? 'Lagre endringer' : 'Opprett event'}
        </button>
      </div>
    </form>
  );
}

function Field({
  label,
  required,
  className,
  children,
}: {
  label: string;
  required?: boolean;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <label className={`block ${className ?? ''}`}>
      <div className="mb-1 text-xs font-semibold text-neutral-900">
        {label} {required ? <span className="text-red-600">*</span> : null}
      </div>
      {children}
      <style jsx>{`
        .input {
          @apply w-full border border-neutral-300 rounded-lg px-3 py-2 text-sm bg-white text-neutral-900 placeholder:text-neutral-600 focus:outline-none focus:ring-2 focus:ring-red-500;
        }
      `}</style>
    </label>
  );
}
