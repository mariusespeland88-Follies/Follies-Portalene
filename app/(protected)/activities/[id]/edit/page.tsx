// PATH: app/(protected)/activities/[id]/edit/page.tsx
"use client";

import { useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import Cropper, { Area } from "react-easy-crop";
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

/* ---------- crop helpers ---------- */
function createImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = (e) => reject(e);
    img.src = url;
  });
}

async function cropToBlob(imageSrc: string, crop: Area): Promise<Blob> {
  const img = await createImage(imageSrc);
  const canvas = document.createElement("canvas");
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Kunne ikke starte canvas (crop).");

  const sx = Math.max(0, Math.round(crop.x));
  const sy = Math.max(0, Math.round(crop.y));
  const sw = Math.max(1, Math.round(crop.width));
  const sh = Math.max(1, Math.round(crop.height));

  canvas.width = sw;
  canvas.height = sh;

  ctx.drawImage(img, sx, sy, sw, sh, 0, 0, sw, sh);

  return await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (b) => (b ? resolve(b) : reject(new Error("Kunne ikke lage bilde (blob)."))),
      "image/jpeg",
      0.92
    );
  });
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

  // Crop UI
  const [cropOpen, setCropOpen] = useState(false);
  const [cropSrc, setCropSrc] = useState<string | null>(null);
  const [cropXY, setCropXY] = useState({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const [croppedAreaPixels, setCroppedAreaPixels] = useState<Area | null>(null);
  const [pendingFile, setPendingFile] = useState<File | null>(null);

  const BUCKET = "activity-media";

  const makeCoverUrl = async (path: string | null) => {
    if (!path) {
      setCoverUrl(null);
      return;
    }

    // 1) Prøv public URL (rask)
    const { data: pub } = supabase.storage.from(BUCKET).getPublicUrl(path);
    const publicUrl = pub?.publicUrl ? `${pub.publicUrl}?v=${Date.now()}` : null;

    // 2) Fallback: signed URL (hjelper hvis public/lesing er kranglete)
    try {
      const { data: signed, error } = await supabase.storage
        .from(BUCKET)
        .createSignedUrl(path, 60 * 60);
      if (!error && signed?.signedUrl) {
        setCoverUrl(`${signed.signedUrl}&v=${Date.now()}`);
        return;
      }
    } catch {
      // ignore
    }

    setCoverUrl(publicUrl);
  };

  const loadActivityDetails = async (activityId: string) => {
    if (!looksLikeDbId) return;

    const { data, error } = await supabase
      .from("activity_details")
      .select("is_published, short_description, ticket_url, cover_image_path")
      .eq("activity_id", activityId)
      .maybeSingle();

    if (error) {
      console.warn("Kunne ikke hente activity_details:", error.message);
      return;
    }

    if (data) {
      setAppPublished(Boolean((data as any).is_published));
      setShortDescription(String((data as any).short_description ?? ""));
      setTicketUrl(String((data as any).ticket_url ?? ""));
      const p = ((data as any).cover_image_path as string | null) ?? null;
      setCoverPath(p);
      await makeCoverUrl(p);
    } else {
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

        await loadActivityDetails(rawId);
      } finally {
        setLoading(false);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rawId]);

  const uploadCoverBlobToFixedPath = async (blob: Blob) => {
    if (!looksLikeDbId) {
      alert("Dette må først lagres i databasen (DB-id) før vi kan laste opp bilde.");
      return;
    }

    setErr(null);
    setUploadingCover(true);
    try {
      const path = `covers/${rawId}/cover.jpg`;

      const { error: upErr } = await supabase.storage
        .from(BUCKET)
        .upload(path, blob, {
          upsert: true,
          contentType: "image/jpeg",
          cacheControl: "3600",
        });

      if (upErr) throw upErr;

      setCoverPath(path);
      await makeCoverUrl(path);

      const { error: dbErr } = await supabase.from("activity_details").upsert(
        {
          activity_id: rawId,
          cover_image_path: path,
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

  const openCropper = (file: File) => {
    const url = URL.createObjectURL(file);
    setPendingFile(file);
    setCropSrc(url);
    setCropXY({ x: 0, y: 0 });
    setZoom(1);
    setCroppedAreaPixels(null);
    setCropOpen(true);
  };

  const closeCropper = () => {
    if (cropSrc) URL.revokeObjectURL(cropSrc);
    setCropOpen(false);
    setCropSrc(null);
    setPendingFile(null);
    setCroppedAreaPixels(null);
    setZoom(1);
    setCropXY({ x: 0, y: 0 });
  };

  const applyCropAndUpload = async () => {
    if (!cropSrc || !croppedAreaPixels) {
      setErr("Velg utsnitt først (dra/zoom), så trykk Bruk utsnitt.");
      return;
    }
    try {
      const blob = await cropToBlob(cropSrc, croppedAreaPixels);
      await uploadCoverBlobToFixedPath(blob);
      closeCropper();
    } catch (e: any) {
      setErr(e?.message || "Kunne ikke beskjære og laste opp.");
    }
  };

  const uploadOriginalNoCrop = async () => {
    if (!pendingFile) return;
    try {
      // last opp original som-is (men vi lagrer den fortsatt som cover.jpg for enkelhet)
      await uploadCoverBlobToFixedPath(pendingFile);
      closeCropper();
    } catch (e: any) {
      setErr(e?.message || "Kunne ikke laste opp original.");
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

      await saveActivity({
        id: rawId,
        ...payload,
      });

      if (looksLikeDbId) {
        const { error: detailsErr } = await supabase
          .from("activity_details")
          .upsert(
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
      {/* Crop modal */}
      {cropOpen && cropSrc && (
        <div className="fixed inset-0 z-[80] bg-black/70 flex items-center justify-center p-4">
          <div className="w-full max-w-3xl rounded-2xl bg-white shadow-xl overflow-hidden">
            <div className="px-4 py-3 border-b border-neutral-200 flex items-center justify-between">
              <div className="font-semibold">Beskjær bilde</div>
              <button
                type="button"
                onClick={closeCropper}
                className="rounded-lg px-3 py-1.5 text-sm font-semibold ring-1 ring-neutral-300 hover:bg-neutral-50"
              >
                Lukk
              </button>
            </div>

            <div className="relative h-[420px] bg-neutral-950">
              <Cropper
                image={cropSrc}
                crop={cropXY}
                zoom={zoom}
                aspect={16 / 9}
                onCropChange={setCropXY}
                onZoomChange={setZoom}
                onCropComplete={(_, areaPx) => setCroppedAreaPixels(areaPx)}
              />
            </div>

            <div className="px-4 py-4 border-t border-neutral-200">
              <div className="flex items-center gap-3">
                <div className="text-sm font-medium">Zoom</div>
                <input
                  type="range"
                  min={1}
                  max={3}
                  step={0.01}
                  value={zoom}
                  onChange={(e) => setZoom(Number(e.target.value))}
                  className="w-full"
                />
              </div>

              <div className="mt-4 grid grid-cols-1 md:grid-cols-3 gap-2">
                <button
                  type="button"
                  onClick={uploadOriginalNoCrop}
                  className="rounded-lg px-3.5 py-2 text-sm font-semibold text-neutral-900 ring-1 ring-neutral-300 hover:bg-neutral-50 disabled:opacity-60"
                  disabled={uploadingCover}
                >
                  Last opp original
                </button>
                <button
                  type="button"
                  onClick={closeCropper}
                  className="rounded-lg px-3.5 py-2 text-sm font-semibold text-neutral-900 ring-1 ring-neutral-300 hover:bg-neutral-50"
                >
                  Avbryt
                </button>
                <button
                  type="button"
                  onClick={applyCropAndUpload}
                  className="rounded-lg bg-red-600 px-3.5 py-2 text-sm font-semibold text-white hover:bg-red-700 disabled:opacity-60"
                  disabled={uploadingCover}
                >
                  {uploadingCover ? "Laster opp…" : "Bruk utsnitt"}
                </button>
              </div>

              <div className="mt-2 text-xs text-neutral-600">
                Tips: dra bildet for å flytte utsnittet. Juster zoom for å “zoome inn”.
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Topp-linje */}
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-3xl font-semibold tracking-tight">Rediger aktivitet</h1>
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
                      type === val ? "bg-black text-white" : "text-neutral-900 hover:bg-neutral-100"
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>
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
              <label className="block text-sm font-medium text-neutral-800">Korttekst (valgfri)</label>
              <input
                value={shortDescription}
                onChange={(e) => setShortDescription(e.target.value)}
                className="mt-1 w-full rounded-lg border border-neutral-300 bg-white px-4 py-2 text-[15px] text-neutral-900 placeholder:text-neutral-500 focus:outline-none focus:ring-2 focus:ring-red-600"
                placeholder="Kort tekst som vises i kortet i appen (valgfri)"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-neutral-800">Billettlenke (valgfri)</label>
              <input
                value={ticketUrl}
                onChange={(e) => setTicketUrl(e.target.value)}
                className="mt-1 w-full rounded-lg border border-neutral-300 bg-white px-4 py-2 text-[15px] text-neutral-900 placeholder:text-neutral-500 focus:outline-none focus:ring-2 focus:ring-red-600"
                placeholder="https://... (lenke til billettkjøp)"
              />
            </div>

            <div className="md:col-span-2">
              <label className="block text-sm font-medium text-neutral-800">Forsidebilde (app)</label>

              <div className="mt-2 flex flex-wrap items-center gap-3">
                <input
                  type="file"
                  accept="image/*"
                  disabled={!looksLikeDbId || uploadingCover}
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (f) openCropper(f);
                    e.currentTarget.value = "";
                  }}
                  className="block text-sm"
                />

                <button
                  type="button"
                  onClick={async () => {
                    await makeCoverUrl(coverPath);
                  }}
                  disabled={!coverPath}
                  className="rounded-lg px-3.5 py-2 text-sm font-semibold text-neutral-900 ring-1 ring-neutral-300 hover:bg-neutral-50 disabled:opacity-60"
                >
                  Oppdater forhåndsvisning
                </button>

                <button
                  type="button"
                  onClick={clearCover}
                  disabled={!coverPath || uploadingCover}
                  className="rounded-lg px-3.5 py-2 text-sm font-semibold text-neutral-900 ring-1 ring-neutral-300 hover:bg-neutral-50 disabled:opacity-60"
                >
                  Fjern bilde
                </button>

                {uploadingCover && <span className="text-sm text-neutral-600">Laster opp…</span>}
              </div>

              {coverPath && (
                <div className="mt-2 text-xs text-neutral-600">
                  Lagringssti: <b>{coverPath}</b>{" "}
                  {coverUrl ? (
                    <>
                      –{" "}
                      <a
                        href={coverUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="font-semibold text-red-700 underline"
                      >
                        Åpne bilde
                      </a>
                    </>
                  ) : null}
                </div>
              )}

              {coverUrl && (
                <div className="mt-4 overflow-hidden rounded-2xl border border-neutral-200">
                  <img src={coverUrl} alt="Forsidebilde" className="h-56 w-full object-cover" />
                </div>
              )}
            </div>
          </div>
        </section>

        {/* Kategorier / faner */}
        <section className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm">
          <h2 className="text-lg font-semibold text-black">Kategorier / faner for denne aktiviteten</h2>
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
              <label className="block text-sm font-medium text-neutral-800">Startdato (valgfri)</label>
              <input
                type="date"
                value={startDate ?? ""}
                onChange={(e) => setStartDate(e.target.value)}
                className="mt-1 w-full rounded-lg border border-neutral-300 bg-white px-4 py-2 text-[15px] text-neutral-900 focus:outline-none focus:ring-2 focus:ring-red-600"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-neutral-800">Sluttdato (valgfri)</label>
              <input
                type="date"
                value={endDate ?? ""}
                onChange={(e) => setEndDate(e.target.value)}
                className="mt-1 w-full rounded-lg border border-neutral-300 bg-white px-4 py-2 text-[15px] text-neutral-900 focus:outline-none focus:ring-2 focus:ring-red-600"
              />
            </div>
          </div>
        </section>
      </form>
    </main>
  );
}
