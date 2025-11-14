"use client";

import { useEffect, useState } from "react";
import { createClientComponentClient } from "@/lib/supabase/browser";

type Member = { id: string; first_name?: string | null; last_name?: string | null; email?: string | null };
type RawMember = { id?: any; first_name?: any; last_name?: any; email?: any };
type PersonWithMember = { id: string; member_id: string; activity_id: string; role: "participant" | "leader"; member: Member | null };
type RawPersonWithMember = Omit<PersonWithMember, "member"> & { member: RawMember | RawMember[] | null };

const sanitizeMember = (raw: RawMember | null | undefined): Member | null => {
  if (!raw) return null;
  const id = raw.id != null ? String(raw.id) : "";
  if (!id) return null;
  return {
    id,
    first_name: raw.first_name != null ? String(raw.first_name) : null,
    last_name: raw.last_name != null ? String(raw.last_name) : null,
    email: raw.email != null ? String(raw.email) : null,
  };
};

const sanitizeRows = (rows: RawPersonWithMember[] | null | undefined): PersonWithMember[] => {
  if (!Array.isArray(rows)) return [];
  return rows.map((row) => {
    const memberRaw = Array.isArray(row.member) ? row.member[0] : row.member;
    return {
      ...row,
      id: String(row.id),
      member_id: String(row.member_id),
      activity_id: String(row.activity_id),
      member: sanitizeMember(memberRaw),
    };
  });
};

async function setRole(activityId: string, memberId: string, role: "participant" | "leader") {
  const res = await fetch("/api/admin/enrollments/update-role", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ activityId, memberId, role }),
  });
  if (!res.ok) {
    const j = await res.json().catch(() => ({}));
    throw new Error(j?.error || "Kunne ikke oppdatere rolle");
  }
}

export default function LeadersTab({ activityId }: { activityId: string }) {
  const supabase = createClientComponentClient();
  const [leaders, setLeaders] = useState<PersonWithMember[]>([]);
  const [allParticipants, setAllParticipants] = useState<PersonWithMember[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);

  const reload = async () => {
    setLoading(true);
    const [lRes, pRes] = await Promise.all([
      supabase
        .from("enrollments")
        .select("id, member_id, activity_id, role, member:members (id, first_name, last_name, email)")
        .eq("activity_id", activityId)
        .eq("role", "leader")
        .order("id", { ascending: true }),
      supabase
        .from("enrollments")
        .select("id, member_id, activity_id, role, member:members (id, first_name, last_name, email)")
        .eq("activity_id", activityId)
        .order("id", { ascending: true }),
    ]);

    if (lRes.error || pRes.error) {
      console.error(lRes.error || pRes.error);
      setLeaders([]);
      setAllParticipants([]);
    } else {
      setLeaders(sanitizeRows(lRes.data as RawPersonWithMember[] | null));
      setAllParticipants(sanitizeRows(pRes.data as RawPersonWithMember[] | null));
    }
    setLoading(false);
  };

  useEffect(() => {
    let alive = true;
    (async () => {
      await reload();
    })();
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activityId]);

  const notLeaders = allParticipants.filter((x) => x.role !== "leader");

  const promote = async (memberId: string) => {
    setBusy(true);
    try {
      await setRole(activityId, memberId, "leader");
      await reload();
    } catch (e) {
      alert((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const demote = async (memberId: string) => {
    setBusy(true);
    try {
      await setRole(activityId, memberId, "participant");
      await reload();
    } catch (e) {
      alert((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  if (loading) return <div>Laster ledere…</div>;

  return (
    <div className="space-y-6">
      <div>
        <h3 className="mb-2 text-lg font-semibold">Ledere</h3>
        {!leaders.length ? (
          <div>Ingen ledere enda.</div>
        ) : (
          <div className="space-y-2">
            {leaders.map((p) => {
              const m = p.member;
              const name = [m?.first_name, m?.last_name].filter(Boolean).join(" ") || "Ukjent";
              return (
                <div key={p.id} className="flex items-center justify-between rounded-xl border p-3">
                  <div>
                    <div className="font-medium">{name}</div>
                    {m?.email ? <div className="text-sm text-neutral-600">{m.email}</div> : null}
                  </div>
                  <button
                    disabled={busy}
                    onClick={() => demote(p.member_id)}
                    className="rounded-xl border border-neutral-300 px-3 py-1 text-sm hover:bg-neutral-100"
                    title="Fjern som leder"
                  >
                    Fjern
                  </button>
                </div>
              );
            })}
          </div>
        )}
      </div>

      <div>
        <h3 className="mb-2 text-lg font-semibold">Gjør noen til leder</h3>
        {!notLeaders.length ? (
          <div>Alle som er påmeldt er allerede ledere.</div>
        ) : (
          <div className="space-y-2">
            {notLeaders.map((p) => {
              const m = p.member;
              const name = [m?.first_name, m?.last_name].filter(Boolean).join(" ") || "Ukjent";
              return (
                <div key={p.id} className="flex items-center justify-between rounded-xl border p-3">
                  <div>
                    <div className="font-medium">{name}</div>
                    {m?.email ? <div className="text-sm text-neutral-600">{m.email}</div> : null}
                  </div>
                  <button
                    disabled={busy}
                    onClick={() => promote(p.member_id)}
                    className="rounded-xl bg-red-600 px-3 py-1 text-sm text-white hover:bg-red-700"
                    title="Gjør til leder"
                  >
                    Gjør til leder
                  </button>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
