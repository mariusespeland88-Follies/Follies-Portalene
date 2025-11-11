'use client';

import { useState } from 'react';
import { supabaseBrowser } from '@/lib/supabase/client';

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState('');
  const [msg, setMsg] = useState<string | null>(null);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setMsg(null);
    const supabase = supabaseBrowser();
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${location.origin}/auth/callback?next=/auth/reset`,
    });
    if (error) setMsg(error.message);
    else setMsg('Vi har sendt deg en e-post med lenke for å sette nytt passord.');
  }

  return (
    <div className="min-h-[70vh] flex items-center justify-center p-6">
      <div className="w-full max-w-md rounded-2xl border p-6 space-y-4">
        <h1 className="text-2xl font-semibold text-center">Glemt passord</h1>
        <form onSubmit={onSubmit} className="space-y-3">
          <input type="email" placeholder="Din e-post" className="w-full border rounded-lg p-2"
            value={email} onChange={e=>setEmail(e.target.value)} required />
          <button className="w-full rounded-lg p-2 bg-black text-white">Send reset-lenke</button>
        </form>
        {msg && <div className="text-sm text-center">{msg}</div>}
      </div>
    </div>
  );
}

