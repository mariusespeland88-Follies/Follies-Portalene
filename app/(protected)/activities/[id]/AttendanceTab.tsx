
"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import type { Guest } from "./GuestsTab";

type SortKey = "name" | "present";

type Props = {
  activityId: string;
  activityName?: string;
};

function formatName(guest: Guest) {
  return `${guest.first_name} ${guest.last_name}`.trim();
}

function genderLabel(value: string | null | undefined) {
  const v = (value ?? "").toLowerCase();
  if (!v) return null;
  if (v === "male" || v === "mann" || v === "gutt") return "Gutt";
  if (v === "female" || v === "kvinne" || v === "jente") return "Jente";
  if (v === "other") return "Annet";
  return "Ønsker ikke å oppgi";
}

function childrenSummary(guest: Guest) {
  if (!guest.children?.length) return "Ingen barn registrert";
  return guest.children
    .map((child) => {
      const parts: string[] = [];
      if (child.first_name) parts.push(child.first_name);
      if (typeof child.age === "number" && !Number.isNaN(child.age)) {
        parts.push(`${child.age} år`);
      }
      const gender = genderLabel(child.gender);
      if (gender) parts.push(gender);
      if (child.notes) parts.push(child.notes);
      return parts.join(" · ") || "Barn";
    })
    .join(", ");
}

export default function AttendanceTab({ activityId, activityName }: Props) {
  const [guests, setGuests] = useState<Guest[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [sortKey, setSortKey] = useState<SortKey>("name");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");
  const [busyId, setBusyId] = useState<string | null>(null);

  const fetchGuests = useCallback(async () => {
    if (!activityId) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(
        `/api/activity-guests?activityId=${encodeURIComponent(activityId)}`
      );
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body?.error || "Kunne ikke hente gjester");
      }
      const data = (await res.json()) as Guest[];
      setGuests(Array.isArray(data) ? data : []);
    } catch (e: any) {
      setError(e?.message || "Kunne ikke hente gjester");
    } finally {
      setLoading(false);
    }
  }, [activityId]);

  useEffect(() => {
    fetchGuests();
  }, [fetchGuests]);

  const totals = useMemo(() => {
    const totalGuests = guests.length;
    const totalChildren = guests.reduce(
      (sum, guest) => sum + (guest.children?.length ?? 0),
      0
    );
    const presentGuests = guests.filter((guest) => guest.present);
    const presentCount = presentGuests.length;
    const presentChildrenCount = presentGuests.reduce(
      (sum, guest) => sum + (guest.children?.length ?? 0),
      0
    );
    const attendancePercentage = totalChildren
      ? Math.round((presentChildrenCount / totalChildren) * 100)
      : 0;

    return {
      totalGuests,
      totalChildren,
      presentCount,
      presentChildrenCount,
      attendancePercentage,
    };
  }, [guests]);

  const sortedGuests = useMemo(() => {
    const copy = [...guests];
    copy.sort((a, b) => {
      if (sortKey === "present") {
        if (a.present !== b.present) {
          return sortDir === "asc"
            ? Number(a.present) - Number(b.present)
            : Number(b.present) - Number(a.present);
        }
        const aTime = a.present_marked_at ? new Date(a.present_marked_at).getTime() : 0;
        const bTime = b.present_marked_at ? new Date(b.present_marked_at).getTime() : 0;
        if (aTime !== bTime) {
          return sortDir === "asc" ? aTime - bTime : bTime - aTime;
        }
      }
      const an = formatName(a).toLowerCase();
      const bn = formatName(b).toLowerCase();
      if (an < bn) return sortDir === "asc" ? -1 : 1;
      if (an > bn) return sortDir === "asc" ? 1 : -1;
      return 0;
    });
    return copy;
  }, [guests, sortDir, sortKey]);

  const toggleSort = (key: SortKey) => {
    if (sortKey === key) {
      setSortDir((prev) => (prev === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      setSortDir(key === "present" ? "desc" : "asc");
    }
  };

  const toggleAttendance = async (guest: Guest) => {
    setBusyId(guest.id);
    const nextValue = !guest.present;
    const originalGuests = guests.map((g) => ({ ...g }));
    setGuests((prev) =>
      prev.map((g) =>
        g.id === guest.id ? { ...g, present: nextValue } : g
      )
    );

    try {
      const res = await fetch(`/api/activity-guests/${guest.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ present: nextValue }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        throw new Error(data?.error || "Kunne ikke oppdatere oppmøte");
      }
      setGuests((prev) =>
        prev.map((g) => (g.id === guest.id ? { ...g, ...data } : g))
      );
    } catch (e: any) {
      alert(e?.message || "Kunne ikke oppdatere oppmøte");
      setGuests(originalGuests);
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div className="rounded-2xl bg-white p-5 shadow-sm ring-1 ring-black/5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold text-neutral-900">Innsjekk</h2>
          {activityName && (
            <p className="text-xs text-neutral-500">{activityName}</p>
          )}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex items-center gap-2 text-xs text-neutral-600">
            <span>Sorter:</span>
            <button
              onClick={() => toggleSort("name")}
              className={`rounded-lg px-2.5 py-1 ${
                sortKey === "name"
                  ? "bg-neutral-900 text-white"
                  : "bg-neutral-100 text-neutral-800 hover:bg-neutral-200"
              } text-xs font-semibold`}
            >
              Navn
            </button>
            <button
              onClick={() => toggleSort("present")}
              className={`rounded-lg px-2.5 py-1 ${
                sortKey === "present"
                  ? "bg-neutral-900 text-white"
                  : "bg-neutral-100 text-neutral-800 hover:bg-neutral-200"
              } text-xs font-semibold`}
            >
              Oppmøte
            </button>
          </div>
          <Link
            href={`/activities/${activityId}/print-guests`}
            target="_blank"
            className="rounded-lg bg-white px-3.5 py-2 text-sm font-semibold text-neutral-900 ring-1 ring-neutral-300 hover:bg-neutral-900 hover:text-white"
          >
            Skrivevennlig utskrift
          </Link>
        </div>
      </div>

      <div className="mt-4 rounded-xl bg-neutral-50 p-4 text-sm text-neutral-800">
        <div className="flex flex-wrap gap-6">
          <div>
            <span className="text-xs uppercase text-neutral-500">Påmeldte barn</span>
            <div className="text-lg font-semibold text-neutral-900">{totals.totalChildren}</div>
          </div>
          <div>
            <span className="text-xs uppercase text-neutral-500">Møtt opp (barn)</span>
            <div className="text-lg font-semibold text-neutral-900">{totals.presentChildrenCount}</div>
          </div>
          <div>
            <span className="text-xs uppercase text-neutral-500">Oppmøteprosent</span>
            <div className="text-lg font-semibold text-neutral-900">{totals.attendancePercentage}%</div>
          </div>
          <div>
            <span className="text-xs uppercase text-neutral-500">Familier</span>
            <div className="text-lg font-semibold text-neutral-900">{totals.totalGuests}</div>
          </div>
          <div>
            <span className="text-xs uppercase text-neutral-500">Møtt opp (familier)</span>
            <div className="text-lg font-semibold text-neutral-900">{totals.presentCount}</div>
          </div>
        </div>
      </div>

      <div className="mt-5 space-y-3">
        {error ? (
          <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700">{error}</div>
        ) : loading ? (
          <div className="text-sm text-neutral-600">Laster gjester…</div>
        ) : sortedGuests.length === 0 ? (
          <div className="rounded-lg border border-neutral-200 bg-neutral-50 p-4 text-sm text-neutral-700">Ingen gjester registrert.</div>
        ) : (
          sortedGuests.map((guest) => {
            const summary = childrenSummary(guest);
            return (
              <div
                key={guest.id}
                className="rounded-xl border border-neutral-200 bg-white p-4 shadow-sm"
              >
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <div className="text-base font-semibold text-neutral-900">
                      {formatName(guest)}
                    </div>
                    <div className="text-sm text-neutral-600">Telefon: {guest.phone || "—"}</div>
                    <div className="mt-1 text-sm text-neutral-700">Barn: {summary}</div>
                  </div>
                  <label className="flex items-center gap-3 text-sm font-semibold text-neutral-800">
                    <input
                      type="checkbox"
                      checked={guest.present}
                      onChange={() => toggleAttendance(guest)}
                      disabled={busyId === guest.id}
                      className="h-5 w-5 rounded border-neutral-300 text-red-600 focus:ring-red-600"
                    />
                    <span>Møtt opp</span>
                  </label>
                </div>
                {guest.present_marked_at && (
                  <div className="mt-2 text-xs text-neutral-500">
                    Markert: {new Date(guest.present_marked_at).toLocaleString("nb-NO")}
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
