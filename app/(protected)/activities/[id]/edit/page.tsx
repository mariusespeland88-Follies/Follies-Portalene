"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import {
  fetchActivity,
  saveActivity,
  ActivityType,
} from "@/lib/activitiesClient";
import { hardDeleteActivity } from "@/lib/client/hardDeleteActivity";

type ActivityTab =
  | "oversikt"
  | "deltakere"
  | "ledere"
  | "okter"
  | "gjester"
  | "innsjekk"
  | "frivillige"
  | "oppgaver"
  | "filer"
  | "meldinger";

const ALL_TABS: { key: ActivityTab; label: string }[] = [
  { key: "oversikt", label: "Oversikt" },
  { key: "deltakere", label: "Deltakere" },
  { key: "ledere", label: "Ledere" },
  { key: "okter", label: "Økter" },
  { key: "gjester", label: "Gjester" },
  { key: "innsjekk", label: "Innsjekk" },
  { key: "frivillige", label: "Frivillige" },
  { key: "oppgaver", label: "Oppgaver" },
  { key: "filer", label: "Filer" },
  { key: "meldinger", label: "Meldinger" },
];

const DEFAULT_TABS_BASE: ActivityTab[] = [
  "oversikt",
  "deltakere",
  "ledere",
  "okter",
  "filer",
  "meldinger",
];

const ensureOversikt = (tabs: ActivityTab[]): ActivityTab[] => {
  const set = new Set<ActivityTab>(tabs);
  set.add("oversikt");
  return Array.from(set);
};

// Normaliser type for intern logikk: "offer" | "event" | "forestilling"
function normalizeTypeForUi(raw: string | null | undefined): ActivityType {
  const v = String(raw ?? "").toLowerCase();
  if (v.includes("event")) return "event";
  if (v.includes("forest")) return "forestilling";
  // både "tilbud" og "offer" havner her:
  return "offer";
}

export default function ActivityEditPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const [name, setName] = useState("");
  const [description, setDescription] = useState<string>("");
  const [type, setType] = useState<ActivityType>("offer"); // intern: "offer" | "event" | "forestilling"
  const [startDate, setStartDate] = useState<string>("");
  const [endDate, setEndDate] = useState<string>("");
  const [hasGuests, setHasGuests] = useState(false);
  const [hasAttendance, setHasAttendance] = useState(false);
  const [hasVolunteers, setHasVolunteers] = useState(false);
  const [hasTasks, setHasTasks] = useState(false);

  const [tabs, setTabs] = useState<ActivityTab[]>(DEFAULT_TABS_BASE);

  useEffect(() => {
    (async () => {
      setLoading(true);
      try {
        const act = await fetchActivity(String(id));
        if (act) {
          setName(act.name ?? "");
          setDescription((act as any).description ?? "");

          const uiType = normalizeTypeForUi((act as any).type);
          setType(uiType);

          setStartDate((act as any).start_date ?? "");
          setEndDate((act as any).end_date ?? "");

          const g = Boolean((act as any)?.has_guests);
          const a = Boolean((act as any)?.has_attendance);
          const v = Boolean((act as any)?.has_volunteers);
          const t = Boolean((act as any)?.has_tasks);

          setHasGuests(g);
          setHasAttendance(a);
          setHasVolunteers(v);
          setHasTasks(t);

          // tab_config fra DB hvis finnes
          const rawTabs = (act as any).tab_config as string[] | null | undefined;
          const validSet = new Set<ActivityTab>(ALL_TABS.map((x) => x.key));

          let initialTabs: ActivityTab[] = [];

          if (Array.isArray(rawTabs) && rawTabs.length) {
            for (const entry of rawTabs) {
              const key = String(entry) as ActivityTab;
              if (validSet.has(key) && !initialTabs.includes(key)) {
                initialTabs.push(key);
              }
            }
          } else {
            // fallback basert på type + has_*-flagg
            initialTabs = [...DEFAULT_TABS_BASE];
            const isEvent =
              String((act as any).type ?? "").toLowerCase().includes("event");

            if (isEvent) {
              if (g) initialTabs.push("gjester");
              if (a) initialTabs.push("innsjekk");
              if (v) initialTabs.push("frivillige");
              if (t) initialTabs.push("oppgaver");
            }
          }

          setTabs(ensureOversikt(initialTabs));
        }
      } finally {
        setLoading(false);
      }
    })();
  }, [id]);

  // Hvis man bytter bort fra event → slå av event-flagg og tilhørende faner
  useEffect(() => {
    const isEvent = String(type ?? "").toLowerCase().includes("event");
    if (!isEvent) {
      setHasGuests(false);
      setHasAttendance(false);
      setHasVolunteers(false);
      setHasTasks(false);
      setTabs((prev) => {
        const set = new Set<ActivityTab>(prev);
        set.delete("gjester");
        set.delete("innsjekk");
        set.delete("frivillige");
        set.delete("oppgaver");
        return ensureOversikt(Array.from(set));
      });
    }
  }, [type]);

  // Sørg for at event-flagg og tabs henger sammen
  useEffect(() => {
    const isEvent = String(type ?? "").toLowerCase().includes("event");
    if (!isEvent) return;

    setTabs((prevTabs) => {
      const set = new Set<ActivityTab>(prevTabs);
      if (hasGuests) set.add("gjester");
      else set.delete("gjester");

      if (hasAttendance) set.add("innsjekk");
      else set.delete("innsjekk");

      if (hasVolunteers) set.add("frivillige");
      else set.delete("frivillige");

      if (hasTasks) set.add("oppgaver");
      else set.delete("oppgaver");

      return ensureOversikt(Array.from(set));
    });
  }, [type, hasGuests, hasAttendance, hasVolunteers, hasTasks]);

  const onSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setErr(null);
    setSaving(true);
    try {
      const isEvent = String(type ?? "").toLowerCase().includes("event");

      const cleanedTabs = ensureOversikt(tabs);

      const payload = {
        name,
        description,
        type, // "offer" | "event" | "forestilling" i DB
        start_date: startDate || null,
        end_date: endDate || null,
        has_guests: isEvent ? hasGuests : false,
        has_attendance: isEvent ? hasAttendance : false,
        has_volunteers: isEvent ? hasVolunteers : false,
        has_tasks: isEvent ? hasTasks : false,
        tab_config: cleanedTabs,
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
    if (
      !confirm(
        "Er du sikker på at du vil slette denne aktiviteten permanent?"
      )
    )
      return;
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

  if (loading)
    return <main className="px-4 py-8 text-neutral-900">Laster…</main>;

  return (
    <main className="mx-auto max-w-6xl px-4 py-8 text-neutral-900">
      {/* Topp-linje */}
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-3xl font-semibold tracking-tight">
          Rediger aktivitet
        </h1>
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

      {err && (
        <div className="mb-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
          {err}
        </div>
      )}

      {/* Info-kort – samme look som 'Opprett' */}
      <form onSubmit={onSave} className="space-y-6">
        {/* Grunninfo */}
        <section className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm">
          <div className="grid gap-5 md:grid-cols-2">
            <div>
              <label className="block text-sm font-medium text-neutral-800">
                Navn
              </label>
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="mt-1 w-full rounded-lg border border-neutral-300 bg-white px-4 py-2 text-[15px] text-neutral-900 placeholder:text-neutral-500 focus:outline-none focus:ring-2 focus:ring-red-600"
                placeholder="Navn på aktivitet"
                required
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-neutral-800">
                Kategori
              </label>
              <div className="mt-1 inline-flex rounded-xl bg-white p-1 ring-1 ring-neutral-300">
                {(
                  [
                    ["offer", "Tilbud"],
                    ["event", "Event"],
                    ["forestilling", "Forestilling"],
                  ] as const
                ).map(([val, label]) => (
                  <button
                    key={val}
                    type="button"
                    onClick={() => setType(val as ActivityType)}
                    className={`mx-0.5 rounded-lg px-3.5 py-1.5 text-sm font-medium ${
                      type === val
                        ? "bg-black text-white"
                        : "text-neutral-900 hover:bg-neutral-100"
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>
              <p className="mt-1 text-xs text-neutral-600">
                Velg <b>Forestilling</b> for produksjoner, <b>Tilbud</b> for
                løpende grupper, og <b>Event</b> for enkeltarrangementer.
              </p>
            </div>

            {String(type ?? "").toLowerCase().includes("event") && (
              <div className="md:col-span-2 rounded-xl border border-neutral-200 bg-neutral-50 p-4">
                <h3 className="text-sm font-semibold text-neutral-900">
                  Event-valg
                </h3>
                <div className="mt-3 space-y-3 text-sm text-neutral-800">
                  <label className="flex items-start gap-3">
                    <input
                      type="checkbox"
                      checked={hasGuests}
                      onChange={(e) => setHasGuests(e.target.checked)}
                      className="mt-1 h-4 w-4 rounded border-neutral-300 text-red-600 focus:ring-red-600"
                    />
                    <span>Har gjester (f.eks. familier på Julaften)</span>
                  </label>
                  <label className="flex items-start gap-3">
                    <input
                      type="checkbox"
                      checked={hasAttendance}
                      onChange={(e) => setHasAttendance(e.target.checked)}
                      className="mt-1 h-4 w-4 rounded border-neutral-300 text-red-600 focus:ring-red-600"
                    />
                    <span>Har innsjekk / oppmøte</span>
                  </label>
                  <label className="flex items-start gap-3">
                    <input
                      type="checkbox"
                      checked={hasVolunteers}
                      onChange={(e) => setHasVolunteers(e.target.checked)}
                      className="mt-1 h-4 w-4 rounded border-neutral-300 text-red-600 focus:ring-red-600"
                    />
                    <span>Har frivillige (intern stab/medlemmer)</span>
                  </label>
                  <label className="flex items-start gap-3">
                    <input
                      type="checkbox"
                      checked={hasTasks}
                      onChange={(e) => setHasTasks(e.target.checked)}
                      className="mt-1 h-4 w-4 rounded border-neutral-300 text-red-600 focus:ring-red-600"
                    />
                    <span>Har oppgaver / sjekkliste</span>
                  </label>
                </div>
              </div>
            )}

            <div className="md:col-span-2">
              <label className="block text-sm font_medium text-neutral-800">
                Beskrivelse
              </label>
              <textarea
                rows={5}
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                className="mt-1 w-full rounded-lg border border-neutral-300 bg-white px-4 py-2 text-[15px] text-neutral-900 placeholder:text-neutral-500 focus:outline-none focus:ring-2 focus:ring-red-600"
              />
            </div>
          </div>
        </section>

        {/* Kategorier / faner */}
        <section className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm">
          <h2 className="text-lg font-semibold text-black">
            Kategorier / faner for denne aktiviteten
          </h2>
          <p className="mt-1 text-xs text-neutral-600">
            Juster hvilke deler som skal være synlige inne på aktiviteten. Dette
            gjelder for alle som har tilgang til aktiviteten.
          </p>
          <div className="mt-3 grid gap-2 md:grid-cols-2 lg:grid-cols-3">
            {ALL_TABS.map(({ key, label }) => {
              const checked = tabs.includes(key);
              const isOversikt = key === "oversikt";

              const isEventTab =
                key === "gjester" ||
                key === "innsjekk" ||
                key === "frivillige" ||
                key === "oppgaver";

              const isEvent =
                String(type ?? "").toLowerCase().includes("event");

              const depsOk =
                !isEventTab ||
                (isEvent &&
                  ((key === "gjester" && hasGuests) ||
                    (key === "innsjekk" && hasAttendance) ||
                    (key === "frivillige" && hasVolunteers) ||
                    (key === "oppgaver" && hasTasks)));

              const disabled = isOversikt || !depsOk;

              return (
                <label
                  key={key}
                  className={`flex items-center gap-2 rounded-lg px-2 py-1 text-sm ${
                    disabled
                      ? "cursor-not-allowed text-neutral-400"
                      : "cursor-pointer text-neutral-800 hover:bg-neutral-50"
                  }`}
                >
                  <input
                    type="checkbox"
                    className="h-4 w-4 rounded border-neutral-300 text-red-600 focus:ring-red-600"
                    checked={checked}
                    disabled={disabled}
                    onChange={(e) => {
                      const isChecked = e.target.checked;
                      setTabs((prevTabs) => {
                        const set = new Set<ActivityTab>(prevTabs);
                        if (isChecked) set.add(key);
                        else set.delete(key);
                        return ensureOversikt(Array.from(set));
                      });
                    }}
                  />
                  <span>
                    {label}
                    {isOversikt && " (alltid)"}
                    {!depsOk && isEventTab && !isEvent
                      ? " (kun for event)"
                      : null}
                    {!depsOk &&
                    isEventTab &&
                    isEvent &&
                    !checked
                      ? " (aktiver i Event-valg)"
                      : null}
                  </span>
                </label>
              );
            })}
          </div>
        </section>

        {/* Detaljer */}
        <section className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm">
          <div className="grid gap-5 md:grid-cols-2">
            <div>
              <label className="block text-sm font-medium text-neutral-800">
                Startdato (valgfri)
              </label>
              <input
                type="date"
                value={startDate ?? ""}
                onChange={(e) => setStartDate(e.target.value)}
                className="mt-1 w-full rounded-lg border border-neutral-300 bg-white px-4 py-2 text-[15px] text-neutral-900 placeholder:text-neutral-500 focus:outline-none focus:ring-2 focus:ring-red-600"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-neutral-800">
                Sluttdato (valgfri)
              </label>
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
