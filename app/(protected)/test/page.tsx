'use client';

import { useEffect, useState } from 'react';

/**
 * Testside for å prøve Medlems-API uten DevTools eller terminal.
 * Endringer her påvirker ikke globalt design – kun denne siden.
 */

type Member = {
  id: string;
  first_name: string;
  last_name: string;
  email?: string | null;
  phone?: string | null;
  guardian_name?: string | null;
  guardian_phone?: string | null;
  health_notes?: string | null;
  internal_notes?: string | null;
};

type CreatePayload = {
  first_name: string;
  last_name: string;
  email?: string;
  phone?: string;
  guardian_name?: string;
  guardian_phone?: string;
  health_notes?: string;
  internal_notes?: string;
};

type UpdatePayload = Partial<Omit<CreatePayload, 'first_name' | 'last_name'>> & {
  first_name?: string;
  last_name?: string;
};

function titleCase(input: string) {
  const clean = (input || '').trim().replace(/\s+/g, ' ');
  return clean
    .toLowerCase()
    .split(' ')
    .map(w => (w ? w[0].toUpperCase() + w.slice(1) : ''))
    .join(' ');
}

async function jsonFetch<T = any>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, {
    ...init,
    headers: {
      'content-type': 'application/json',
      ...(init?.headers || {}),
    },
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const msg = (data?.error || data?.message || `HTTP ${res.status}`);
    throw new Error(typeof msg === 'string' ? msg : 'Ukjent feil');
  }
  return data as T;
}

export default function TestPage() {
  // STATE: Opprett
  const [createForm, setCreateForm] = useState<CreatePayload>({
    first_name: 'Kari',
    last_name: 'Nordmann',
    email: 'kari@example.com',
    phone: '12345678',
    guardian_name: 'Per Nordmann',
    guardian_phone: '98765432',
    health_notes: 'Allergi: nøtter',
    internal_notes: 'Kom via Sommercamp',
  });
  const [creating, setCreating] = useState(false);

  // STATE: Oppdater
  const [updateId, setUpdateId] = useState<string>('');
  const [updateForm, setUpdateForm] = useState<UpdatePayload>({
    phone: '55555555',
    internal_notes: 'Oppdatert i test',
  });
  const [updating, setUpdating] = useState(false);

  // Resultatvisning
  const [output, setOutput] = useState<any>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Hent sist lagrede id for enkel oppdatering
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const last = window.localStorage.getItem('follies.test.lastMemberId');
    if (last) setUpdateId(last);
  }, []);

  async function handleCreate() {
    setErrorMsg(null);
    setOutput(null);
    setCreating(true);
    try {
      const body: CreatePayload = {
        ...createForm,
        first_name: titleCase(createForm.first_name),
        last_name: titleCase(createForm.last_name),
      };

      const res = await jsonFetch<{ ok: boolean; member: Member }>('/api/members/create', {
        method: 'POST',
        body: JSON.stringify(body),
      });

      setOutput(res);
      if (res?.member?.id && typeof window !== 'undefined') {
        window.localStorage.setItem('follies.test.lastMemberId', res.member.id);
        setUpdateId(res.member.id);
      }
    } catch (e: any) {
      setErrorMsg(e?.message ?? 'Ukjent feil');
    } finally {
      setCreating(false);
    }
  }

  async function handleUpdate() {
    setErrorMsg(null);
    setOutput(null);
    setUpdating(true);
    try {
      if (!updateId) {
        throw new Error('Mangler medlems-ID å oppdatere. Opprett først, eller lim inn ID.');
      }

      const res = await jsonFetch<{ ok: boolean; member: Member }>(`/api/members/${updateId}/update`, {
        method: 'PATCH',
        body: JSON.stringify(updateForm),
      });

      setOutput(res);
    } catch (e: any) {
      setErrorMsg(e?.message ?? 'Ukjent feil');
    } finally {
      setUpdating(false);
    }
  }

  // Konsistente, høy-kontrast input-klasser (kun for denne siden)
  const inputCls =
    'border border-neutral-700 rounded px-2 py-1 bg-black text-white placeholder-neutral-400 focus:outline-none focus:ring-1 focus:ring-red-600';
  const textareaCls =
    'border border-neutral-700 rounded px-2 py-2 bg-black text-white placeholder-neutral-400 min-h-[70px] focus:outline-none focus:ring-1 focus:ring-red-600';
  const labelCls = 'text-sm text-white';
  const sectionTitle = 'text-lg font-semibold text-white';
  const helperText = 'text-white/80 mt-1';
  const titleCls = 'text-2xl font-semibold text-white';

  return (
    <div className="p-4 space-y-6 text-white">
      <div>
        <h1 className={titleCls}>Test – Medlemmer (DB)</h1>
        <p className={helperText}>
          Bruk denne siden for å teste oppretting og oppdatering av medlemmer mot databasen – uten å endre noe design i resten av løsningen.
        </p>
      </div>

      {/* Opprett medlem */}
      <section className="space-y-3">
        <h2 className={sectionTitle}>1) Opprett medlem</h2>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <div className="flex flex-col gap-1">
            <label className={labelCls}>Fornavn</label>
            <input
              type="text"
              value={createForm.first_name}
              onChange={e => setCreateForm(s => ({ ...s, first_name: e.target.value }))}
              className={inputCls}
              placeholder="Fornavn"
            />
          </div>
          <div className="flex flex-col gap-1">
            <label className={labelCls}>Etternavn</label>
            <input
              type="text"
              value={createForm.last_name}
              onChange={e => setCreateForm(s => ({ ...s, last_name: e.target.value }))}
              className={inputCls}
              placeholder="Etternavn"
            />
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <div className="flex flex-col gap-1">
            <label className={labelCls}>E-post</label>
            <input
              type="email"
              value={createForm.email}
              onChange={e => setCreateForm(s => ({ ...s, email: e.target.value }))}
              className={inputCls}
              placeholder="epost@domene.no"
            />
          </div>
          <div className="flex flex-col gap-1">
            <label className={labelCls}>Telefon</label>
            <input
              type="tel"
              value={createForm.phone}
              onChange={e => setCreateForm(s => ({ ...s, phone: e.target.value }))}
              className={inputCls}
              placeholder="Telefon"
            />
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <div className="flex flex-col gap-1">
            <label className={labelCls}>Foresatt navn</label>
            <input
              type="text"
              value={createForm.guardian_name}
              onChange={e => setCreateForm(s => ({ ...s, guardian_name: e.target.value }))}
              className={inputCls}
              placeholder="Foresatt navn"
            />
          </div>
          <div className="flex flex-col gap-1">
            <label className={labelCls}>Foresatt telefon</label>
            <input
              type="tel"
              value={createForm.guardian_phone}
              onChange={e => setCreateForm(s => ({ ...s, guardian_phone: e.target.value }))}
              className={inputCls}
              placeholder="Foresatt telefon"
            />
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <div className="flex flex-col gap-1">
            <label className={labelCls}>Helse-notater</label>
            <textarea
              value={createForm.health_notes}
              onChange={e => setCreateForm(s => ({ ...s, health_notes: e.target.value }))}
              className={textareaCls}
              placeholder="Allergier, hensyn, medisin osv."
            />
          </div>
          <div className="flex flex-col gap-1">
            <label className={labelCls}>Interne notater</label>
            <textarea
              value={createForm.internal_notes}
              onChange={e => setCreateForm(s => ({ ...s, internal_notes: e.target.value }))}
              className={textareaCls}
              placeholder="Kun for internt bruk"
            />
          </div>
        </div>

        <button
          onClick={handleCreate}
          disabled={creating}
          className="px-3 py-1 bg-red-600 hover:bg-red-700 text-white rounded disabled:opacity-60"
        >
          {creating ? 'Lagrer…' : 'Opprett medlem'}
        </button>
      </section>

      {/* Oppdater medlem */}
      <section className="space-y-3">
        <h2 className={sectionTitle}>2) Oppdater medlem</h2>
        <div className="flex flex-col md:flex-row gap-3">
          <div className="flex-1 flex flex-col gap-1">
            <label className={labelCls}>Medlems-ID</label>
            <input
              type="text"
              value={updateId}
              onChange={e => setUpdateId(e.target.value)}
              className={inputCls}
              placeholder="Lim inn id eller opprett først"
            />
          </div>
          <div className="flex-1 flex flex-col gap-1">
            <label className={labelCls}>Ny telefon</label>
            <input
              type="tel"
              value={updateForm.phone || ''}
              onChange={e => setUpdateForm(s => ({ ...s, phone: e.target.value }))}
              className={inputCls}
              placeholder="Telefon"
            />
          </div>
          <div className="flex-1 flex flex-col gap-1">
            <label className={labelCls}>Interne notater</label>
            <input
              type="text"
              value={updateForm.internal_notes || ''}
              onChange={e => setUpdateForm(s => ({ ...s, internal_notes: e.target.value }))}
              className={inputCls}
              placeholder="Notat"
            />
          </div>
        </div>

        <button
          onClick={handleUpdate}
          disabled={updating}
          className="px-3 py-1 bg-red-600 hover:bg-red-700 text-white rounded disabled:opacity-60"
        >
          {updating ? 'Oppdaterer…' : 'Oppdater medlem'}
        </button>
      </section>

      {/* Resultat / Feil */}
      <section className="space-y-2">
        <h2 className={sectionTitle}>3) Resultat</h2>
        {errorMsg ? <div className="text-red-400 text-sm">{errorMsg}</div> : null}
        <pre className="text-xs p-3 rounded border border-neutral-700 bg-black text-white overflow-auto">
{JSON.stringify(output, null, 2) || '—'}
        </pre>
      </section>
    </div>
  );
}
