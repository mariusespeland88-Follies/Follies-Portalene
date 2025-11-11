"use client";

import { useEffect, useState } from "react";
import { createClientComponentClient } from "@supabase/auth-helpers-nextjs";

type Member = { id: string; first_name?: string | null; last_name?: string | null; email?: string | null };
type PersonWithMember = { id: string; member_id: string; activity_id: string; role: "participant" | "leader"; member: Member | null };

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
        setPeople((data ?? []) as PersonWithMember[]);
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
