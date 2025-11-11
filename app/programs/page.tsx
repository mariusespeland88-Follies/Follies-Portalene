import Link from 'next/link';
import { supabaseAdmin } from '@/lib/supabase/server';

export default async function ProgramsPage() {
  const { data: programs, error } = await supabaseAdmin
    .from('program')
    .select('id,name,season,weekday,capacity')
    .order('season', { ascending: false });

  const list = programs ?? [];

  return (
    <div className="grid gap-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Tilbud</h1>
        <Link className="btn" href="/programs/new">Nytt tilbud</Link>
      </div>

      <div className="card overflow-x-auto">
        <table className="table">
          <thead><tr><th>Navn</th><th>Sesong</th><th>Ukedag</th><th>Kapasitet</th></tr></thead>
          <tbody>
            {list.map((p: any) => (
              <tr key={p.id}>
                <td><Link href={`/programs/${p.id}`} className="underline">{p.name}</Link></td>
                <td>{p.season ?? '-'}</td>
                <td>{p.weekday ?? '-'}</td>
                <td>{p.capacity ?? '-'}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {list.length === 0 && <div className="text-sm text-gray-500 mt-3">Ingen tilbud enda.</div>}
        {error && <div className="text-sm text-red-600 mt-3">Feil: {error.message}</div>}
      </div>
    </div>
  );
}
