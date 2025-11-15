"use client";

import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import Link from "next/link";
import { createClientComponentClient } from "@/lib/supabase/browser";

type AnyObj = Record<string, any>;
type ActivityType = "offer" | "event" | "show";

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

const LS_ACT_V1 = "follies.activities.v1";
const LS_ACT_OLD = "follies.activities";
const LS_COVERS = "follies.activityCovers.v1";

const safeJSON = <T,>(s: string | null): T | null => {
  try {
    return s ? (JSON.parse(s) as T) : null;
  } catch {
    return null;
  }
};

const slugify = (s: string) =>
  s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .replace(/--+/g, "-");

const INPUT =
  "mt-1 w-full rounded-lg border border-neutral-300 bg-white px-4 py-2 text-[15px] text-neutral-900 placeholder:text-neutral-500 focus:outline-none focus:ring-2 focus:ring-red-600";
const TEXTAREA =
  "mt-1 w-full rounded-lg border border-neutral-300 bg-white px-4 py-2 text-[15px] text-neutral-900 placeholder:text-neutral-500 focus:outline-none focus:ring-2 focus:ring-red-600";

function writeBoth(v1: AnyObj[], old: AnyObj[]) {
  localStorage.setItem(LS_ACT_V1, JSON.stringify(v1));
  localStorage.setItem(LS_ACT_OLD, JSON.stringify(old));
}

function readCoverStore(): Record<
  string,
  { dataUrl: string; mime: string; updated_at: string }
> {
  return (
    safeJSON<
      Record<string, { dataUrl: string; mime: string; updated_at: string }>
    >(localStorage.getItem(LS_COVERS)) ?? {}
  );
}

function writeCoverStore(
  store: Record<string, { dataUrl: string; mime: string; updated_at: string }>
) {
  localStorage.setItem(LS_COVERS, JSON.stringify(store));
}

// bilde
function readAsDataURL(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const fr = new FileReader();
    fr.onload = () => resolve(String(fr.result));
    fr.onerror = reject;
    fr.readAsDataURL(file);
  });
}

async function compressImage(
  file: File
): Promise<{ dataUrl: string; mime: string }> {
  const originalUrl = await readAsDataURL(file);
  const img = await new Promise<HTMLImageElement>((resolve, reject) => {
    const i = new Image();
    i.onload = () => resolve(i);
    i.onerror = reject;
    i.src = originalUrl;
  });
  const maxDim = 1600;
  const scale = Math.min(
    1,
    maxDim / Math.max(img.naturalWidth, img.naturalHeight)
  );
  const w = Math.max(1, Math.round(img.naturalWidth * scale));
  const h = Math.max(1, Math.round(img.naturalHeight * scale));
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Kan ikke bruke canvas i denne nettleseren.");
  ctx.drawImage(img, 0, 0, w, h);
  let mime = "image/jpeg";
  let dataUrl = canvas.toDataURL(mime, 0.82);
  if (dataUrl.length > 900_000) dataUrl = canvas.toDataURL(mime, 0.7);
  return { dataUrl, mime };
}

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

const DEFAULT_TABS: ActivityTab[] = [
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

// VIKTIG: "show" (UI = Forestilling) skal lagres som "forestilling" i DB/LS
const toDbType = (t: ActivityType): "offer" | "event" | "forestilling" =>
  t === "show" ? "forestilling" : t;

export default function ActivityNewPage() {
  const router = useRouter();

  const [form, setForm] = useState({
    name: "",
    type: "offer" as ActivityType,
    description: "",
    location: "",
    capacity: "",
    start: "",
    end: "",
  });

  const [tabs, setTabs] = useState<ActivityTab[]>(DEFAULT_TABS);

  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const [coverPreview, setCoverPreview] = useState<string>(
    "/Images/follies-logo.jpg"
  );
  const [coverData, setCoverData] = useState<{ dataUrl: string; mime: string } | null>(
    null
  );
  const coverRef = useRef<HTMLInputElement | null>(null);

  function onChange<K extends keyof typeof form>(
    key: K,
    value: (typeof form)[K]
  ) {
    setForm((prev) => {
      const next = { ...prev, [key]: value };

      if (key === "type") {
        // valg: vi kan justere default tabs per type om vi vil, men holder dem like nå
        setTabs((prevTabs) => ensureOversikt(prevTabs.length ? prevTabs : DEFAULT_TABS));
      }

      return next;
    });
  }

  async function onPickCover() {
    if (
      !coverRef.current ||
      !coverRef.current.files ||
      coverRef.current.files.length === 0
    )
      return;
    const file = coverRef.current.files[0];
    if (!file.type.startsWith("image/")) {
      setErr("Velg et bilde.");
      return;
    }
    try {
      const compressed = await compressImage(file);
      setCoverData(compressed);
      setCoverPreview(compressed.dataUrl);
    } catch (e: any) {
      setErr(e?.message || "Klarte ikke å lese bilde.");
    }
  }

  async function save() {
    setSaving(true);
    setErr(null);
    try {
      const supabase = createClientComponentClient();
      const { data: sess } = await supabase.auth.getSession();

      const typeForDb = toDbType(form.type);

      const cleanedTabs = ensureOversikt(tabs);

      // Booleans styres nå av hvilke faner som er valgt – for ALLE typer
      const hasGuests = cleanedTabs.includes("gjester");
      const hasAttendance = cleanedTabs.includes("innsjekk");
      const hasVolunteers = cleanedTabs.includes("frivillige");
      const hasTasks = cleanedTabs.includes("oppgaver");

      const base = {
        name: form.name?.trim() || "Uten navn",
        type: typeForDb,
        archived: false,
        has_guests: hasGuests,
        has_attendance: hasAttendance,
        has_volunteers: hasVolunteers,
        has_tasks: hasTasks,
        tab_config: cleanedTabs,
      };

      let dbId: string | null = null;

      if (sess?.session) {
        // DB-FØRST
        const { data, error } = await supabase
          .from("activities")
          .insert(base)
          .select(
            "id, name, type, archived, created_at, has_guests, has_attendance, has_volunteers, has_tasks, tab_config"
          )
          .single();

        if (error) {
          console.warn(
            "DB insert feilet, faller tilbake til localStorage:",
            error.message
          );
        } else if (data) {
          dbId = String(data.id);
        }
      }

      // Hvis DB ikke ga id (ikke innlogget eller feil), lag lokal id
      const localId = dbId ?? (crypto?.randomUUID?.() ?? `a-${Date.now()}`);

      // Speil til localStorage
      const next = {
        id: localId,
        name: base.name,
        type: typeForDb,
        description: form.description || undefined,
        location: form.location || undefined,
        capacity: form.capacity ? Number(form.capacity) : undefined,
        start: form.start || undefined,
        end: form.end || undefined,
        has_guests: hasGuests,
        has_attendance: hasAttendance,
        has_volunteers: hasVolunteers,
        has_tasks: hasTasks,
        tab_config: cleanedTabs,
        slug: slugify(base.name || `aktivitet-${String(localId).slice(0, 6)}`),
        created_at: new Date().toISOString(),
        archived: false,
      };

      const v1 = safeJSON<any[]>(localStorage.getItem(LS_ACT_V1)) ?? [];
      const old = safeJSON<any[]>(localStorage.getItem(LS_ACT_OLD)) ?? [];
      const v1Next = [
        next,
        ...v1.filter((a) => String(a?.id) !== String(localId)),
      ];
      const oldNext = old.length
        ? [next, ...old.filter((a) => String(a?.id) !== String(localId))]
        : v1Next;
      writeBoth(v1Next, oldNext);

      if (coverData) {
        const store = readCoverStore();
        store[localId] = {
          dataUrl: coverData.dataUrl,
          mime: coverData.mime,
          updated_at: new Date().toISOString(),
        };
        writeCoverStore(store);
      }

      router.push(`/activities/${localId}`);
    } catch (e: any) {
      setErr(e?.message || "Klarte ikke å opprette aktiviteten.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="mx-auto max-w-6xl px-4 py-8">
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-3xl font-semibold tracking-tight text-black">
          Ny aktivitet
        </h1>
        <div className="flex items-center gap-2">
          <button
            onClick={save}
            disabled={saving}
            className="rounded-lg bg-red-600 px-3.5 py-2 text-sm font-semibold text-white hover:bg-red-700 disabled:opacity-50"
          >
            {saving ? "Lagrer…" : "Opprett"}
          </button>
          <Link
            href="/activities"
            className="rounded-lg px-3.5 py-2 text-sm font-semibold text-neutral-900 ring-1 ring-neutral-300 hover:bg-neutral-900 hover:text-white"
          >
            Avbryt
          </Link>
        </div>
      </div>

      {err && (
        <div className="mb-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
          {err}
        </div>
      )}

      {/* Grunninfo */}
      <section className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm">
        <div className="grid gap-5 md:grid-cols-2">
          <div>
            <label className="block text-sm font-medium text-neutral-800">
              Navn
            </label>
            <input
              value={form.name}
              onChange={(e) => onChange("name", e.target.value)}
              className={INPUT}
              placeholder="Navn på aktivitet"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-neutral-800">
              Type
            </label>
            <div className="mt-1 inline-flex rounded-xl bg-white p-1 ring-1 ring-neutral-300">
              {(
                [
                  ["offer", "Tilbud"],
                  ["event", "Event"],
                  ["show", "Forestilling"],
                ] as const
              ).map(([key, label]) => (
                <button
                  key={key}
                  type="button"
                  onClick={() => onChange("type", key as ActivityType)}
                  className={`mx-0.5 rounded-lg px-3.5 py-1.5 text-sm font-medium ${
                    form.type === key
                      ? "bg-black text-white"
                      : "text-neutral-900 hover:bg-neutral-100"
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>

          <div className="md:col-span-2">
            <label className="block text-sm font-medium text-neutral-800">
              Beskrivelse
            </label>
            <textarea
              rows={5}
              value={form.description}
              onChange={(e) => onChange("description", e.target.value)}
              className={TEXTAREA}
            />
          </div>
        </div>
      </section>

      {/* Kategorier / faner */}
      <section className="mt-6 rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm">
        <h2 className="text-lg font-semibold text-black">
          Kategorier / faner for denne aktiviteten
        </h2>
        <p className="mt-1 text-xs text-neutral-600">
          Velg hvilke deler som skal være synlige inne på aktiviteten. Dette
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
                    ? "cursor-not-allowed text-neutral-500"
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
      <section className="mt-6 rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm">
        <div className="grid gap-5 md:grid-cols-3">
          <div>
            <label className="block text-sm font-medium text-neutral-800">
              Sted
            </label>
            <input
              value={form.location}
              onChange={(e) => onChange("location", e.target.value)}
              className={INPUT}
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-neutral-800">
              Kapasitet
            </label>
            <input
              type="number"
              value={form.capacity}
              onChange={(e) => onChange("capacity", e.target.value)}
              className={INPUT}
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-neutral-800">
              Start (dato/tid)
            </label>
            <input
              type="datetime-local"
              value={form.start}
              onChange={(e) => onChange("start", e.target.value)}
              className={INPUT}
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-neutral-800">
              Slutt (dato/tid)
            </label>
            <input
              type="datetime-local"
              value={form.end}
              onChange={(e) => onChange("end", e.target.value)}
              className={INPUT}
            />
          </div>
        </div>
      </section>

      {/* Cover-bilde */}
      <section className="mt-6 rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm">
        <h2 className="text-lg font-semibold text-black">Cover-bilde</h2>
        <div className="mt-4 grid gap-4 md:grid-cols-[220px,1fr]">
          <div className="overflow-hidden rounded-2xl border border-zinc-200">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={coverPreview}
              alt=""
              className="h-40 w-full object-cover"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-neutral-800">
              Last opp bilde (jpg/png)
            </label>
            <input
              ref={coverRef}
              type="file"
              accept="image/*"
              onChange={onPickCover}
              className="mt-1 block w-full text-sm file:mr-3 file:rounded-md file:border-0 file:bg-neutral-100 file:px-3 file:py-2 file:text-sm file:font-medium file:text-neutral-900 hover:file:bg-neutral-200"
            />
            <p className="mt-2 text-xs text-neutral-600">
              Cover lagres lokalt (komprimert) og vises på kort/hero.
            </p>
          </div>
        </div>
      </section>
    </div>
  );
}
