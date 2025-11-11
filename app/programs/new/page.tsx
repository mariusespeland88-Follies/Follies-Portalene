'use client';
import { useState } from 'react';

export default function NewProgramPage() {
  const [form, setForm] = useState({ name:'', season:'Høst 2025', capacity:20, weekday:1 });
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    const res = await fetch('/api/programs', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify(form)});
    const data = await res.json();
    setSaving(false);
    setMsg(res.ok ? 'Lagret!' : (data.error || 'Feil'));
    if (res.ok) window.location.href = `/programs`;
  };

  return (
    <div className="max-w-xl card">
      <h1 className="text-2xl font-semibold mb-4">Nytt tilbud</h1>
      <form onSubmit={submit} className="grid gap-3">
        <input className="input" placeholder="Navn" value={form.name} onChange={(e)=>setForm({...form, name: e.target.value})} />
        <input className="input" placeholder="Sesong" value={form.season} onChange={(e)=>setForm({...form, season: e.target.value})} />
        <input className="input" placeholder="Ukedag (1-7)" type="number" value={form.weekday} onChange={(e)=>setForm({...form, weekday: Number(e.target.value)})} />
        <input className="input" placeholder="Kapasitet" type="number" value={form.capacity} onChange={(e)=>setForm({...form, capacity: Number(e.target.value)})} />
        <button disabled={saving} className="btn" type="submit">{saving?'Lagrer...':'Lagre'}</button>
        {msg && <div className="text-sm">{msg}</div>}
      </form>
    </div>
  );
}
