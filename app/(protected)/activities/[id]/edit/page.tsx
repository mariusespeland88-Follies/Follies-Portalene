"use client";

import { useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import Cropper, { Area } from "react-easy-crop";
import { createClientComponentClient } from "@/lib/supabase/browser";
import { fetchActivity, saveActivity, ActivityType } from "@/lib/activitiesClient";
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

/* ---------- gallery helpers ---------- */
function isImageFileName(name: string): boolean {
  const n = String(name ?? "").toLowerCase();
  return (
    n.endsWith(".jpg") ||
    n.endsWith(".jpeg") ||
    n.endsWith(".png") ||
    n.endsWith(".webp") ||
    n.endsWith(".gif") ||
    n.endsWith(".heic")
  );
}
function sanitizeFileName(name: string): string {
  const base = String(name ?? "image.jpg").trim();
  return base.replace(/[^a-z0-9.\-_]/gi, "_");
}
function makeUid(): string {
  // Browser-safe unique-ish id
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const c: any = typeof crypto !== "undefined" ? crypto : null;
  if (c?.randomUUID) return c.randomUUID();
  return `${Date.now()}_${Math.random().toString(16).slice(2)}`;
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

  // App/publikum (activity_details)
  const [appPublished, setAppPublished] = useState(false);
  const [shortDescription, setShortDescription] = useState("");
  const [ticketUrl, setTicketUrl] = useState("");
  const [coverPath, setCoverPath] = useState<string | null>(null);
  const [coverUrl, setCoverUrl] = useState<string | null>(null);
  const [uploadingCover, setUploadingCover] = useState(false);

  // Cropper state
  const [cropOpen, setCropOpen] = useState(false);
  const [cropSrc, setCropSrc] = useState<string | null>(null);
  const [crop, setCrop] = useState({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const [croppedAreaPixels, setCroppedAreaPixels] = useState<Area | null>(null);
  const [pendingFile, setPendingFile] = useState<File | null>(null);

  // NEW: Gallery state (activity-media/gallery/<id>/...)
  const [gallery, setGallery] = useState<{ name: string; path: string; url: string }[]>([]);
  const [galleryLoading, setGalleryLoading] = useState(false);
  const [galleryUploading, setGalleryUploading] = useState(false);

  const BUCKET = "activity-media";

  const makePublicUrl = (path: string) => {
    const { data } = supabase.storage.from(BUCKET).getPublicUrl(path);
    const u = data?.publicUrl ?? null;
    return u ? `${u}?v=${Date.now()}` : null;
  };

  const refreshGallery = async () => {
    if (!looksLikeDbId) return;
    setGalleryLoading(true);
    try {
      const prefix = `gallery/${rawId}`;
      const { data, error } = await supabase.storage.from(BUCKET).list(prefix, { limit: 200 });
      if (error) throw error;

      const items =
        (data ?? [])
          .filter((f) => f?.name && isImageFileName(f.name))
          .map((f) => {
            const path = `${prefix}/${f.name}`;
            const url = makePublicUrl(path);
            return url ? { name: f.name, path, url } : null;
          })
          .filter(Boolean) as { name: string; path: string; url: string }[];

      items.sort((a, b) => a.name.localeCompare(b.name));
      setGallery(items);
    } catch (e: any) {
      setErr(e?.message || "Kunne ikke hente galleri-bilder.");
    } finally {
      setGalleryLoading(false);
    }
  };

  const uploadGalleryFiles = async (files: FileList) => {
    if (!looksLikeDbId) {
      alert("Denne aktiviteten har ikke en DB-id. Da kan vi ikke lagre galleri i appen.");
      return;
    }
    if (!files || files.length === 0) return;

    setGalleryUploading(true);
    setErr(null);

    try {
      for (const file of Array.from(files)) {
        if (!file.type.startsWith("image/")) continue;
        const safe = sanitizeFileName(file.name);
        const ext = safe.includes(".") ? safe.split(".").pop() : "jpg";
        const key = makeUid();
        const path = `gallery/${rawId}/${Date.now()}_${key}.${ext}`;

        const { error } = await supabase.storage
          .from(BUCKET)
          .upload(path, file, { upsert: false, contentType: file.type, cacheControl: "3600" });

        if (error) throw error;
      }

      await refreshGallery();
      alert("Galleri-bilder lastet opp ✅");
    } catch (e: any) {
      setErr(e?.message || "Kunne ikke laste opp galleri-bilder.");
    } finally {
      setGalleryUploading(false);
    }
  };

  const deleteGalleryImage = async (path: string) => {
    if (!confirm("Slette dette bildet fra galleriet?")) return;
    setGalleryUploading(true);
    setErr(null);

    try {
      const { error } = await supabase.storage.from(BUCKET).remove([path]);
      if (error) throw error;
      await refreshGallery();
    } catch (e: any) {
      setErr(e?.message || "Kunne ikke slette bildet.");
    } finally {
      setGalleryUploading(false);
    }
  };

  const uploadCoverBlobToFixedPath = async (blob: Blob) => {
    if (!looksLikeDbId) throw new Error("Mangler DB-id for cover upload.");
    setUploadingCover(true);

    try {
      const storagePath = `covers/${rawId}/cover.jpg`;
      const { error: upErr } = await supabase.storage
        .from(BUCKET)
        .upload(storagePath, blob, { upsert: true, contentType: "image/jpeg", cacheControl: "3600" });
      if (upErr) throw upErr;

      setCoverPath(storagePath);
      setCoverUrl(makePublicUrl(storagePath));
    } finally {
      setUploadingCover(false);
    }
  };

  const loadActivityDetails = async () => {
    if (!looksLikeDbId) return;

    const { data, error } = await supabase
      .from("activity_details")
      .select("is_published, short_description, ticket_url, cover_image_path")
      .eq("activity_id", rawId)
      .maybeSingle();

    if (error) throw error;

    if (data) {
      setAppPublished(Boolean((data as any).is_published));
      setShortDescription(String((data as any).short_description ?? ""));
      setTicketUrl(String((data as any).ticket_url ?? ""));
      const cp = (data as any).cover_image_path ? String((data as any).cover_image_path) : null;
      setCoverPath(cp);
      setCoverUrl(cp ? makePublicUrl(cp) : null);
    }
  };

  useEffect(() => {
    let alive = true;

    (async () => {
      setLoading(true);
      setErr(null);
      try {
        const act = await fetchActivity(rawId);
        if (!alive) return;

        if (!act) {
          setErr("Fant ikke aktiviteten.");
          setLoading(false);
          return;
        }

        setName(String((act as any).name ?? ""));
        setDescription(String((act as any).description ?? ""));
        setType(normalizeTypeForUi((act as any).type));
        setStartDate(String((act as any).start_date ?? ""));
        setEndDate(String((act as any).end_date ?? ""));

        // Tabs: prøv å lese tab_config fra activity; ellers bygg fra has_*
        const rawTabs = (act as any).tab_config as any;
        const validSet = new Set<ActivityTab>(ALL_TABS.map((x) => x.key));
        let initialTabs: ActivityTab[] = [];

        if (Array.isArray(rawTabs)) {
          initialTabs = rawTabs
            .map((t) => String(t))
            .filter((t) => validSet.has(t as ActivityTab)) as ActivityTab[];
        }

        if (!initialTabs.length) {
          initialTabs = [...DEFAULT_TABS_BASE];
          if ((act as any).has_guests) initialTabs.push("gjester");
          if ((act as any).has_attendance) initialTabs.push("innsjekk");
          if ((act as any).has_volunteers) initialTabs.push("frivillige");
          if ((act as any).has_tasks) initialTabs.push("oppgaver");
        }

        setTabs(ensureOversikt(initialTabs));

        // App/publikum data (activity_details)
        try {
          await loadActivityDetails();
        } catch (e: any) {
          // Ikke stopp hele siden – bare vis feil hvis nødvendig
          console.warn("loadActivityDetails error:", e);
        }

        // NEW: galleri for app
        try {
          await refreshGallery();
        } catch (e: any) {
          console.warn("refreshGallery error:", e);
        }
      } catch (e: any) {
        if (!alive) return;
        setErr(e?.message || "Noe gikk galt.");
      } finally {
        if (!alive) return;
        setLoading(false);
      }
    })();

    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rawId]);

  const openCropper = (file: File) => {
    if (!file.type.startsWith("image/")) {
      setErr("Velg et bilde.");
      return;
    }
    const url = URL.createObjectURL(file);
    setPendingFile(file);
    setCropSrc(url);
    setCrop({ x: 0, y: 0 });
    setZoom(1);
    setCroppedAreaPixels(null);
    setCropOpen(true);
  };

  const uploadOriginalNoCrop = async () => {
    if (!pendingFile) return;
    if (!looksLikeDbId) return;

    setCropOpen(false);
    setErr(null);

    try {
      // Vi lagrer original som cover.jpg også, for enkelhet i appen
      const { error: upErr } = await supabase.storage
        .from(BUCKET)
        .upload(`covers/${rawId}/cover.jpg`, pendingFile, {
          upsert: true,
          contentType: pendingFile.type,
          cacheControl: "3600",
        });
      if (upErr) throw upErr;

      const storagePath = `covers/${rawId}/cover.jpg`;
      setCoverPath(storagePath);
      setCoverUrl(makePublicUrl(storagePath));
      alert("Forsidebilde lastet opp ✅");
    } catch (e: any) {
      setErr(e?.message || "Kunne ikke laste opp forsidebilde.");
    } finally {
      try {
        if (cropSrc) URL.revokeObjectURL(cropSrc);
      } catch {}
      setCropSrc(null);
      setPendingFile(null);
    }
  };

  const applyCropAndUpload = async () => {
    if (!cropSrc || !croppedAreaPixels) return;
    if (!looksLikeDbId) return;

    setCropOpen(false);
    setErr(null);

    try {
      const blob = await cropToBlob(cropSrc, croppedAreaPixels);
      await uploadCoverBlobToFixedPath(blob);
      alert("Forsidebilde (beskjært) lastet opp ✅");
    } catch (e: any) {
      setErr(e?.message || "Kunne ikke beskjære/lagre bilde.");
    } finally {
      try {
        URL.revokeObjectURL(cropSrc);
      } catch {}
      setCropSrc(null);
      setPendingFile(null);
    }
  };

  const clearCover = async () => {
    if (!looksLikeDbId) return;
    if (!confirm("Fjerne forsidebildet fra appen?")) return;

    setErr(null);
    setCoverPath(null);
    setCoverUrl(null);

    try {
      const { error } = await supabase
        .from("activity_details")
        .upsert(
          {
            activity_id: rawId,
            cover_image_path: null,
          },
          { onConflict: "activity_id" }
        );
      if (error) throw error;
    } catch (e: any) {
      setErr(e?.message || "Kunne ikke fjerne forsidebilde.");
    }
  };

  const onSave = async (e?: React.FormEvent) => {
    e?.preventDefault();
    setSaving(true);
    setErr(null);

    try {
      const act = await fetchActivity(rawId);
      if (!act) throw new Error("Fant ikke aktiviteten.");

      const cleanedTabs = ensureOversikt(tabs);

      // Booleans styres av faner
      const hasGuests = cleanedTabs.includes("gjester");
      const hasAttendance = cleanedTabs.includes("innsjekk");
      const hasVolunteers = cleanedTabs.includes("frivillige");
      const hasTasks = cleanedTabs.includes("oppgaver");

      const payload: Partial<ActivityType> & Record<string, any> = {
        ...(act as any),
        id: rawId,
        name: name.trim(),
        description: description,
        type,
        start_date: startDate || null,
        end_date: endDate || null,
        tab_config: cleanedTabs,
        has_guests: hasGuests,
        has_attendance: hasAttendance,
        has_volunteers: hasVolunteers,
        has_tasks: hasTasks,
      };

      // Oppdater i DB via API
      const res = await fetch(`/api/activities/${encodeURIComponent(rawId)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        const msg = await res.text();
        throw new Error(msg || "Kunne ikke lagre.");
      }

      // Oppdater local store også (for portal UI)
      saveActivity(payload as any);

      // Oppdater app/publikum info i activity_details
      if (looksLikeDbId) {
        const { error: dbErr } = await supabase.from("activity_details").upsert(
          {
            activity_id: rawId,
            is_published: appPublished,
            short_description: shortDescription?.trim()
              ? shortDescription.trim()
              : shortFromText(description, 140),
            ticket_url: ticketUrl?.trim() ? ticketUrl.trim() : null,
            cover_image_path: coverPath,
          },
          { onConflict: "activity_id" }
        );
        if (dbErr) throw dbErr;
      }

      alert("Lagret ✅");
      router.push(`/activities/${encodeURIComponent(rawId)}`);
    } catch (e: any) {
      setErr(e?.message || "Kunne ikke lagre.");
    } finally {
      setSaving(false);
    }
  };

  const onDelete = async () => {
    if (!confirm("Er du sikker på at du vil slette aktiviteten?")) return;
    setSaving(true);
    setErr(null);

    try {
      await hardDeleteActivity(rawId);
      alert("Slettet ✅");
      router.push("/activities");
    } catch (e: any) {
      setErr(e?.message || "Kunne ikke slette.");
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return <main className="mx-auto max-w-6xl px-4 py-8 text-neutral-900">Laster…</main>;
  }

  return (
    <main className="mx-auto max-w-6xl px-4 py-8 text-neutral-900">
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-3xl font-semibold tracking-tight text-black">Rediger aktivitet</h1>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => void onSave()}
            disabled={saving}
            className="rounded-lg bg-red-600 px-4 py-2 text-sm font-semibold text-white hover:bg-red-700 disabled:opacity-60"
          >
            {saving ? "Lagrer…" : "Lagre"}
          </button>
          <Link
            href={`/activities/${encodeURIComponent(rawId)}`}
            className="rounded-lg bg-white px-4 py-2 text-sm font-semibold text-neutral-900 ring-1 ring-neutral-300 hover:bg-neutral-100"
          >
            Tilbake
          </Link>
          <button
            type="button"
            onClick={() => void onDelete()}
            disabled={saving}
            className="rounded-lg bg-white px-4 py-2 text-sm font-semibold text-red-700 ring-1 ring-red-200 hover:bg-red-50 disabled:opacity-60"
          >
            Slett
          </button>
        </div>
      </div>

      {err ? (
        <div className="mb-5 rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-800">
          {err}
        </div>
      ) : null}

      {!looksLikeDbId ? (
        <div className="mb-5 rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
          Denne aktiviteten ser ikke ut som en DB-id (UUID). App/publikum og galleri
          bruker Supabase-ID – så noen funksjoner kan være begrenset.
        </div>
      ) : null}

      {/* Crop modal */}
      {cropOpen && cropSrc ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4">
          <div className="w-full max-w-3xl overflow-hidden rounded-2xl bg-white">
            <div className="border-b border-neutral-200 p-4">
              <div className="text-lg font-semibold">Beskjær forsidebilde</div>
              <div className="text-sm text-neutral-600">
                Dra og zoom til du er fornøyd. Trykk “Bruk utsnitt”.
              </div>
            </div>

            <div className="relative h-[420px] bg-black">
              <Cropper
                image={cropSrc}
                crop={crop}
                zoom={zoom}
                aspect={16 / 9}
                onCropChange={setCrop}
                onZoomChange={setZoom}
                onCropComplete={(_, croppedPixels) => setCroppedAreaPixels(croppedPixels)}
              />
            </div>

            <div className="p-4">
              <label className="block text-sm font-medium text-neutral-800">Zoom</label>
              <input
                type="range"
                min={1}
                max={3}
                step={0.01}
                value={zoom}
                onChange={(e) => setZoom(Number(e.target.value))}
                className="mt-2 w-full"
              />

              <div className="mt-4 flex flex-wrap items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => void applyCropAndUpload()}
                  className="rounded-lg bg-red-600 px-3.5 py-2 text-sm font-semibold text-white hover:bg-red-700"
                >
                  Bruk utsnitt
                </button>
                <button
                  type="button"
                  onClick={() => void uploadOriginalNoCrop()}
                  className="rounded-lg bg-white px-3.5 py-2 text-sm font-semibold text-neutral-900 ring-1 ring-neutral-300 hover:bg-neutral-100"
                >
                  Last opp original
                </button>
                <button
                  type="button"
                  onClick={() => {
                    try {
                      if (cropSrc) URL.revokeObjectURL(cropSrc);
                    } catch {}
                    setCropOpen(false);
                    setCropSrc(null);
                    setPendingFile(null);
                  }}
                  className="rounded-lg bg-white px-3.5 py-2 text-sm font-semibold text-neutral-900 ring-1 ring-neutral-300 hover:bg-neutral-100"
                >
                  Avbryt
                </button>
              </div>
            </div>
          </div>
        </div>
      ) : null}

      <form onSubmit={onSave} className="space-y-6">
        {/* Grunninfo */}
        <section className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm">
          <h2 className="text-lg font-semibold text-black">Grunninfo</h2>

          <div className="mt-4 grid gap-5 md:grid-cols-2">
            <div className="md:col-span-2">
              <label className="block text-sm font-medium text-neutral-800">Navn</label>
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="mt-1 w-full rounded-lg border border-neutral-300 bg-white px-4 py-2 text-[15px] text-neutral-900 focus:outline-none focus:ring-2 focus:ring-red-600"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-neutral-800">Type</label>
              <div className="mt-1 inline-flex rounded-xl bg-white p-1 ring-1 ring-neutral-300">
                {(
                  [
                    ["offer", "Tilbud"],
                    ["event", "Event"],
                    ["forestilling", "Forestilling"],
                  ] as const
                ).map(([key, label]) => (
                  <button
                    key={key}
                    type="button"
                    onClick={() => setType(key as ActivityType)}
                    className={`mx-0.5 rounded-lg px-3.5 py-1.5 text-sm font-medium ${
                      type === key ? "bg-black text-white" : "text-neutral-900 hover:bg-neutral-100"
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>

            <div className="md:col-span-2">
              <label className="block text-sm font-medium text-neutral-800">Beskrivelse</label>
              <textarea
                rows={6}
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                className="mt-1 w-full rounded-lg border border-neutral-300 bg-white px-4 py-2 text-[15px] text-neutral-900 focus:outline-none focus:ring-2 focus:ring-red-600"
              />
            </div>
          </div>
        </section>

        {/* App / Publikum */}
        <section className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm">
          <h2 className="text-lg font-semibold text-black">App / Publikum</h2>
          <p className="mt-1 text-sm text-neutral-600">Dette styrer hva publikum ser i appen.</p>

          <div className="mt-4 grid gap-5 md:grid-cols-2">
            <div>
              <label className="block text-sm font-medium text-neutral-800">
                Publisert (synlig i appen)
              </label>
              <div className="mt-2 flex items-center gap-2">
                <input
                  type="checkbox"
                  className="h-4 w-4 rounded border-neutral-300 text-red-600 focus:ring-red-600"
                  checked={appPublished}
                  onChange={(e) => setAppPublished(e.target.checked)}
                />
                <span className="text-sm text-neutral-800">Publisert</span>
              </div>
              <p className="mt-2 text-xs text-neutral-600">
                Når denne er på, vil aktiviteten dukke opp i publikumsdelen av appen.
              </p>
            </div>

            <div>
              <label className="block text-sm font-medium text-neutral-800">Kort beskrivelse</label>
              <textarea
                rows={3}
                value={shortDescription}
                onChange={(e) => setShortDescription(e.target.value)}
                className="mt-1 w-full rounded-lg border border-neutral-300 bg-white px-4 py-2 text-[15px] text-neutral-900 focus:outline-none focus:ring-2 focus:ring-red-600"
              />
              <p className="mt-2 text-xs text-neutral-600">
                Hvis du lar den være tom, lager vi en kort tekst automatisk fra beskrivelsen.
              </p>
            </div>

            <div className="md:col-span-2">
              <label className="block text-sm font-medium text-neutral-800">
                Billett-lenke (valgfri)
              </label>
              <input
                value={ticketUrl}
                onChange={(e) => setTicketUrl(e.target.value)}
                placeholder="https://..."
                className="mt-1 w-full rounded-lg border border-neutral-300 bg-white px-4 py-2 text-[15px] text-neutral-900 focus:outline-none focus:ring-2 focus:ring-red-600"
              />
              <p className="mt-2 text-xs text-neutral-600">
                Hvis aktiviteten er en forestilling/event med billett, legg lenken her.
              </p>
            </div>
          </div>

          {/* Cover */}
          <div className="mt-6 border-t border-neutral-200 pt-4">
            <h3 className="text-base font-semibold text-neutral-900">Forsidebilde for appen</h3>
            <p className="mt-1 text-xs text-neutral-600">
              Vi lagrer bildet i Supabase Storage: <code>covers/{rawId}/cover.jpg</code>
            </p>

            <div className="mt-3 flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() => {
                  if (!looksLikeDbId) {
                    alert("Mangler DB-id (UUID). Kan ikke laste opp cover til appen.");
                    return;
                  }
                  const input = document.createElement("input");
                  input.type = "file";
                  input.accept = "image/*";
                  input.onchange = () => {
                    const f = input.files?.[0];
                    if (f) openCropper(f);
                  };
                  input.click();
                }}
                disabled={uploadingCover}
                className="rounded-lg bg-red-600 px-3.5 py-2 text-sm font-semibold text-white hover:bg-red-700 disabled:opacity-60"
              >
                {uploadingCover ? "Laster opp…" : "Velg bilde og beskjær"}
              </button>

              <button
                type="button"
                onClick={() => {
                  if (coverPath) setCoverUrl(makePublicUrl(coverPath));
                }}
                className="rounded-lg bg-white px-3.5 py-2 text-sm font-semibold text-neutral-900 ring-1 ring-neutral-300 hover:bg-neutral-100"
              >
                Oppdater forhåndsvisning
              </button>

              <button
                type="button"
                onClick={() => void clearCover()}
                className="rounded-lg bg-white px-3.5 py-2 text-sm font-semibold text-red-700 ring-1 ring-red-200 hover:bg-red-50"
              >
                Fjern bilde
              </button>
            </div>

            <div className="mt-4 grid gap-4 md:grid-cols-2">
              <div>
                <div className="text-xs font-medium text-neutral-600">Lagringssti</div>
                <div className="mt-1 rounded-lg bg-neutral-50 px-3 py-2 text-sm text-neutral-900 ring-1 ring-neutral-200">
                  {coverPath ?? "—"}
                </div>
              </div>

              <div>
                <div className="text-xs font-medium text-neutral-600">Forhåndsvisning</div>
                <div className="mt-1 overflow-hidden rounded-lg ring-1 ring-neutral-200">
                  {coverUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={coverUrl} alt="" className="h-40 w-full object-cover" />
                  ) : (
                    <div className="flex h-40 w-full items-center justify-center bg-neutral-100 text-sm text-neutral-600">
                      Ingen bilde
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>

          {/* NEW: Galleri */}
          <div className="mt-6 border-t border-neutral-200 pt-4">
            <h3 className="text-base font-semibold text-neutral-900">Galleri (bilder i appen)</h3>
            <p className="mt-1 text-xs text-neutral-600">
              Disse bildene vises inne på aktiviteten i appen. Vi lagrer dem i{" "}
              <code>gallery/{rawId}/...</code>
            </p>

            <div className="mt-3 flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() => {
                  if (!looksLikeDbId) {
                    alert("Mangler DB-id (UUID). Kan ikke laste opp galleri.");
                    return;
                  }
                  const input = document.createElement("input");
                  input.type = "file";
                  input.accept = "image/*";
                  input.multiple = true;
                  input.onchange = () => {
                    if (input.files && input.files.length) {
                      void uploadGalleryFiles(input.files);
                    }
                  };
                  input.click();
                }}
                disabled={galleryUploading}
                className="rounded-lg bg-black px-3.5 py-2 text-sm font-semibold text-white hover:bg-neutral-900 disabled:opacity-60"
              >
                {galleryUploading ? "Laster opp…" : "Last opp galleri-bilder"}
              </button>

              <button
                type="button"
                onClick={() => void refreshGallery()}
                disabled={galleryLoading}
                className="rounded-lg bg-white px-3.5 py-2 text-sm font-semibold text-neutral-900 ring-1 ring-neutral-300 hover:bg-neutral-100 disabled:opacity-60"
              >
                {galleryLoading ? "Henter…" : "Oppdater liste"}
              </button>

              <div className="text-xs text-neutral-600">
                {gallery.length ? `${gallery.length} bilde(r)` : "Ingen bilder enda"}
              </div>
            </div>

            <div className="mt-4">
              {gallery.length ? (
                <div className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-4">
                  {gallery.map((g) => (
                    <div key={g.path} className="overflow-hidden rounded-xl ring-1 ring-neutral-200">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={g.url} alt="" className="h-28 w-full object-cover" />
                      <div className="flex items-center justify-between gap-2 p-2">
                        <div className="truncate text-xs text-neutral-700">{g.name}</div>
                        <button
                          type="button"
                          onClick={() => void deleteGalleryImage(g.path)}
                          className="rounded-lg bg-white px-2 py-1 text-xs font-semibold text-red-700 ring-1 ring-red-200 hover:bg-red-50"
                        >
                          Slett
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="rounded-xl border border-neutral-200 bg-neutral-50 p-3 text-sm text-neutral-700">
                  Ingen galleri-bilder lastet opp enda.
                </div>
              )}
            </div>
          </div>
        </section>

        {/* Kategorier / faner */}
        <section className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm">
          <h2 className="text-lg font-semibold text-black">
            Kategorier / faner for denne aktiviteten
          </h2>
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
