// components/admin/AdminAddUserForm.tsx
'use client';

import { useState } from 'react';

export default function AdminAddUserForm() {
  const [email, setEmail] = useState('');
  const [mode, setMode] = useState<'invite'|'create'>('invite');
  const [password, setPassword] = useState('');
  const [role, setRole] = useState<'admin'|'staff'|'user'>('staff');
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setMsg(null);
    setBusy(true);
    try {
      const res = await fetch('/api/admin/users', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          email,
          mode,
          password: mode === 'create' ? password : undefined,
          role
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Feil');
      setMsg(mode === 'invite' ? 'Invitasjon sendt!' : 'Bruker opprettet!');
      setEmail(''); setPassword(''); setRole('staff'); setMode('invite');
    } catch (err: any) {
      setMsg(err.message ?? 'Noe gikk galt');
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4 border rounded-2xl p-4">
      <div className="space-y-2">
        <label className="text-sm">E-post</label>
        <input type="email" required className="w-full border rounded-lg p-2"
               value={email} onChange={e=>setEmail(e.target.value)} placeholder="person@firma.no" />
      </div>

      <div className="grid grid-cols-2 gap-2">
        <button type="button" onClick={()=>setMode('invite')}
                className={`rounded-lg p-2 border ${mode==='invite' ? 'bg-black text-white' : ''}`}>
          Invitasjon på e-post
        </button>
        <button type="button" onClick={()=>setMode('create')}
                className={`rounded-lg p-2 border ${mode==='create' ? 'bg-black text-white' : ''}`}>
          Opprett m/ passord
        </button>
      </div>

      {mode === 'create' && (
        <div className="space-y-2">
          <label className="text-sm">Passord (min. 8 tegn)</label>
          <input type="password" minLength={8} required
                 className="w-full border rounded-lg p-2"
                 value={password} onChange={e=>setPassword(e.target.value)} placeholder="••••••••" />
        </div>
      )}

      <div className="space-y-2">
        <label className="text-sm">Rolle</label>
        <select className="w-full border rounded-lg p-2" value={role} onChange={e=>setRole(e.target.value as any)}>
          <option value="staff">Staff</option>
          <option value="user">User</option>
          <option value="admin">Admin</option>
        </select>
        <p className="text-xs text-gray-500">Rollen lagres i <code>profiles.role</code>.</p>
      </div>

      <button className="w-full rounded-lg p-2 bg-black text-white disabled:opacity-50" disabled={busy}>
        {busy ? 'Sender…' : (mode === 'invite' ? 'Send invitasjon' : 'Opprett bruker')}
      </button>

      {msg && <p className="text-center text-sm mt-2">{msg}</p>}
    </form>
  );
}
