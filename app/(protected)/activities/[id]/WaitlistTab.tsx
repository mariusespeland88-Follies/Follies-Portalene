"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

type MemberLite = {
  id: string;
  first_name: string;
  last_name: string;
  email: string;
  phone: string;
};

type WaitlistEntry = {
  id: string;
  activity_id: string;
  member_id: string;
  note: string | null;
  priority: number;
  created_at: string;
  member: MemberLite | null;
};

function fullName(member: Partial<MemberLite> | null | undefined) {
  if (!member) return "Uten navn";
  return `${member.first_name ?? ""} ${member.last_name ?? ""}`.trim() || "Uten navn";
}

function asArray<T>(value: unknown): T[] {
  return Array.isArray(value) ? (value as T[]) : [];
}

export default function WaitlistTab({
  activityId,
  onRosterChanged,
}: {
  activityId: string;
  onRosterChanged?: () => Promise<void> | void;
}) {
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [entries, setEntries] = useState<WaitlistEntry[]>([]);
  const [members, setMembers] = useState<MemberLite[]>([]);

  const [query, setQuery] = useState("");
  const [selectedMemberId, setSelectedMemberId] = useState("");
  const [note, setNote] = useState("");

  const loadWaitlist = useCallback(async () => {
    const res = await fetch(
      `/api/activity-waitlist?activityId=${encodeURIComponent(activityId)}`,
      { cache: "no-store" }
    );
    const json = await res.json().catch(() => ({}));
    if (!res.ok) {
      throw new Error(String((json as any)?.error || "Kunne ikke hente venteliste"));
    }
    const list = asArray<WaitlistEntry>((json as any)?.items);
    setEntries(list);
  }, [activityId]);

  const loadMembers = useCallback(async () => {
    const res = await fetch(`/api/members/list?limit=600`, { cache: "no-store" });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) {
      throw new Error(String((json as any)?.error || "Kunne ikke hente medlemmer"));
    }
    setMembers(asArray<MemberLite>((json as any)?.members));
  }, []);

  useEffect(() => {
    let alive = true;

    (async () => {
      try {
        setLoading(true);
        setError(null);
        await Promise.all([loadWaitlist(), loadMembers()]);
      } catch (err: any) {
        if (alive) {
          setError(err?.message || "Kunne ikke hente venteliste.");
        }
      } finally {
        if (alive) {
          setLoading(false);
        }
      }
    })();

    return () => {
      alive = false;
    };
  }, [loadMembers, loadWaitlist]);

  const waitlistMemberIds = useMemo(
    () => new Set(entries.map((entry) => String(entry.member_id))),
    [entries]
  );

  const filteredMembers = useMemo(() => {
    const q = query.trim().toLowerCase();
    const list = members.filter((member) => {
      if (waitlistMemberIds.has(String(member.id))) return false;
      if (!q) return true;
      const haystack = `${fullName(member)} ${member.email ?? ""} ${member.phone ?? ""}`.toLowerCase();
      return haystack.includes(q);
    });
    return list.slice(0, 40);
  }, [members, query, waitlistMemberIds]);

  useEffect(() => {
    if (!selectedMemberId || filteredMembers.some((member) => member.id === selectedMemberId)) {
      return;
    }
    setSelectedMemberId(filteredMembers[0]?.id ?? "");
  }, [filteredMembers, selectedMemberId]);

  async function addToWaitlist() {
    if (!selectedMemberId) {
      setError("Velg et medlem først.");
      return;
    }

    try {
      setBusyId("add");
      setError(null);
      const res = await fetch(`/api/activity-waitlist`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          activityId,
          memberId: selectedMemberId,
          note: note.trim() || null,
        }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(String((json as any)?.error || "Kunne ikke legge til på venteliste"));
      }

      const created = (json as any)?.item as WaitlistEntry | undefined;
      if (created) {
        setEntries((prev) => [...prev, created]);
      } else {
        await loadWaitlist();
      }
      setSelectedMemberId("");
      setNote("");
    } catch (err: any) {
      setError(err?.message || "Kunne ikke legge til på venteliste.");
    } finally {
      setBusyId(null);
    }
  }

  async function removeEntry(id: string) {
    try {
      setBusyId(id);
      setError(null);
      const res = await fetch(`/api/activity-waitlist?id=${encodeURIComponent(id)}`, {
        method: "DELETE",
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(String((json as any)?.error || "Kunne ikke fjerne fra venteliste"));
      }
      setEntries((prev) => prev.filter((entry) => entry.id !== id));
    } catch (err: any) {
      setError(err?.message || "Kunne ikke fjerne fra venteliste.");
    } finally {
      setBusyId(null);
    }
  }

  async function promoteEntry(id: string) {
    try {
      setBusyId(id);
      setError(null);
      const res = await fetch(`/api/activity-waitlist/promote`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(String((json as any)?.error || "Kunne ikke flytte medlemmet"));
      }

      setEntries((prev) => prev.filter((entry) => entry.id !== id));
      await onRosterChanged?.();
    } catch (err: any) {
      setError(err?.message || "Kunne ikke flytte medlemmet.");
    } finally {
      setBusyId(null);
    }
  }

  if (loading) {
    return (
      <div className="rounded-2xl border border-zinc-300 bg-white p-5 shadow-sm text-neutral-700">
        Laster venteliste…
      </div>
    );
  }

  return (
    <div className="rounded-2xl border border-zinc-300 bg-white p-5 shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-lg font-semibold text-neutral-900">Venteliste</h2>
        <span className="inline-flex items-center rounded-full bg-black/85 px-3 py-1 text-xs font-semibold text-white ring-1 ring-white/10">
          {entries.length}
        </span>
      </div>

      <div className="mt-4 rounded-xl border border-zinc-200 bg-zinc-50 p-3">
        <div className="grid gap-3 md:grid-cols-2">
          <label className="text-sm text-neutral-700">
            Søk medlem
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Navn, e-post eller telefon"
              className="mt-1 w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm text-neutral-900 focus:outline-none focus:ring-2 focus:ring-red-600"
            />
          </label>

          <label className="text-sm text-neutral-700">
            Velg medlem
            <select
              value={selectedMemberId}
              onChange={(event) => setSelectedMemberId(event.target.value)}
              className="mt-1 w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm text-neutral-900 focus:outline-none focus:ring-2 focus:ring-red-600"
            >
              <option value="">Velg medlem…</option>
              {filteredMembers.map((member) => (
                <option key={member.id} value={member.id}>
                  {fullName(member)}{member.email ? ` · ${member.email}` : ""}
                </option>
              ))}
            </select>
          </label>
        </div>

        <label className="mt-3 block text-sm text-neutral-700">
          Notat (valgfritt)
          <input
            value={note}
            onChange={(event) => setNote(event.target.value)}
            placeholder="F.eks. ønsker plass på tirsdagsgruppen"
            className="mt-1 w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm text-neutral-900 focus:outline-none focus:ring-2 focus:ring-red-600"
          />
        </label>

        <div className="mt-3 flex items-center justify-end">
          <button
            onClick={addToWaitlist}
            disabled={busyId === "add"}
            className="rounded-lg bg-red-600 px-3.5 py-2 text-sm font-semibold text-white hover:bg-red-700 disabled:opacity-60"
          >
            {busyId === "add" ? "Lagrer…" : "Legg til i venteliste"}
          </button>
        </div>
      </div>

      {error ? (
        <p className="mt-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>
      ) : null}

      {entries.length === 0 ? (
        <p className="mt-4 text-sm text-neutral-700">Ingen står på venteliste enda.</p>
      ) : (
        <ul className="mt-4 divide-y divide-neutral-200">
          {entries.map((entry) => {
            const member = entry.member;
            const memberName = fullName(member);
            const isBusy = busyId === entry.id;

            return (
              <li key={entry.id} className="flex flex-wrap items-start justify-between gap-3 py-3">
                <div className="min-w-0">
                  <div className="text-[15px] font-medium text-neutral-900">{memberName}</div>
                  <div className="text-xs text-neutral-700">
                    {member?.email || "Ingen e-post"}
                    {member?.phone ? ` · ${member.phone}` : ""}
                  </div>
                  <div className="mt-1 text-xs text-neutral-600">
                    Lagt til {new Date(entry.created_at).toLocaleString("nb-NO")}
                  </div>
                  {entry.note ? (
                    <div className="mt-1 text-sm text-neutral-700">{entry.note}</div>
                  ) : null}
                </div>

                <div className="flex items-center gap-2">
                  <button
                    onClick={() => promoteEntry(entry.id)}
                    disabled={isBusy}
                    className="rounded-lg bg-red-600 px-3 py-1.5 text-sm font-semibold text-white hover:bg-red-700 disabled:opacity-60"
                  >
                    Flytt til deltakere
                  </button>
                  <button
                    onClick={() => removeEntry(entry.id)}
                    disabled={isBusy}
                    className="rounded-lg bg-white px-3 py-1.5 text-sm font-semibold text-neutral-900 ring-1 ring-neutral-300 hover:bg-neutral-100 disabled:opacity-60"
                  >
                    Fjern
                  </button>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
