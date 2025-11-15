"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { fetchActivity, saveActivity, ActivityType } from "@/lib/activitiesClient";
import { hardDeleteActivity } from "@/lib/client/hardDeleteActivity";

export default function ActivityEditPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const [name, setName] = useState("");
  const [description, setDescription] = useState<string>("");
  const [type, setType] = useState<ActivityType>("tilbud"); // behold norsk type i UI
  const [startDate, setStartDate] = useState<string>("");
  const [endDate, setEndDate] = useState<string>("");
  const [hasParticipants, setHasParticipants] = useState(true);
  const [hasLeaders, setHasLeaders] = useState(true);
  const [hasSessions, setHasSessions] = useState(true);
  const [hasFiles, setHasFiles] = useState(true);
  const [hasMessages, setHasMessages] = useState(true);
  const [hasGuests, setHasGuests] = useState(false);
  const [hasAttendance, setHasAttendance] = useState(false);
  const [hasVolunteers, setHasVolunteers] = useState(false);
  const [hasTasks, setHasTasks] = useState(false);

  const isEventType = String(type ?? "").toLowerCase().includes("event");

  useEffect(() => {
    (async () => {
      setLoading(true);
      try {
        const act = await fetchActivity(String(id));
        if (act) {
          setName(act.name ?? "");
          setDescription(act.description ?? "");
          setType((act.type as ActivityType) ?? "tilbud");
          setStartDate(act.start_date ?? "");
          setEndDate(act.end_date ?? "");
          setHasParticipants(
            Boolean(
              (act as any)?.has_participants ?? (act as any)?.hasParticipants ?? true
            )
          );
          setHasLeaders(
            Boolean(
              (act as any)?.has_leaders ?? (act as any)?.hasLeaders ?? true
            )
          );
          setHasSessions(
            Boolean(
              (act as any)?.has_sessions ?? (act as any)?.hasSessions ?? true
            )
          );
          setHasFiles(
            Boolean(
              (act as any)?.has_files ?? (act as any)?.hasFiles ?? true
            )
          );
          setHasMessages(
            Boolean(
              (act as any)?.has_messages ?? (act as any)?.hasMessages ?? true
            )
          );
          setHasGuests(Boolean((act as any)?.has_guests));
          setHasAttendance(Boolean((act as any)?.has_attendance));
          setHasVolunteers(Boolean((act as any)?.has_volunteers));
          setHasTasks(Boolean((act as any)?.has_tasks));
        }
      } finally {
        setLoading(false);
      }
    })();
  }, [id]);

  useEffect(() => {
    if (!isEventType) {
      setHasGuests(false);
      setHasAttendance(false);
      setHasVolunteers(false);
      setHasTasks(false);
    }
  }, [isEventType]);

  const onSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setErr(null);
    setSaving(true);
    try {
      const isEvent = isEventType;
      const payload = {
        name,
        description,
        type,
        start_date: startDate || null,
        end_date: endDate || null,
        has_participants: Boolean(hasParticipants),
        has_leaders: Boolean(hasLeaders),
        has_sessions: Boolean(hasSessions),
        has_files: Boolean(hasFiles),
        has_messages: Boolean(hasMessages),
        has_guests: isEvent ? hasGuests : false,
        has_attendance: isEvent ? hasAttendance : false,
        has_volunteers: isEvent ? hasVolunteers : false,
        has_tasks: isEvent ? hasTasks : false,
      };

      if (id) {
        const response = await fetch(`/api/activities/${id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
        const json = await response.json().catch(() => null);
        if (!response.ok) {
          throw new Error(json?.error || "Klarte ikke å lagre i databasen.");
        }
      }

      await saveActivity({
        id: String(id),
        ...payload,
      });

      router.push(`/activities/${id}`);
    } catch (e: any) {
      setErr(e?.message || "Klarte ikke å lagre.");
    } finally {
      setSaving(false);
    }
  };

  const onDelete = async () => {
    if (!id) return;
    if (!confirm("Er du sikker på at du vil slette denne aktiviteten permanent?")) return;
    setErr(null);
    setSaving(true);
    try {
      await hardDeleteActivity(String(id), { redirectToList: true });
      // redirect i helperen → /activities
    } catch (e: any) {
      setErr(e?.message || "Kunne ikke slette aktiviteten.");
      setSaving(false);
    }
  };

  if (loading) return <main className="px-4 py-8 text-neutral-900">Laster…</main>;

  return (
    <main className="mx-auto max-w-6xl px-4 py-8 text-neutral-900">
      {/* Topp-linje */}
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-3xl font-semibold tracking-tight">Rediger aktivitet</h1>
        <div className="flex items-center gap-2">
          <Link
            href={`/activities/${id}`}
            className="rounded-lg px-3.5 py-2 text-sm font-semibold text-neutral-900 ring-1 ring-neutral-300 hover:bg-neutral-900 hover:text-white"
          >
            Tilbake
          </Link>
          <button
            type="button"
            onClick={onDelete}
            disabled={saving}
            className="rounded-lg px-3.5 py-2 text-sm font-semibold text-red-700 ring-1 ring-red-300 hover:bg-red-50 disabled:opacity-60"
            title="Slett aktiviteten permanent"
          >
            Slett
          </button>
          <button
            onClick={onSave}
            disabled={saving}
            className="rounded-lg bg-red-600 px-3.5 py-2 text-sm font-semibold text-white hover:bg-red-700 disabled:opacity-60"
          >
            {saving ? "Lagrer…" : "Lagre"}
          </button>
        </div>
      </div>

      {/* Info-kort – samme look som 'Opprett' */}
      <form onSubmit={onSave} className="space-y-6">
        {/* Grunninfo */}
        <section className="rounded-2xl bg-white p-5 shadow-sm ring-1 ring-black/5">
          <div className="grid gap-5 md:grid-cols-2">
            <div>
              <label className="block text-sm font-medium text-neutral-800">Navn</label>
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="mt-1 w-full rounded-lg border border-neutral-300 bg-white px-4 py-2 text-[15px] text-neutral-900 placeholder:text-neutral-500 focus:outline-none focus:ring-2 focus:ring-red-600"
                placeholder="Navn på aktivitet"
                required
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-neutral-800">Kategori</label>
              <div className="mt-1 inline-flex rounded-xl bg-white p-1 ring-1 ring-neutral-300">
                {(["tilbud", "event", "forestilling"] as ActivityType[]).map((t) => (
                  <button
                    key={t}
                    type="button"
                    onClick={() => setType(t)}
                    className={`mx-0.5 rounded-lg px-3.5 py-1.5 text-sm font-medium ${
                      type === t ? "bg-black text-white" : "text-neutral-900 hover:bg-neutral-100"
                    }`}
                  >
                    {t === "tilbud" ? "Tilbud" : t === "event" ? "Event" : "Forestilling"}
                  </button>
                ))}
              </div>
              <p className="mt-1 text-xs text-neutral-600">
                Velg <b>Forestilling</b> for produksjoner, <b>Tilbud</b> for løpende grupper, og <b>Event</b> for enkeltarrangementer.
              </p>
            </div>

            <div className="md:col-span-2">
              <label className="block text-sm font-medium text-neutral-800">Beskrivelse</label>
              <textarea
                rows={5}
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                className="mt-1 w-full rounded-lg border border-neutral-300 bg-white px-4 py-2 text-[15px] text-neutral-900 placeholder:text-neutral-500 focus:outline-none focus:ring-2 focus:ring-red-600"
              />
            </div>
          </div>
        </section>

        {/* Moduler */}
        <section className="rounded-2xl bg-white p-5 shadow-sm ring-1 ring-black/5">
          <h2 className="text-lg font-semibold text-black">Moduler</h2>
          <div className="mt-4 grid gap-6 md:grid-cols-2">
            <div>
              <h3 className="text-sm font-semibold text-neutral-900">Kjernefunksjoner</h3>
              <div className="mt-3 space-y-3 text-sm text-neutral-800">
                <label className="flex items-start gap-3">
                  <input
                    type="checkbox"
                    checked={hasParticipants}
                    onChange={(e) => setHasParticipants(e.target.checked)}
                    className="mt-1 h-4 w-4 rounded border-neutral-300 text-red-600 focus:ring-red-600"
                  />
                  <span>Deltakere</span>
                </label>
                <label className="flex items-start gap-3">
                  <input
                    type="checkbox"
                    checked={hasLeaders}
                    onChange={(e) => setHasLeaders(e.target.checked)}
                    className="mt-1 h-4 w-4 rounded border-neutral-300 text-red-600 focus:ring-red-600"
                  />
                  <span>Ledere</span>
                </label>
                <label className="flex items-start gap-3">
                  <input
                    type="checkbox"
                    checked={hasSessions}
                    onChange={(e) => setHasSessions(e.target.checked)}
                    className="mt-1 h-4 w-4 rounded border-neutral-300 text-red-600 focus:ring-red-600"
                  />
                  <span>Økter</span>
                </label>
                <label className="flex items-start gap-3">
                  <input
                    type="checkbox"
                    checked={hasFiles}
                    onChange={(e) => setHasFiles(e.target.checked)}
                    className="mt-1 h-4 w-4 rounded border-neutral-300 text-red-600 focus:ring-red-600"
                  />
                  <span>Filer</span>
                </label>
                <label className="flex items-start gap-3">
                  <input
                    type="checkbox"
                    checked={hasMessages}
                    onChange={(e) => setHasMessages(e.target.checked)}
                    className="mt-1 h-4 w-4 rounded border-neutral-300 text-red-600 focus:ring-red-600"
                  />
                  <span>Meldinger</span>
                </label>
              </div>
            </div>

            <div>
              <h3 className="text-sm font-semibold text-neutral-900">Event-moduler</h3>
              <div className="mt-3 space-y-3 text-sm text-neutral-800">
                <label className="flex items-start gap-3">
                  <input
                    type="checkbox"
                    checked={hasGuests}
                    onChange={(e) => setHasGuests(e.target.checked)}
                    className="mt-1 h-4 w-4 rounded border-neutral-300 text-red-600 focus:ring-red-600"
                    disabled={!isEventType}
                  />
                  <span className={!isEventType ? "text-neutral-500" : undefined}>
                    Gjester
                    {!isEventType ? (
                      <span className="block text-xs text-neutral-500">Kun tilgjengelig for eventer</span>
                    ) : null}
                  </span>
                </label>
                <label className="flex items-start gap-3">
                  <input
                    type="checkbox"
                    checked={hasAttendance}
                    onChange={(e) => setHasAttendance(e.target.checked)}
                    className="mt-1 h-4 w-4 rounded border-neutral-300 text-red-600 focus:ring-red-600"
                    disabled={!isEventType}
                  />
                  <span className={!isEventType ? "text-neutral-500" : undefined}>
                    Innsjekk
                    {!isEventType ? (
                      <span className="block text-xs text-neutral-500">Kun tilgjengelig for eventer</span>
                    ) : null}
                  </span>
                </label>
                <label className="flex items-start gap-3">
                  <input
                    type="checkbox"
                    checked={hasVolunteers}
                    onChange={(e) => setHasVolunteers(e.target.checked)}
                    className="mt-1 h-4 w-4 rounded border-neutral-300 text-red-600 focus:ring-red-600"
                    disabled={!isEventType}
                  />
                  <span className={!isEventType ? "text-neutral-500" : undefined}>
                    Frivillige
                    {!isEventType ? (
                      <span className="block text-xs text-neutral-500">Kun tilgjengelig for eventer</span>
                    ) : null}
                  </span>
                </label>
                <label className="flex items-start gap-3">
                  <input
                    type="checkbox"
                    checked={hasTasks}
                    onChange={(e) => setHasTasks(e.target.checked)}
                    className="mt-1 h-4 w-4 rounded border-neutral-300 text-red-600 focus:ring-red-600"
                    disabled={!isEventType}
                  />
                  <span className={!isEventType ? "text-neutral-500" : undefined}>
                    Oppgaver
                    {!isEventType ? (
                      <span className="block text-xs text-neutral-500">Kun tilgjengelig for eventer</span>
                    ) : null}
                  </span>
                </label>
              </div>
            </div>
          </div>
        </section>

        {/* Detaljer */}
        <section className="rounded-2xl bg-white p-5 shadow-sm ring-1 ring-black/5">
          <div className="grid gap-5 md:grid-cols-2">
            <div>
              <label className="block text-sm font-medium text-neutral-800">Startdato (valgfri)</label>
              <input
                type="date"
                value={startDate ?? ""}
                onChange={(e) => setStartDate(e.target.value)}
                className="mt-1 w-full rounded-lg border border-neutral-300 bg-white px-4 py-2 text-[15px] text-neutral-900 placeholder:text-neutral-500 focus:outline-none focus:ring-2 focus:ring-red-600"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-neutral-800">Sluttdato (valgfri)</label>
              <input
                type="date"
                value={endDate ?? ""}
                onChange={(e) => setEndDate(e.target.value)}
                className="mt-1 w-full rounded-lg border border-neutral-300 bg-white px-4 py-2 text-[15px] text-neutral-900 placeholder:text-neutral-500 focus:outline-none focus:ring-2 focus:ring-red-600"
              />
            </div>
          </div>
        </section>
      </form>
    </main>
  );
}
