'use client';

import { useEffect, useState } from 'react';
import { supabaseBrowser } from '@/lib/supabase/client';
import { useRouter } from 'next/navigation';

export default function ResetPasswordPage() {
  const [pw1, setPw1] = useState('');
  const [pw2, setPw2] = useState('');
  const [msg, setMsg] = useState<string | null>(null);
  const [ready, setReady] = useState(false);
  const router = useRouter();

  useEffect(() => {
    (async () => {
      const supabase = supabaseBrowser();
      const { data: { session } } = await supabase.auth.getSession();
      setReady(!!session);
      if (!session) setMsg('Ugyldig eller utløpt lenke. Be om ny.');
    })();
  }, []);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setMsg(null);
    if (pw1.length < 8) return setMsg('Passord må være minst 8 tegn.');
    if (pw1 !== pw2) return setMsg('Passordene er ikke like.');
    const supabase = supabaseBrowser();
    const { error } = await supabase.auth.updateUser({ password: pw1 });
    if (error) setMsg(error.message);
    else {
      setMsg('Passord oppdatert. Logger ut…');
      await supabase.auth.signOut();
      router.replace('/login');
    }
  }

  return (
    <div className="min-h-[70vh] flex items-center justify-center p-6">
      <div className="w-full max-w-md rounded-2xl border p-6 space-y-4">
        <h1 className="text-2xl font-semibold text-center">Sett nytt passord</h1>
        {!ready ? (
          <p className="text-center text-sm">{msg ?? 'Laster…'}</p>
        ) : (
          <form onSubmit={onSubmit} className="space-y-3">
            <input type="password" placeholder="Nytt passord" className="w-full border rounded-lg p-2"
              value={pw1} onChange={e=>setPw1(e.target.value)} />
            <input type="password" placeholder="Gjenta nytt passord" className="w-full border rounded-lg p-2"
              value={pw2} onChange={e=>setPw2(e.target.value)} />
            <button className="w-full rounded-lg p-2 bg-black text-white">Lagre</button>
            {msg && <div className="text-sm text-center">{msg}</div>}
          </form>
        )}
      </div>
    </div>
  );
}
