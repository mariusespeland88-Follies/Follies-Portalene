"use client";

import { useEffect, useState } from "react";
import { createClientComponentClient } from "@supabase/auth-helpers-nextjs";

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

export default function ParticipantsTab({ activityId }: { activityId: string }) {
  const supabase = createClientComponentClient();
  const [people, setPeople] = useState<PersonWithMember[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let alive = true;
    (async () => {
      setLoading(true);
      const { data, error } = await supabase
        .from("enrollments")
        .select("id, member_id, activity_id, role, member:members (id, first_name, last_name, email)")
        .eq("activity_id", activityId)
        .eq("role", "participant")
        .order("id", { ascending: true });

      if (!alive) return;
      if (error) {
        console.error(error);
        setPeople([]);
      } else {
        setPeople(sanitizeRows(data as RawPersonWithMember[] | null));
      }
      setLoading(false);
    })();
    return () => { alive = false; };
  }, [activityId, supabase]);

  if (loading) return <div>Laster deltakere…</div>;
  if (!people.length) return <div>Ingen deltakere enda.</div>;

  return (
    <div className="space-y-2">
      {people.map((p) => {
        const m = p.member;
        const name = [m?.first_name, m?.last_name].filter(Boolean).join(" ") || "Ukjent";
        return (
          <div key={p.id} className="rounded-xl border p-3">
            <div className="font-medium">{name}</div>
            {m?.email ? <div className="text-sm text-neutral-600">{m.email}</div> : null}
          </div>
        );
      })}
    </div>
  );
}
