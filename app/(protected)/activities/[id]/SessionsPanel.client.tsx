"use client";

import { useEffect, useMemo, useState } from "react";

type AnyObj = Record<string, any>;

interface Props {
  activityId: string;
  activityName: string;
  sessions: AnyObj[];
  setSessions: (s: AnyObj[]) => void;
  participants: AnyObj[];
  leaders: AnyObj[];
  enrolledIds: string[];
}

type SessionDraft = {
  title: string;
  date: string;      // YYYY-MM-DD
  startTime: string; // HH:MM
  endTime: string;   // HH:MM
  location: string;
  note: string;

  useAllEnrolled: boolean;
  targetIds: string[];
};

const emptyDraft: SessionDraft = {
  title: "",
  date: "",
  startTime: "",
  endTime: "",
  location: "",
  note: "",
  useAllEnrolled: true,
  targetIds: [],
};

function toISO(date: string, time: string) {
  return new Date(`${date}T${time}:00`).toISOString();
}

function fromISO(iso: string) {
  const d = new Date(iso);
  const date = d.toISOString().slice(0, 10);
  const hh = String(d.getHours()).padStart(2, "0");
  const mm = String(d.getMinutes()).padStart(2, "0");
  return { date, time: `${hh}:${mm}` };
}

function uniq(list: AnyObj[]) {
  const out: AnyObj[] = [];
  const seen = new Set<string>();
  for (const x of list ?? []) {
    const id = String(x?.id ?? "");
    if (!id) continue;
    if (seen.has(id)) continue;
    seen.add(id);
    out.push(x);
  }
  return out;
}

export default function SessionsPanel(props: Props) {
  const { activityId, sessions, setSessions, enrolledIds, participants, leaders } = props;

  const [draft, setDraft] = useState<SessionDraft>(emptyDraft);
  const [editingId, setEditingId] = useState<string | null>(null);

  const [status, setStatus] = useState<"idle" | "loading" | "ok" | "error">("idle");
  const [err, setErr] = useState<string | null>(null);

  const enrolledMap = useMemo(() => {
    const m: Record<string, AnyObj> = {};
    for (const p of participants ?? []) {
      const id = String(p?.id ?? p?.member_id ?? "");
      if (id) m[id] = p;
    }
    for (const l of leaders ?? []) {
      const id = String(l?.id ?? l?.member_id ?? "");
      if (id) m[id] = l;
    }
    return m;
  }, [participants, leaders]);

  const labelForMember = (id: string) => {
    const x = enrolledMap[id];
    const name =
      x?.name ||
      [x?.first_name, x?.last_name].filter(Boolean).join(" ") ||
      x?.email ||
      "";
    return String(name || "Uten navn");
  };

  const refresh = async () => {
    setStatus("loading");
    setErr(null);
    try {
      const res = await fetch("/api/sessions/list", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ activityId }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json?.error || "Failed");

      const list = uniq(json.sessions ?? []);
      setSessions(list);
      setStatus("ok");
    } catch (e: any) {
      setStatus("error");
      setErr(String(e?.message ?? e));
    }
  };

  useEffect(() => {
    void refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activityId]);

  const resetDraft = () => {
    setDraft(emptyDraft);
    setEditingId(null);
  };

  const toggleTarget = (memberId: string) => {
    setDraft((d) => {
      const set = new Set((d.targetIds ?? []).map(String));
      if (set.has(memberId)) set.delete(memberId);
      else set.add(memberId);
      return { ...d, targetIds: Array.from(set) };
    });
  };

  const handleEdit = (s: AnyObj) => {
    // s.start_at ligger i DB-data → vi får den ikke i list-responsen nå,
    // så edit blir basert på date/time fra UI (som vi har)
    setDraft({
      title: s.title ?? "",
      date: s.date ?? "",
      startTime: s.startTime ?? "",
      endTime: s.endTime ?? "",
      location: s.location ?? "",
      note: s.note ?? "",
      useAllEnrolled: (s.targetIds?.length ?? 0) === 0,
      targetIds: Array.isArray(s.targetIds) ? s.targetIds.map(String) : [],
    });
    setEditingId(String(s.id));
  };

  const handleSave = async () => {
    if (!draft.date || !draft.startTime) {
      alert("Dato og starttid må fylles ut.");
      return;
    }

    const start_at = toISO(draft.date, draft.startTime);
    const end_at = draft.endTime ? toISO(draft.date, draft.endTime) : null;

    const chosenTargets = draft.useAllEnrolled
      ? (enrolledIds ?? []).map(String).filter(Boolean)
      : (draft.targetIds ?? []).map(String).filter(Boolean);

    if (!draft.useAllEnrolled && chosenTargets.length === 0) {
      alert("Velg minst én person, eller huk av for “Alle påmeldte”.");
      return;
    }

    setStatus("loading");
    setErr(null);

    try {
      const res = await fetch("/api/sessions/upsert", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          sessionId: editingId,
          activityId,
          title: draft.title || "Økt",
          start_at,
          end_at,
          location: draft.location || null,
          note: draft.note || null,
          targetIds: chosenTargets,
        }),
      });

      const json = await res.json();
      if (!res.ok) throw new Error(json?.error || "Failed");

      await refresh();
      setStatus("ok");
      resetDraft();
    } catch (e: any) {
      setStatus("error");
      setErr(String(e?.message ?? e));
      alert("Kunne ikke lagre økt. Se feil i panelet over.");
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Er du sikker på at du vil slette denne økten?")) return;

    setStatus("loading");
    setErr(null);

    try {
      const res = await fetch("/api/sessions/delete", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ sessionId: id }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json?.error || "Failed");

      await refresh();
      setStatus("ok");
    } catch (e: any) {
      setStatus("error");
      setErr(String(e?.message ?? e));
      alert("Kunne ikke slette økt. Se feil i panelet over.");
    }
  };

  const list = uniq(sessions);

  return (
    <div className="space-y-6">
      <div className="rounded-xl border border-neutral-800 bg-neutral-950/60 p-4 text-sm text-neutral-200">
        <p className="font-semibold mb-1">Økter for denne aktiviteten</p>
        <p className="text-neutral-400">
          Økter leses/skrives fra databasen (Supabase) via server-API.
        </p>

        {status === "error" && err ? (
          <div className="mt-3 rounded-lg border border-red-800 bg-red-950/30 p-3 text-xs text-red-200">
            <div className="font-semibold">Feil</div>
            <div className="mt-1 text-red-200/80">{err}</div>
          </div>
        ) : null}

        {status === "ok" ? (
          <div className="mt-3 flex flex-wrap gap-2 text-xs">
            <span className="rounded-full border border-green-800 bg-green-950/30 px-3 py-1 text-green-200">
              Synk OK
            </span>
            <button
              type="button"
              onClick={refresh}
              className="rounded-full border border-neutral-600 px-3 py-1 hover:border-red-500 hover:text-red-300"
            >
              Oppdater
            </button>
          </div>
        ) : null}
      </div>

      <div className="rounded-xl border border-neutral-800 bg-neutral-950/60 p-4">
        <h2 className="mb-3 text-base font-semibold text-neutral-100">Planlagte økter</h2>

        {list.length === 0 ? (
          <p className="text-sm text-neutral-400">
            Ingen økter registrert ennå. Legg til den første økten i skjemaet under.
          </p>
        ) : (
          <div className="space-y-3">
            {list.map((s: AnyObj) => {
              const targetMembers = Array.isArray(s.targetMembers) ? s.targetMembers : [];
              const targetCount = Array.isArray(s.targetIds) ? s.targetIds.length : 0;

              // Pen målgruppe-tekst, ikke UUID
              const targetLabel =
                targetCount === 0 ? "Målgruppe: Alle" : `Målgruppe: ${targetCount} valgt`;

              return (
                <div
                  key={String(s.id)}
                  className="flex flex-col gap-2 rounded-lg border border-neutral-800 bg-neutral-900/60 p-3 md:flex-row md:items-center md:justify-between"
                >
                  <div className="space-y-1">
                    <div className="text-sm font-semibold text-neutral-100">{s.title || "Økt"}</div>
                    <div className="text-xs text-neutral-300">
                      {s.date || "Dato"} {s.startTime ? <>kl. {s.startTime}{s.endTime ? `–${s.endTime}` : null}</> : null}
                    </div>
                    <div className="text-xs text-neutral-400">{targetLabel}</div>

                    {targetMembers.length ? (
                      <div className="text-xs text-neutral-500">
                        {targetMembers.slice(0, 4).map((m: any) => m?.name).filter(Boolean).join(", ")}
                        {targetMembers.length > 4 ? ` +${targetMembers.length - 4}` : ""}
                      </div>
                    ) : null}

                    {(s.location || s.note) && (
                      <div className="text-xs text-neutral-400">
                        {s.location && <span>Sted: {s.location}. </span>}
                        {s.note && <span>Notat: {s.note}</span>}
                      </div>
                    )}
                  </div>

                  <div className="flex flex-wrap gap-2 text-xs">
                    <button
                      type="button"
                      onClick={() => handleEdit(s)}
                      className="rounded-full border border-neutral-600 px-3 py-1 hover:border-red-500 hover:text-red-300"
                    >
                      Rediger
                    </button>
                    <button
                      type="button"
                      onClick={() => handleDelete(String(s.id))}
                      className="rounded-full border border-neutral-700 px-3 py-1 text-red-300 hover:border-red-600 hover:bg-red-900/30"
                    >
                      Slett
                    </button>
                    <a
                      href={`/sessions/${encodeURIComponent(String(s.id))}`}
                      className="rounded-full border border-neutral-600 px-3 py-1 hover:border-red-500 hover:text-red-300"
                    >
                      Åpne
                    </a>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      <div className="rounded-xl border border-neutral-800 bg-neutral-950/60 p-4">
        <h2 className="mb-3 text-base font-semibold text-neutral-100">{editingId ? "Rediger økt" : "Ny økt"}</h2>

        <div className="grid gap-3 md:grid-cols-2">
          <div className="space-y-1">
            <label className="text-xs font-medium text-neutral-300">Tittel</label>
            <input
              className="w-full rounded-md border border-neutral-700 bg-neutral-900 px-2 py-1 text-sm text-neutral-100 outline-none focus:border-red-500"
              value={draft.title}
              onChange={(e) => setDraft((d) => ({ ...d, title: e.target.value }))}
              placeholder="F.eks. Øving"
            />
          </div>

          <div className="space-y-1">
            <label className="text-xs font-medium text-neutral-300">Dato</label>
            <input
              type="date"
              className="w-full rounded-md border border-neutral-700 bg-neutral-900 px-2 py-1 text-sm text-neutral-100 outline-none focus:border-red-500"
              value={draft.date}
              onChange={(e) => setDraft((d) => ({ ...d, date: e.target.value }))}
            />
          </div>

          <div className="space-y-1">
            <label className="text-xs font-medium text-neutral-300">Start</label>
            <input
              type="time"
              className="w-full rounded-md border border-neutral-700 bg-neutral-900 px-2 py-1 text-sm text-neutral-100 outline-none focus:border-red-500"
              value={draft.startTime}
              onChange={(e) => setDraft((d) => ({ ...d, startTime: e.target.value }))}
            />
          </div>

          <div className="space-y-1">
            <label className="text-xs font-medium text-neutral-300">Slutt (valgfritt)</label>
            <input
              type="time"
              className="w-full rounded-md border border-neutral-700 bg-neutral-900 px-2 py-1 text-sm text-neutral-100 outline-none focus:border-red-500"
              value={draft.endTime}
              onChange={(e) => setDraft((d) => ({ ...d, endTime: e.target.value }))}
            />
          </div>

          <div className="space-y-1">
            <label className="text-xs font-medium text-neutral-300">Sted (valgfritt)</label>
            <input
              className="w-full rounded-md border border-neutral-700 bg-neutral-900 px-2 py-1 text-sm text-neutral-100 outline-none focus:border-red-500"
              value={draft.location}
              onChange={(e) => setDraft((d) => ({ ...d, location: e.target.value }))}
              placeholder="F.eks. Metro – Storsal"
            />
          </div>

          <div className="space-y-1 md:col-span-2">
            <label className="text-xs font-medium text-neutral-300">Notat (valgfritt)</label>
            <textarea
              className="w-full rounded-md border border-neutral-700 bg-neutral-900 px-2 py-1 text-sm text-neutral-100 outline-none focus:border-red-500"
              rows={3}
              value={draft.note}
              onChange={(e) => setDraft((d) => ({ ...d, note: e.target.value }))}
              placeholder="Hva skal vi gjøre i økten?"
            />
          </div>

          <div className="space-y-2 md:col-span-2">
            <div className="flex items-center justify-between gap-3">
              <label className="text-xs font-medium text-neutral-300">Hvem gjelder økten for?</label>
              <label className="flex items-center gap-2 text-xs text-neutral-300">
                <input
                  type="checkbox"
                  checked={draft.useAllEnrolled}
                  onChange={(e) =>
                    setDraft((d) => ({
                      ...d,
                      useAllEnrolled: e.target.checked,
                      targetIds: e.target.checked ? [] : d.targetIds,
                    }))
                  }
                />
                Alle påmeldte
              </label>
            </div>

            {!draft.useAllEnrolled ? (
              <div className="grid gap-2 rounded-lg border border-neutral-800 bg-neutral-900/50 p-3 md:grid-cols-2">
                {(enrolledIds ?? []).map((id) => {
                  const mid = String(id);
                  const checked = (draft.targetIds ?? []).includes(mid);
                  return (
                    <label key={mid} className="flex items-center gap-2 text-xs text-neutral-200">
                      <input type="checkbox" checked={checked} onChange={() => toggleTarget(mid)} />
                      <span className="truncate">{labelForMember(mid)}</span>
                    </label>
                  );
                })}
              </div>
            ) : (
              <p className="text-xs text-neutral-400">Standard: alle påmeldte.</p>
            )}
          </div>
        </div>

        <div className="mt-4 flex flex-wrap gap-2">
          <button
            type="button"
            onClick={handleSave}
            className="rounded-full bg-red-600 px-4 py-1.5 text-sm font-semibold text-white hover:bg-red-500"
          >
            {editingId ? "Lagre" : "Legg til"}
          </button>
          {editingId ? (
            <button
              type="button"
              onClick={resetDraft}
              className="rounded-full border border-neutral-600 px-4 py-1.5 text-sm text-neutral-200 hover:border-red-500 hover:text-red-300"
            >
              Avbryt
            </button>
          ) : null}
        </div>
      </div>
    </div>
  );
}
