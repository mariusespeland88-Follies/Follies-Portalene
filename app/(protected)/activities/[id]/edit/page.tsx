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

const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

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
  return "offer";
}

export default function ActivityEditPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const rawId = String(id ?? "");
  const looksLikeDbId = UUID_REGEX.test(rawId);

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const [name, setName] = useState("");
  const [description, setDescription] = useState<string>("");
  const [type, setType] = useState<ActivityType>("offer");
  const [startDate, setStartDate] = useState<string>("");
  const [endDate, setEndDate] = useState<string>("");

  const [tabs, setTabs] = useState<ActivityTab[]>(DEFAULT_TABS_BASE);

  useEffect(() => {
    (async () => {
      setLoading(true);
      try {
        const act = await fetchActivity(rawId);
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

          const rawTabs = (act as any).tab_config as
            | string[]
            | null
            | undefined;
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
            initialTabs = [...DEFAULT_TABS_BASE];
            if (g) initialTabs.push("gjester");
            if (a) initialTabs.push("innsjekk");
            if (v) initialTabs.push("frivillige");
            if (t) initialTabs.push("oppgaver");
          }

          setTabs(ensureOversikt(initialTabs));
        }
      } finally {
        setLoading(false);
      }
    })();
  }, [rawId]);

  const onSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setErr(null);
    setSaving(true);
    try {
      const cleanedTabs = ensureOversikt(tabs);

      const hasGuests = cleanedTabs.includes("gjester");
      const hasAttendance = cleanedTabs.includes("innsjekk");
      const hasVolunteers = cleanedTabs.includes("frivillige");
      const hasTasks = cleanedTabs.includes("oppgaver");

      const payload = {
        name,
        description,
        type,
        start_date: startDate || null,
        end_date: endDate || null,
        has_guests: hasGuests,
        has_attendance: hasAttendance,
        has_volunteers: hasVolunteers,
        has_tasks: hasTasks,
        tab_config: cleanedTabs,
      };

      if (rawId && looksLikeDbId) {
        const response = await fetch(`/api/activities/${rawId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
        const json = await response.json().catch(() => null);
        if (!response.ok && response.status !== 404) {
          throw new Error(json?.error || "Klarte ikke å lagre i databasen.");
        }
      }

      // Alltid speil til localStorage
      await saveActivity({
        id: rawId,
        ...payload,
      });

      router.push(`/activities/${rawId}`);
    } catch (e: any) {
      setErr(e?.message || "Klarte ikke å lagre.");
    } finally {
      setSaving(false);
    }
  };

  const onDelete = async () => {
    if (!rawId) return;
    if (
      !confirm(
        "Er du sikker på at du vil slette denne aktiviteten permanent?"
      )
    )
      return;
    setErr(null);
    setSaving(true);
    try {
      await hardDeleteActivity(String(rawId), { redirectToList: true });
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
            href={`/activities/${rawId}`}
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

            <div className="md:col-span-2">
              <label className="block text-sm font-medium text-neutral-800">
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

              return (
                <label
                  key={key}
                  className={`flex items-center gap-2 rounded-lg px-2 py-1 text-sm ${
                    isOversikt
                      ? "cursor-not-allowed text-neutral-400"
                      : "cursor-pointer text-neutral-800 hover:bg-neutral-50"
                  }`}
                >
                  <input
                    type="checkbox"
                    className="h-4 w-4 rounded border-neutral-300 text-red-600 focus:ring-red-600"
                    checked={checked}
                    disabled={isOversikt}
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
                  <span>{label}{isOversikt && " (alltid)"}</span>
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
