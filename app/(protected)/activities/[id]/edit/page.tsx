"use client";

import { useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { createClientComponentClient } from "@/lib/supabase/browser";
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

function shortFromText(s: string, max = 140) {
  const t = String(s ?? "").trim().replace(/\s+/g, " ");
  if (!t) return "";
  if (t.length <= max) return t;
  return t.slice(0, max - 1).trimEnd() + "…";
}

export default function ActivityEditPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const rawId = String(id ?? "");
  const looksLikeDbId = UUID_REGEX.test(rawId);

  const supabase = useMemo(() => createClientComponentClient(), []);

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const [name, setName] = useState("");
  const [description, setDescription] = useState<string>("");
  const [type, setType] = useState<ActivityType>("offer");
  const [startDate, setStartDate] = useState<string>("");
  const [endDate, setEndDate] = useState<string>("");

  const [tabs, setTabs] = useState<ActivityTab[]>(DEFAULT_TABS_BASE);

  // App/publikum-felt (activity_details)
  const [appPublished, setAppPublished] = useState(false);
  const [shortDescription, setShortDescription] = useState("");
  const [ticketUrl, setTicketUrl] = useState("");
  const [coverPath, setCoverPath] = useState<string | null>(null);
  const [coverUrl, setCoverUrl] = useState<string | null>(null);
  const [uploadingCover, setUploadingCover] = useState(false);

  const BUCKET = "activity-media";

  const refreshCoverUrl = (path: string | null) => {
    if (!path) {
      setCoverUrl(null);
      return;
    }
    const { data } = supabase.storage.from(BUCKET).getPublicUrl(path);
    const url = data?.publicUrl ? `${data.publicUrl}?v=${Date.now()}` : null;
    setCoverUrl(url);
  };

  const loadActivityDetails = async (activityId: string) => {
    // Hvis man ikke er i DB (LS-only), så lar vi feltene være lokale
    if (!looksLikeDbId) return;

    const { data, error } = await supabase
      .from("activity_details")
      .select("is_published, short_description, ticket_url, cover_image_path")
      .eq("activity_id", activityId)
      .maybeSingle();

    if (error) {
      // ikke blokker — bare vis i console
      console.warn("Kunne ikke hente activity_details:", error.message);
      return;
    }

    if (data) {
      setAppPublished(Boolean((data as any).is_published));
      setShortDescription(String((data as any).short_description ?? ""));
      setTicketUrl(String((data as any).ticket_url ?? ""));
      const p = ((data as any).cover_image_path as string | null) ?? null;
      setCoverPath(p);
      refreshCoverUrl(p);
    } else {
      // ingen rad enda → la feltene være tomme
      setCoverPath(null);
      setCoverUrl(null);
      setAppPublished(false);
      setTicketUrl("");
      setShortDescription("");
    }
  };

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

        // Hent app-detaljer fra DB (publiser/bilde/lenke/korttekst)
        await loadActivityDetails(rawId);
      } finally {
        setLoading(false);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rawId]);

  const uploadCover = async (file: File) => {
    if (!looksLikeDbId) {
      alert("Dette må først lagres i databasen (DB-id) før vi kan laste opp bilde.");
      return;
    }

    setErr(null);
    setUploadingCover(true);
    try {
      const name = file.name || "cover.jpg";
      const ext = (name.split(".").pop() || "jpg").toLowerCase();
      const safeExt = ["jpg", "jpeg", "png", "webp"].includes(ext) ? ext : "jpg";

      const path = `covers/${rawId}/cover.${safeExt}`;

      const { error: upErr } = await supabase.storage
        .from(BUCKET)
        .upload(path, file, {
          upsert: true,
          contentType: file.type || undefined,
          cacheControl: "3600",
        });

      if (upErr) throw upErr;

      setCoverPath(path);
      refreshCoverUrl(path);

      // Skriv path direkte til activity_details (så portalen/appen får det med en gang)
      const { error: dbErr } = await supabase.from("activity_details").upsert(
        {
          activity_id: rawId,
          cover_image_path: path,
          // vi fyller også inn basisfelt så det alltid finnes en rad
          description: description ?? "",
          short_description: shortDescription || shortFromText(description ?? ""),
          ticket_url: ticketUrl || null,
          is_published: appPublished,
        },
        { onConflict: "activity_id" }
      );

      if (dbErr) throw dbErr;
    } catch (e: any) {
      setErr(e?.message || "Kunne ikke laste opp bilde.");
    } finally {
      setUploadingCover(false);
    }
  };

  const clearCover = async () => {
    setErr(null);
    setCoverPath(null);
    setCoverUrl(null);

    if (!looksLikeDbId) return;

    const { error } = await supabase.from("activity_details").upsert(
      {
        activity_id: rawId,
        cover_image_path: null,
        description: description ?? "",
        short_description: shortDescription || shortFromText(description ?? ""),
        ticket_url: ticketUrl || null,
        is_published: appPublished,
      },
      { onConflict: "activity_id" }
    );

    if (error) setErr(error.message);
  };

  const onSave = async (e?: any) => {
    e?.preventDefault?.();
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

      // DB-first (som før)
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

      // Speil til localStorage (som før)
      await saveActivity({
        id: rawId,
        ...payload,
      });

      // Lagre publikum/app-detaljer i Supabase (activity_details)
      if (looksLikeDbId) {
        const { error: detailsErr } = await supabase.from("activity_details").upsert(
          {
            activity_id: rawId,
            description: description ?? "",
            short_description: shortDescription || shortFromText(description ?? ""),
            ticket_url: ticketUrl || null,
            cover_image_path: coverPath,
            is_published: appPublished,
          },
          { onConflict: "activity_id" }
        );

        if (detailsErr) {
          throw new Error(detailsErr.message || "Klarte ikke å lagre app-detaljer.");
        }
      }

      router.push(`/activities/${rawId}`);
    } catch (e: any) {
      setErr(e?.message || "Klarte ikke å lagre.");
    } finally {
      setSaving(false);
    }
  };

  const onDelete = async () => {
    if (!rawId) return;
    if (!confirm("Er du sikker på at du vil slette denne aktiviteten permanent?")) return;
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
                Beskrivelse (brukes også i appen)
              </label>
              <textarea
                rows={5}
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                className="mt-1 w-full rounded-lg border border-neutral-300 bg-white px-4 py-2 text-[15px] text-neutral-900 placeholder:text-neutral-500 focus:outline-none focus:ring-2 focus:ring-red-600"
              />
              <p className="mt-1 text-xs text-neutral-600">
                Dette blir teksten publikum ser når de trykker på aktiviteten/forestillingen i appen.
              </p>
            </div>
          </div>
        </section>

        {/* App / Publikum */}
        <section className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h2 className="text-lg font-semibold text-black">App / Publikum</h2>
              <p className="mt-1 text-xs text-neutral-600">
                Appen viser kun aktiviteter som er <b>Publisert</b>.
              </p>
            </div>

            <label className="flex items-center gap-2 rounded-xl bg-white px-3 py-2 ring-1 ring-neutral-300">
              <input
                type="checkbox"
                className="h-4 w-4 rounded border-neutral-300 text-red-600 focus:ring-red-600"
                checked={appPublished}
                onChange={(e) => setAppPublished(e.target.checked)}
              />
              <span className="text-sm font-semibold">
                {appPublished ? "Publisert i app" : "Ikke publisert"}
              </span>
            </label>
          </div>

          <div className="mt-4 grid gap-5 md:grid-cols-2">
            <div>
              <label className="block text-sm font-medium text-neutral-800">
                Korttekst (valgfri)
              </label>
              <input
                value={shortDescription}
                onChange={(e) => setShortDescription(e.target.value)}
                className="mt-1 w-full rounded-lg border border-neutral-300 bg-white px-4 py-2 text-[15px] text-neutral-900 placeholder:text-neutral-500 focus:outline-none focus:ring-2 focus:ring-red-600"
                placeholder="Kort tekst som vises i kortet i appen (valgfri)"
              />
              <p className="mt-1 text-xs text-neutral-600">
                Hvis du lar den være tom, bruker vi starten av beskrivelsen automatisk.
              </p>
            </div>

            <div>
              <label className="block text-sm font-medium text-neutral-800">
                Billettlenke (valgfri)
              </label>
              <input
                value={ticketUrl}
                onChange={(e) => setTicketUrl(e.target.value)}
                className="mt-1 w-full rounded-lg border border-neutral-300 bg-white px-4 py-2 text-[15px] text-neutral-900 placeholder:text-neutral-500 focus:outline-none focus:ring-2 focus:ring-red-600"
                placeholder="https://... (lenke til billettkjøp)"
              />
              <p className="mt-1 text-xs text-neutral-600">
                Hvis denne er satt, får publikum en “Kjøp billetter”-knapp i appen.
              </p>
            </div>

            <div className="md:col-span-2">
              <label className="block text-sm font-medium text-neutral-800">
                Forsidebilde (app)
              </label>

              <div className="mt-2 flex flex-wrap items-center gap-3">
                <input
                  type="file"
                  accept="image/*"
                  disabled={!looksLikeDbId || uploadingCover}
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (f) uploadCover(f);
                    e.currentTarget.value = "";
                  }}
                  className="block text-sm"
                />

                <button
                  type="button"
                  onClick={clearCover}
                  disabled={!coverPath || uploadingCover}
                  className="rounded-lg px-3.5 py-2 text-sm font-semibold text-neutral-900 ring-1 ring-neutral-300 hover:bg-neutral-900 hover:text-white disabled:opacity-60"
                >
                  Fjern bilde
                </button>

                {uploadingCover && (
                  <span className="text-sm text-neutral-600">Laster opp…</span>
                )}
              </div>

              {!looksLikeDbId && (
                <p className="mt-2 text-xs text-neutral-600">
                  Tips: Hvis dette er en aktivitet som bare finnes lokalt (localStorage),
                  må den først ligge i databasen (uuid-id) før vi kan laste opp bilde.
                </p>
              )}

              {coverUrl && (
                <div className="mt-4 overflow-hidden rounded-2xl border border-neutral-200">
                  {/* bruker vanlig <img> for å slippe Next Image-domene-oppsett */}
                  <img
                    src={coverUrl}
                    alt="Forsidebilde"
                    className="h-56 w-full object-cover"
                  />
                </div>
              )}

              <p className="mt-2 text-xs text-neutral-600">
                Bildet lagres i Supabase Storage → bucket <b>activity-media</b>.
              </p>
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
                  <span>
                    {label}
                    {isOversikt && " (alltid)"}
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
