"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

import {
  findMemberById,
  memberDisplayName,
  useMembersOptions,
  type MemberOption,
} from "./useMembersOptions";

const INPUT_CLASSES =
  "mt-1 w-full rounded-lg border border-neutral-300 bg-white px-3 py-2 text-sm text-neutral-900 placeholder:text-neutral-500 focus:outline-none focus:ring-2 focus:ring-red-600";
const TEXTAREA_CLASSES =
  "mt-1 w-full rounded-lg border border-neutral-300 bg-white px-3 py-2 text-sm text-neutral-900 placeholder:text-neutral-500 focus:outline-none focus:ring-2 focus:ring-red-600";

export type ActivityVolunteer = {
  id: string;
  activity_id: string;
  member_id: string;
  role: string | null;
  notes: string | null;
  created_at: string | null;
  member?: MemberOption | null;
};

type SortKey = "name" | "role";

type FormState = {
  memberId: string;
  role: string;
  notes: string;
};

const defaultFormState = (): FormState => ({
  memberId: "",
  role: "",
  notes: "",
});

function normalizeVolunteer(row: any): ActivityVolunteer {
  const member = row?.member || row?.members || null;
  const normalizedMember = member
    ? {
        id: String(member.id ?? ""),
        first_name: member.first_name ?? "",
        last_name: member.last_name ?? "",
        email: member.email ?? "",
        phone: member.phone ?? "",
      }
    : null;
  return {
    id: String(row.id ?? ""),
    activity_id: String(row.activity_id ?? ""),
    member_id: String(row.member_id ?? ""),
    role: row.role ?? null,
    notes: row.notes ?? null,
    created_at: row.created_at ?? null,
    member: normalizedMember,
  };
}

export default function VolunteersTab({
  activityId,
}: {
  activityId: string;
}) {
  const { members } = useMembersOptions();

  const [volunteers, setVolunteers] = useState<ActivityVolunteer[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [sortKey, setSortKey] = useState<SortKey>("name");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");

  const [formOpen, setFormOpen] = useState(false);
  const [formState, setFormState] = useState<FormState>(defaultFormState);
  const [editing, setEditing] = useState<ActivityVolunteer | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [formSaving, setFormSaving] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);

  const fetchVolunteers = useCallback(async () => {
    if (!activityId) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(
        `/api/activity-volunteers?activityId=${encodeURIComponent(activityId)}`,
        { cache: "no-store" }
      );
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body?.error || "Kunne ikke hente frivillige");
      }
      const data = await res.json().catch(() => []);
      const list = Array.isArray(data)
        ? (data as any[]).map((row) => normalizeVolunteer(row))
        : [];
      setVolunteers(list);
    } catch (err: any) {
      setError(err?.message || "Kunne ikke hente frivillige");
      setVolunteers([]);
    } finally {
      setLoading(false);
    }
  }, [activityId]);

  useEffect(() => {
    fetchVolunteers();
  }, [fetchVolunteers]);

  const membersMap = useMemo(() => {
    const map = new Map<string, MemberOption>();
    for (const option of members) map.set(option.id, option);
    return map;
  }, [members]);

  const sortedVolunteers = useMemo(() => {
    const items = [...volunteers];
    const valueFor = (vol: ActivityVolunteer) => {
      const member = vol.member ?? membersMap.get(vol.member_id) ?? null;
      const name = memberDisplayName(member).toLocaleLowerCase("nb");
      if (sortKey === "name") return name;
      if (sortKey === "role") return (vol.role ?? "").toLocaleLowerCase("nb");
      return name;
    };
    items.sort((a, b) => {
      const av = valueFor(a);
      const bv = valueFor(b);
      if (av < bv) return sortDir === "asc" ? -1 : 1;
      if (av > bv) return sortDir === "asc" ? 1 : -1;
      return 0;
    });
    return items;
  }, [membersMap, sortDir, sortKey, volunteers]);

  const closeForm = () => {
    setFormOpen(false);
    setEditing(null);
    setFormState(defaultFormState());
    setFormError(null);
    setFormSaving(false);
  };

  const openCreateForm = () => {
    setEditing(null);
    setFormState(defaultFormState());
    setFormError(null);
    setFormOpen(true);
  };

  const openEditForm = (volunteer: ActivityVolunteer) => {
    setEditing(volunteer);
    setFormState({
      memberId: volunteer.member_id,
      role: volunteer.role ?? "",
      notes: volunteer.notes ?? "",
    });
    setFormError(null);
    setFormOpen(true);
  };

  const onFormSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!activityId) return;
    if (!formState.memberId) {
      setFormError("Velg et medlem");
      return;
    }
    setFormSaving(true);
    setFormError(null);
    try {
      const payload = {
        activityId,
        memberId: formState.memberId,
        role: formState.role.trim() || null,
        notes: formState.notes.trim() || null,
      };

      let res: Response;
      if (editing) {
        res = await fetch(`/api/activity-volunteers/${encodeURIComponent(editing.id)}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
      } else {
        res = await fetch(`/api/activity-volunteers`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
      }

      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body?.error || "Kunne ikke lagre frivillig");
      }

      closeForm();
      await fetchVolunteers();
    } catch (err: any) {
      setFormError(err?.message || "Kunne ikke lagre frivillig");
      setFormSaving(false);
    }
  };

  const removeVolunteer = async (volunteer: ActivityVolunteer) => {
    if (!volunteer?.id) return;
    if (!confirm("Er du sikker på at du vil fjerne frivilligen?")) return;
    setBusyId(volunteer.id);
    try {
      const res = await fetch(`/api/activity-volunteers/${encodeURIComponent(volunteer.id)}`, {
        method: "DELETE",
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body?.error || "Kunne ikke slette frivillig");
      }
      await fetchVolunteers();
    } catch (err: any) {
      alert(err?.message || "Kunne ikke slette frivillig");
    } finally {
      setBusyId(null);
    }
  };

  const toggleSort = (key: SortKey) => {
    if (sortKey === key) {
      setSortDir((prev) => (prev === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      setSortDir("asc");
    }
  };

  return (
    <div className="rounded-2xl bg-white p-5 shadow-sm ring-1 ring-black/5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold text-neutral-900">Frivillige</h2>
          <p className="text-sm text-neutral-600">
            Oversikt over interne frivillige tilknyttet aktiviteten.
          </p>
        </div>
        <button
          onClick={openCreateForm}
          className="rounded-lg bg-red-600 px-3.5 py-2 text-sm font-semibold text-white hover:bg-red-700"
        >
          Legg til frivillig
        </button>
      </div>

      <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2 text-sm text-neutral-700">
          <span>Sortér etter:</span>
          <div className="inline-flex rounded-lg border border-neutral-200 bg-white">
            <button
              type="button"
              onClick={() => toggleSort("name")}
              className={`px-3 py-1 text-sm font-medium ${
                sortKey === "name" ? "bg-neutral-900 text-white" : "text-neutral-700 hover:bg-neutral-100"
              }`}
            >
              Navn
            </button>
            <button
              type="button"
              onClick={() => toggleSort("role")}
              className={`px-3 py-1 text-sm font-medium ${
                sortKey === "role" ? "bg-neutral-900 text-white" : "text-neutral-700 hover:bg-neutral-100"
              }`}
            >
              Rolle
            </button>
          </div>
          <button
            type="button"
            onClick={() => setSortDir((prev) => (prev === "asc" ? "desc" : "asc"))}
            className="rounded-lg border border-neutral-200 px-2 py-1 text-xs font-semibold text-neutral-700 hover:bg-neutral-100"
          >
            {sortDir === "asc" ? "Stigende" : "Synkende"}
          </button>
        </div>
      </div>

      {loading ? (
        <p className="mt-4 text-sm text-neutral-600">Laster frivillige…</p>
      ) : error ? (
        <p className="mt-4 text-sm text-red-600">{error}</p>
      ) : sortedVolunteers.length === 0 ? (
        <p className="mt-4 text-sm text-neutral-600">Ingen frivillige registrert.</p>
      ) : (
        <div className="mt-4 overflow-x-auto">
          <table className="min-w-full divide-y divide-neutral-200 text-left text-sm">
            <thead className="bg-neutral-50">
              <tr>
                <th className="px-3 py-2 font-semibold text-neutral-700">Navn</th>
                <th className="px-3 py-2 font-semibold text-neutral-700">Rolle</th>
                <th className="px-3 py-2 font-semibold text-neutral-700">Kontakt</th>
                <th className="px-3 py-2 font-semibold text-neutral-700">Notater</th>
                <th className="px-3 py-2 font-semibold text-neutral-700 text-right">Handlinger</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-neutral-200">
              {sortedVolunteers.map((volunteer) => {
                const member =
                  volunteer.member ??
                  findMemberById(volunteer.member_id, members) ??
                  null;
                const name = memberDisplayName(member);
                const contactParts = [member?.email || null, member?.phone || null]
                  .filter(Boolean)
                  .join(" · ");
                return (
                  <tr key={volunteer.id} className="align-top">
                    <td className="px-3 py-3 text-neutral-900">{name || "Ukjent medlem"}</td>
                    <td className="px-3 py-3 text-neutral-700">{volunteer.role || "—"}</td>
                    <td className="px-3 py-3 text-neutral-700">
                      {contactParts || <span className="text-neutral-400">Ingen kontaktinfo</span>}
                    </td>
                    <td className="px-3 py-3 text-neutral-700">
                      {volunteer.notes ? volunteer.notes : <span className="text-neutral-400">—</span>}
                    </td>
                    <td className="px-3 py-3 text-right">
                      <div className="flex justify-end gap-2">
                        <button
                          onClick={() => openEditForm(volunteer)}
                          className="rounded-lg px-3 py-1.5 text-xs font-semibold text-neutral-900 ring-1 ring-neutral-300 hover:bg-neutral-900 hover:text-white"
                        >
                          Rediger
                        </button>
                        <button
                          onClick={() => removeVolunteer(volunteer)}
                          disabled={busyId === volunteer.id}
                          className="rounded-lg px-3 py-1.5 text-xs font-semibold text-red-700 ring-1 ring-red-200 hover:bg-red-50 disabled:opacity-50"
                        >
                          Slett
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {formOpen ? (
        <form onSubmit={onFormSubmit} className="mt-6 rounded-2xl border border-neutral-200 bg-neutral-50 p-4">
          <h3 className="text-sm font-semibold text-neutral-900">
            {editing ? "Rediger frivillig" : "Ny frivillig"}
          </h3>
          <div className="mt-4 grid gap-4 md:grid-cols-2">
            <div className="md:col-span-1">
              <label className="block text-sm font-medium text-neutral-800">Medlem</label>
              <select
                value={formState.memberId}
                onChange={(event) =>
                  setFormState((prev) => ({ ...prev, memberId: event.target.value }))
                }
                className={INPUT_CLASSES}
                required
              >
                <option value="">Velg medlem…</option>
                {members.map((member) => (
                  <option key={member.id} value={member.id}>
                    {memberDisplayName(member)}
                    {member.email ? ` · ${member.email}` : ""}
                  </option>
                ))}
              </select>
            </div>
            <div className="md:col-span-1">
              <label className="block text-sm font-medium text-neutral-800">Rolle</label>
              <input
                value={formState.role}
                onChange={(event) =>
                  setFormState((prev) => ({ ...prev, role: event.target.value }))
                }
                className={INPUT_CLASSES}
                placeholder="F.eks. Kjøkken, Vert i døra"
              />
            </div>
            <div className="md:col-span-2">
              <label className="block text-sm font-medium text-neutral-800">Notater</label>
              <textarea
                value={formState.notes}
                onChange={(event) =>
                  setFormState((prev) => ({ ...prev, notes: event.target.value }))
                }
                className={TEXTAREA_CLASSES}
                rows={3}
                placeholder="Tilleggsinformasjon"
              />
            </div>
          </div>
          {formError ? (
            <p className="mt-3 text-sm text-red-600">{formError}</p>
          ) : null}
          <div className="mt-4 flex items-center justify-end gap-2">
            <button
              type="button"
              onClick={closeForm}
              className="rounded-lg px-3.5 py-2 text-sm font-semibold text-neutral-700 ring-1 ring-neutral-300 hover:bg-neutral-100"
            >
              Avbryt
            </button>
            <button
              type="submit"
              disabled={formSaving}
              className="rounded-lg bg-red-600 px-3.5 py-2 text-sm font-semibold text-white hover:bg-red-700 disabled:opacity-50"
            >
              {formSaving ? "Lagrer…" : editing ? "Lagre endringer" : "Legg til"}
            </button>
          </div>
        </form>
      ) : null}
    </div>
  );
}
