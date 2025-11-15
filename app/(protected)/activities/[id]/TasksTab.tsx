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

export type ActivityTask = {
  id: string;
  activity_id: string;
  title: string;
  description: string | null;
  status: "todo" | "in_progress" | "done";
  assigned_member_id: string | null;
  due_date: string | null;
  sort_order: number | null;
  created_by: string | null;
  completed_at: string | null;
  created_at: string | null;
  member?: MemberOption | null;
};

type FormState = {
  title: string;
  description: string;
  status: "todo" | "in_progress" | "done";
  assignedMemberId: string;
  dueDate: string;
};

const statusOptions: { value: ActivityTask["status"]; label: string }[] = [
  { value: "todo", label: "Ikke startet" },
  { value: "in_progress", label: "Pågår" },
  { value: "done", label: "Ferdig" },
];

const defaultFormState = (): FormState => ({
  title: "",
  description: "",
  status: "todo",
  assignedMemberId: "",
  dueDate: "",
});

const normalizeTask = (row: any): ActivityTask => {
  const member = row?.member || row?.members || row?.assigned_member || null;
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
    title: String(row.title ?? ""),
    description: row.description ?? null,
    status: (row.status ?? "todo") as ActivityTask["status"],
    assigned_member_id: row.assigned_member_id ? String(row.assigned_member_id) : null,
    due_date: row.due_date ?? null,
    sort_order: typeof row.sort_order === "number" ? row.sort_order : Number(row.sort_order ?? 0) || 0,
    created_by: row.created_by ? String(row.created_by) : null,
    completed_at: row.completed_at ?? null,
    created_at: row.created_at ?? null,
    member: normalizedMember,
  };
};

const formatDueDate = (value: string | null) => {
  if (!value) return "Ingen frist";
  try {
    return new Date(value).toLocaleDateString("nb-NO");
  } catch {
    return value;
  }
};

const formatDateTime = (value: string | null) => {
  if (!value) return "Ukjent";
  try {
    return new Date(value).toLocaleString("nb-NO");
  } catch {
    return value;
  }
};

export default function TasksTab({ activityId }: { activityId: string }) {
  const { members } = useMembersOptions();

  const [tasks, setTasks] = useState<ActivityTask[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [formState, setFormState] = useState<FormState>(defaultFormState);
  const [editing, setEditing] = useState<ActivityTask | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [formSaving, setFormSaving] = useState(false);
  const [statusBusyId, setStatusBusyId] = useState<string | null>(null);
  const [reorderBusy, setReorderBusy] = useState(false);

  const fetchTasks = useCallback(async () => {
    if (!activityId) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/activity-tasks?activityId=${encodeURIComponent(activityId)}`, {
        cache: "no-store",
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body?.error || "Kunne ikke hente oppgaver");
      }
      const data = await res.json().catch(() => []);
      const list = Array.isArray(data)
        ? (data as any[]).map((row) => normalizeTask(row))
        : [];
      setTasks(list);
    } catch (err: any) {
      setError(err?.message || "Kunne ikke hente oppgaver");
      setTasks([]);
    } finally {
      setLoading(false);
    }
  }, [activityId]);

  useEffect(() => {
    fetchTasks();
  }, [fetchTasks]);

  const membersMap = useMemo(() => {
    const map = new Map<string, MemberOption>();
    for (const option of members) map.set(option.id, option);
    return map;
  }, [members]);

  const sortedTasks = useMemo(() => {
    return [...tasks].sort((a, b) => {
      const ao = a.sort_order ?? 0;
      const bo = b.sort_order ?? 0;
      if (ao !== bo) return ao - bo;
      return a.title.localeCompare(b.title, "nb");
    });
  }, [tasks]);

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

  const openEditForm = (task: ActivityTask) => {
    setEditing(task);
    setFormState({
      title: task.title,
      description: task.description ?? "",
      status: task.status,
      assignedMemberId: task.assigned_member_id ?? "",
      dueDate: task.due_date ?? "",
    });
    setFormError(null);
    setFormOpen(true);
  };

  const onFormSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!formState.title.trim()) {
      setFormError("Tittel er påkrevd");
      return;
    }
    const payload = {
      activityId,
      title: formState.title.trim(),
      description: formState.description.trim() || null,
      status: formState.status,
      assignedMemberId: formState.assignedMemberId || null,
      dueDate: formState.dueDate || null,
    };
    setFormSaving(true);
    setFormError(null);
    try {
      let res: Response;
      if (editing) {
        res = await fetch(`/api/activity-tasks/${encodeURIComponent(editing.id)}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
      } else {
        res = await fetch(`/api/activity-tasks`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
      }
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body?.error || "Kunne ikke lagre oppgave");
      }
      closeForm();
      await fetchTasks();
    } catch (err: any) {
      setFormError(err?.message || "Kunne ikke lagre oppgave");
      setFormSaving(false);
    }
  };

  const toggleTaskStatus = async (task: ActivityTask) => {
    const nextStatus = task.status === "done" ? "todo" : "done";
    setStatusBusyId(task.id);
    try {
      const res = await fetch(`/api/activity-tasks/${encodeURIComponent(task.id)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: nextStatus }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body?.error || "Kunne ikke oppdatere status");
      }
      await fetchTasks();
    } catch (err: any) {
      alert(err?.message || "Kunne ikke oppdatere status");
    } finally {
      setStatusBusyId(null);
    }
  };

  const removeTask = async (task: ActivityTask) => {
    if (!confirm("Vil du slette oppgaven?")) return;
    try {
      const res = await fetch(`/api/activity-tasks/${encodeURIComponent(task.id)}`, {
        method: "DELETE",
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body?.error || "Kunne ikke slette oppgave");
      }
      await fetchTasks();
    } catch (err: any) {
      alert(err?.message || "Kunne ikke slette oppgave");
    }
  };

  const moveTask = async (taskId: string, direction: "up" | "down") => {
    const ordered = [...sortedTasks];
    const index = ordered.findIndex((task) => task.id === taskId);
    if (index === -1) return;
    const newIndex = direction === "up" ? index - 1 : index + 1;
    if (newIndex < 0 || newIndex >= ordered.length) return;

    const updated = [...ordered];
    const [removed] = updated.splice(index, 1);
    updated.splice(newIndex, 0, removed);

    const reindexed = updated.map((task, idx) => ({ ...task, sort_order: idx + 1 }));
    setTasks(reindexed);
    setReorderBusy(true);
    try {
      await Promise.all(
        reindexed.map((task, idx) =>
          fetch(`/api/activity-tasks/${encodeURIComponent(task.id)}`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ sortOrder: idx + 1 }),
          })
        )
      );
      await fetchTasks();
    } catch (err: any) {
      alert(err?.message || "Kunne ikke endre rekkefølge");
      await fetchTasks();
    } finally {
      setReorderBusy(false);
    }
  };

  const statusBadge = (task: ActivityTask) => {
    if (task.status === "done")
      return <span className="inline-flex items-center rounded-full bg-green-100 px-2 py-0.5 text-xs font-semibold text-green-700">Ferdig</span>;
    if (task.status === "in_progress")
      return <span className="inline-flex items-center rounded-full bg-yellow-100 px-2 py-0.5 text-xs font-semibold text-yellow-800">Pågår</span>;
    return <span className="inline-flex items-center rounded-full bg-neutral-200 px-2 py-0.5 text-xs font-semibold text-neutral-700">Todo</span>;
  };

  return (
    <div className="rounded-2xl bg-white p-5 shadow-sm ring-1 ring-black/5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold text-neutral-900">Oppgaver</h2>
          <p className="text-sm text-neutral-600">
            Planlegg aktivitetens oppgaver og følg fremdriften.
          </p>
        </div>
        <button
          onClick={openCreateForm}
          className="rounded-lg bg-red-600 px-3.5 py-2 text-sm font-semibold text-white hover:bg-red-700"
        >
          Ny oppgave
        </button>
      </div>

      {loading ? (
        <p className="mt-4 text-sm text-neutral-600">Laster oppgaver…</p>
      ) : error ? (
        <p className="mt-4 text-sm text-red-600">{error}</p>
      ) : sortedTasks.length === 0 ? (
        <p className="mt-4 text-sm text-neutral-600">Ingen oppgaver registrert.</p>
      ) : (
        <ul className="mt-4 space-y-3">
          {sortedTasks.map((task, index) => {
            const member = task.member ?? findMemberById(task.assigned_member_id, members) ?? null;
            const assigned = memberDisplayName(member);
            const dueLabel = formatDueDate(task.due_date);
            const canMoveUp = index > 0;
            const canMoveDown = index < sortedTasks.length - 1;
            return (
              <li
                key={task.id}
                className="rounded-xl border border-neutral-200 bg-neutral-50 p-4 shadow-sm"
              >
                <div className="flex flex-wrap items-start gap-3">
                  <input
                    type="checkbox"
                    checked={task.status === "done"}
                    onChange={() => toggleTaskStatus(task)}
                    disabled={statusBusyId === task.id}
                    className="mt-1 h-5 w-5 shrink-0 rounded border-neutral-300 text-red-600 focus:ring-red-600"
                    aria-label="Marker som fullført"
                  />
                  <div className="flex-1">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div>
                        <h3 className="text-base font-semibold text-neutral-900">{task.title}</h3>
                        {task.description ? (
                          <p className="mt-1 text-sm text-neutral-700">{task.description}</p>
                        ) : null}
                      </div>
                      <div className="flex flex-col items-end gap-1 text-right text-xs text-neutral-600">
                        <div>{statusBadge(task)}</div>
                        <div>{dueLabel}</div>
                        <div>{assigned ? `Tilordnet: ${assigned}` : "Ikke tilordnet"}</div>
                      </div>
                    </div>
                  </div>
                </div>
                <div className="mt-4 flex flex-wrap items-center justify-between gap-2 text-xs text-neutral-600">
                  <div>
                    {task.completed_at
                      ? `Fullført: ${formatDateTime(task.completed_at)}`
                      : `Opprettet: ${formatDateTime(task.created_at)}`}
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <button
                      type="button"
                      onClick={() => moveTask(task.id, "up")}
                      disabled={!canMoveUp || reorderBusy}
                      className="rounded-lg px-2.5 py-1 text-xs font-semibold text-neutral-700 ring-1 ring-neutral-300 hover:bg-neutral-100 disabled:opacity-40"
                    >
                      Flytt opp
                    </button>
                    <button
                      type="button"
                      onClick={() => moveTask(task.id, "down")}
                      disabled={!canMoveDown || reorderBusy}
                      className="rounded-lg px-2.5 py-1 text-xs font-semibold text-neutral-700 ring-1 ring-neutral-300 hover:bg-neutral-100 disabled:opacity-40"
                    >
                      Flytt ned
                    </button>
                    <button
                      type="button"
                      onClick={() => openEditForm(task)}
                      className="rounded-lg px-3 py-1.5 text-xs font-semibold text-neutral-900 ring-1 ring-neutral-300 hover:bg-neutral-900 hover:text-white"
                    >
                      Rediger
                    </button>
                    <button
                      type="button"
                      onClick={() => removeTask(task)}
                      className="rounded-lg px-3 py-1.5 text-xs font-semibold text-red-700 ring-1 ring-red-200 hover:bg-red-50"
                    >
                      Slett
                    </button>
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      )}

      {formOpen ? (
        <form onSubmit={onFormSubmit} className="mt-6 rounded-2xl border border-neutral-200 bg-neutral-50 p-4">
          <h3 className="text-sm font-semibold text-neutral-900">
            {editing ? "Rediger oppgave" : "Ny oppgave"}
          </h3>
          <div className="mt-4 grid gap-4 md:grid-cols-2">
            <div className="md:col-span-2">
              <label className="block text-sm font-medium text-neutral-800">Tittel</label>
              <input
                value={formState.title}
                onChange={(event) =>
                  setFormState((prev) => ({ ...prev, title: event.target.value }))
                }
                className={INPUT_CLASSES}
                required
              />
            </div>
            <div className="md:col-span-2">
              <label className="block text-sm font-medium text-neutral-800">Beskrivelse</label>
              <textarea
                value={formState.description}
                onChange={(event) =>
                  setFormState((prev) => ({ ...prev, description: event.target.value }))
                }
                className={TEXTAREA_CLASSES}
                rows={4}
                placeholder="Detaljer om oppgaven"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-neutral-800">Status</label>
              <select
                value={formState.status}
                onChange={(event) =>
                  setFormState((prev) => ({ ...prev, status: event.target.value as FormState["status"] }))
                }
                className={INPUT_CLASSES}
              >
                {statusOptions.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-neutral-800">Frist</label>
              <input
                type="date"
                value={formState.dueDate}
                onChange={(event) =>
                  setFormState((prev) => ({ ...prev, dueDate: event.target.value }))
                }
                className={INPUT_CLASSES}
              />
            </div>
            <div className="md:col-span-2">
              <label className="block text-sm font-medium text-neutral-800">Tilordnet medlem</label>
              <select
                value={formState.assignedMemberId}
                onChange={(event) =>
                  setFormState((prev) => ({ ...prev, assignedMemberId: event.target.value }))
                }
                className={INPUT_CLASSES}
              >
                <option value="">Ingen</option>
                {members.map((member) => (
                  <option key={member.id} value={member.id}>
                    {memberDisplayName(member)}
                    {member.email ? ` · ${member.email}` : ""}
                  </option>
                ))}
              </select>
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
              {formSaving ? "Lagrer…" : editing ? "Lagre endringer" : "Opprett"}
            </button>
          </div>
        </form>
      ) : null}
    </div>
  );
}
