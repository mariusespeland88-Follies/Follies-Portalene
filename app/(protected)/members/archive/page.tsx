import Link from 'next/link';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export default async function MembersArchivePage() {
  const { data, error } = await supabase
    .from('member')
    .select('id,first_name,last_name,email,city,created_at')
    .eq('archived', true)
    .order('created_at', { ascending: false });

  const list = data ?? [];

  return (
    <div className="grid gap-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Arkiverte medlemmer</h1>
        <Link className="btn" href="/members">Til aktive</Link>
      </div>

      <div className="card overflow-x-auto">
        <table className="table">
          <thead><tr><th>Navn</th><th>E-post</th><th>By</th><th></th></tr></thead>
          <tbody>
            {list.map((m: any) => (
              <tr key={m.id}>
                <td>{m.first_name} {m.last_name}</td>
                <td>{m.email ?? '-'}</td>
                <td>{m.city ?? '-'}</td>
                <td className="text-right">
                  <Link href={`/members/${m.id}/edit`} className="btn">Gjenopprett</Link>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {error && <div className="text-sm text-red-500 mt-3">Feil: {error.message}</div>}
        {list.length === 0 && <div className="text-sm text-gray-400 mt-3">Ingen i arkivet.</div>}
      </div>
    </div>
  );
}
