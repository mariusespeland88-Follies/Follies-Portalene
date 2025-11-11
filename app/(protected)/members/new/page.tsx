// SNAPSHOT: 2025-09-04 – Follies Ansattportal
// Fiks: "Kunne ikke lagre: invalid input syntax for type integer: """
// Tiltak: Sanitér payload – tomme strenger → null, tall/dato normaliseres. Ingen designendring.

"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { createClientComponentClient } from "@supabase/auth-helpers-nextjs";

type AnyObj = Record<string, any>;
type Activity = { id: string; name: string; type: "offer" | "event"; archived?: boolean };

const LS_ACT_V1 = "follies.activities.v1";
const LS_ACT_OLD = "follies.activities";
const MAX_IMAGE_BYTES = 10 * 1024 * 1024;

const safeJSON = <T,>(s: string | null): T | null => {
  try { return s ? (JSON.parse(s) as T) : null; } catch { return null; }
};

const INPUT =
  "mt-1 w-full rounded-lg border border-neutral-300 bg-white px-4 py-2 text-[16px] " +
  "text-black placeholder:text-neutral-700 focus:outline-none focus:ring-2 focus:ring-indigo-600";
const FILE_INPUT =
  "mt-3 block w-full text-base file:mr-3 file:rounded-md file:border-0 file:bg-neutral-200 file:px-3 file:py-2 " +
  "file:text-base file:font-medium file:text-black hover:file:bg-neutral-300";

function genId() {
  try { return crypto.randomUUID(); } catch { return `m-${Date.now()}-${Math.floor(Math.random()*1e6)}`; }
}

function readActivitiesNormalized(): Activity[] {
  const v1 = safeJSON<any[]>(localStorage.getItem(LS_ACT_V1)) ?? [];
  const old = safeJSON<any[]>(localStorage.getItem(LS_ACT_OLD)) ?? [];
  const merged = [...old, ...v1];
  const norm = merged.map((a, i) => {
    const id = String(a?.id ?? a?.uuid ?? a?._id ?? `a-${i}`);
    const name = a?.name ?? a?.title ?? a?.navn ?? a?.programName ?? `Aktivitet ${id}`;
    const rawType = String(a?.type ?? a?.category ?? a?.kategori ?? "").toLowerCase();
    const isEvent =
      rawType.includes("event") || rawType.includes("konsert") ||
      rawType.includes("forest") || rawType.includes("åpen") || rawType.includes("open");
    const type: "offer" | "event" = isEvent ? "event" : "offer";
    const archived = !!(a?.archived || a?.is_archived || (String(a?.status).toLowerCase() === "archived"));
    return { id, name, type, archived };
  });
  const map = new Map<string, Activity>();
  for (const a of norm) map.set(a.id, a);
  return Array.from(map.values()).filter((x) => !x.archived);
}

/* ---- Sanitizers (hindrer "" → integer/dato-feil) ---- */
const nullIfEmpty = (v: any) => (typeof v === "string" && v.trim() === "" ? null : v);
const numberOrNull = (v: any) => {
  if (v === "" || v === null || v === undefined) return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};
const cleanDate = (v: any) => {
  if (!v) return null;
  const s = String(v).trim();
  return /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : null;
};
const safeHttpUrl = (v: any) => {
  if (!v) return null;
  const s = String(v);
  if (s.startsWith("blob:")) return null;
  return /^https?:\/\//i.test(s) ? s : null;
};

export default function NewMemberPage() {
  const router = useRouter();
  const supabase = createClientComponentClient();

  const [form, setForm] = useState<AnyObj>({
    first_name: "", last_name: "", email: "", phone: "",
    start_year: "", start_date: "", dob: "",
    address: "", postal_code: "", city: "",
    guardian_name: "", guardian_phone: "", guardian_email: "",
    allergies: "", medical_info: "", internal_notes: "",
    archived: false,
    avatar_url: null,
  });
  const [avatarFile, setAvatarFile] = useState<File | null>(null);
  const [activities, setActivities] = useState<Activity[]>([]);
  const [selectedActs, setSelectedActs] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);
  const fileRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => { setActivities(readActivitiesNormalized()); }, []);

  function toggleAct(id: string) {
    setSelectedActs((prev) => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);
  }

  async function onUploadAvatar() {
    if (!fileRef.current?.files?.length) return;
    const file = fileRef.current.files[0];

    if (!file.type.startsWith("image/")) { alert("Velg en bildefil."); return; }
    if (file.size > MAX_IMAGE_BYTES) { alert("Maks 10 MB."); return; }

    setAvatarFile(file);
    const url = URL.createObjectURL(file);
    setForm((f) => ({ ...f, avatar_url: url }));
    fileRef.current.value = "";
  }

  async function onSave() {
    setSaving(true);
    try {
      const id = genId();

      // Last opp avatar (valgfritt)
      let avatarUrlToSave: string | null = null;
      if (avatarFile) {
        const { data: sess } = await supabase.auth.getSession();
        if (!sess?.session) { alert("Du er ikke innlogget."); setSaving(false); return; }
        const BUCKET = "profile-pictures";
        const path = `members/${id}/${Date.now()}-${avatarFile.name}`;
        const { error: upErr } = await supabase.storage.from(BUCKET).upload(path, avatarFile, {
          upsert: false, cacheControl: "3600", contentType: avatarFile.type,
        });
        if (upErr) throw upErr;
        const { data } = supabase.storage.from(BUCKET).getPublicUrl(path);
        avatarUrlToSave = data.publicUrl;
      }

      // Bygg RENSKET payload: ingen "" til heltall/dato/tekst
      const payload: AnyObj = {
        id,
        first_name: nullIfEmpty(form.first_name),
        last_name:  nullIfEmpty(form.last_name),
        email:      nullIfEmpty(form.email),
        phone:      nullIfEmpty(form.phone),
        address:    nullIfEmpty(form.address),
        postal_code: nullIfEmpty(form.postal_code),
        city:       nullIfEmpty(form.city),
        dob:        cleanDate(form.dob),
        start_date: cleanDate(form.start_date),
        start_year: numberOrNull(form.start_year),   // ← viktig: "" → null, "2024" → 2024
        guardian_name:  nullIfEmpty(form.guardian_name),
        guardian_phone: nullIfEmpty(form.guardian_phone),
        guardian_email: nullIfEmpty(form.guardian_email),
        allergies:      nullIfEmpty(form.allergies),
        medical_info:   nullIfEmpty(form.medical_info),
        internal_notes: nullIfEmpty(form.internal_notes),
        archived: !!form.archived,
        avatar_url: safeHttpUrl(avatarUrlToSave),
        // Ekstra som klienten bruker i LS (ikke nødvendigvis i DB):
        activities: selectedActs,
        activityIds: selectedActs,
        created_at: new Date().toISOString(),
      };

      // Fjern undefined-keys (rydde)
      Object.keys(payload).forEach((k) => { if (payload[k] === undefined) delete payload[k]; });

      const res = await fetch("/api/members/create", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const dataResp = await res.json().catch(() => ({}));
      if (!res.ok || !dataResp?.ok) {
        alert("Kunne ikke lagre: " + (dataResp?.error || res.statusText));
      } else {
        router.push(`/members/${id}`);
      }
    } catch (err: any) {
      alert("Feil: " + (err?.message || String(err)));
    } finally {
      setSaving(false);
    }
  }

  const offers = activities.filter(a => a.type === "offer").sort((a,b)=>a.name.localeCompare(b.name));
  const events = activities.filter(a => a.type === "event").sort((a,b)=>a.name.localeCompare(b.name));

  return (
    <div className="mx-auto max-w-6xl px-4 py-8">
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-3xl font-bold tracking-tight text-indigo-700">➕ Nytt medlem</h1>
        <button onClick={onSave} disabled={saving}
          className="rounded-lg bg-indigo-600 px-4 py-2 text-base font-semibold text-white hover:bg-indigo-700 focus:ring-2 focus:ring-indigo-600 disabled:opacity-50">
          Opprett medlem
        </button>
      </div>

      {/* Øverst: Navn + bilde + alder */}
      <section className="rounded-2xl bg-indigo-50 p-6 shadow ring-1 ring-indigo-200">
        <div className="grid gap-6 md:grid-cols-3">
          <div className="md:col-span-2 grid gap-4 sm:grid-cols-2">
            <div>
              <label className="block text-base font-medium text-neutral-900">Fornavn</label>
              <input value={form.first_name} onChange={(e)=>setForm(f=>({...f, first_name: e.target.value}))} className={INPUT}/>
            </div>
            <div>
              <label className="block text-base font-medium text-neutral-900">Etternavn</label>
              <input value={form.last_name} onChange={(e)=>setForm(f=>({...f, last_name: e.target.value}))} className={INPUT}/>
            </div>
            <div>
              <label className="block text-base font-medium text-neutral-900">Fødselsdato</label>
              <input type="date" value={form.dob} onChange={(e)=>setForm(f=>({...f, dob: e.target.value}))} className={INPUT}/>
            </div>
          </div>
          <div className="flex flex-col items-center justify-center">
            <div className="h-40 w-40 overflow-hidden rounded-2xl bg-neutral-100 ring-1 ring-neutral-300">
              {form.avatar_url ? <img src={form.avatar_url} alt="" className="h-full w-full object-cover" /> : <div className="flex h-full w-full items-center justify-center text-neutral-500">Ingen bilde</div>}
            </div>
            <input ref={fileRef} type="file" accept="image/*" className={FILE_INPUT}/>
            <button onClick={onUploadAvatar}
              className="mt-2 rounded-lg bg-indigo-600 px-3.5 py-2 text-base font-semibold text-white hover:bg-indigo-700 focus:ring-2 focus:ring-indigo-600">
              Velg bilde
            </button>
          </div>
        </div>
      </section>

      {/* Kontaktinfo */}
      <section className="mt-6 rounded-2xl bg-white p-6 shadow ring-1 ring-neutral-200">
        <h2 className="mb-4 text-xl font-semibold text-indigo-700">Kontaktinfo</h2>
        <div className="grid gap-5 md:grid-cols-2">
          <div><label className="block text-base font-medium text-neutral-900">E-post</label>
            <input value={form.email} onChange={(e)=>setForm(f=>({...f, email: e.target.value}))} className={INPUT}/></div>
          <div><label className="block text-base font-medium text-neutral-900">Telefon</label>
            <input value={form.phone} onChange={(e)=>setForm(f=>({...f, phone: e.target.value}))} className={INPUT}/></div>
          <div className="md:col-span-2"><label className="block text-base font-medium text-neutral-900">Adresse</label>
            <input value={form.address} onChange={(e)=>setForm(f=>({...f, address: e.target.value}))} className={INPUT}/></div>
          <div><label className="block text-base font-medium text-neutral-900">Postnummer</label>
            <input value={form.postal_code} onChange={(e)=>setForm(f=>({...f, postal_code: e.target.value}))} className={INPUT}/></div>
          <div><label className="block text-base font-medium text-neutral-900">Sted</label>
            <input value={form.city} onChange={(e)=>setForm(f=>({...f, city: e.target.value}))} className={INPUT}/></div>
        </div>
      </section>

      {/* Foresatte */}
      <section className="mt-6 rounded-2xl bg-indigo-50 p-6 shadow ring-1 ring-indigo-200">
        <h2 className="mb-4 text-xl font-semibold text-indigo-700">Foresatt</h2>
        <div className="grid gap-5 md:grid-cols-3">
          <div><label className="block text-base font-medium text-neutral-900">Navn</label>
            <input value={form.guardian_name} onChange={(e)=>setForm(f=>({...f, guardian_name: e.target.value}))} className={INPUT}/></div>
          <div><label className="block text-base font-medium text-neutral-900">Telefon</label>
            <input value={form.guardian_phone} onChange={(e)=>setForm(f=>({...f, guardian_phone: e.target.value}))} className={INPUT}/></div>
          <div><label className="block text-base font-medium text-neutral-900">E-post</label>
            <input value={form.guardian_email} onChange={(e)=>setForm(f=>({...f, guardian_email: e.target.value}))} className={INPUT}/></div>
        </div>
      </section>

      {/* Helseinfo */}
      <section className="mt-6 rounded-2xl bg-white p-6 shadow ring-1 ring-neutral-200">
        <h2 className="mb-4 text-xl font-semibold text-indigo-700">Helse</h2>
        <div className="grid gap-5 md:grid-cols-2">
          <div><label className="block text-base font-medium text-neutral-900">Allergier</label>
            <textarea value={form.allergies} onChange={(e)=>setForm(f=>({...f, allergies: e.target.value}))} className={INPUT}/></div>
          <div><label className="block text-base font-medium text-neutral-900">Medisinsk info</label>
            <textarea value={form.medical_info} onChange={(e)=>setForm(f=>({...f, medical_info: e.target.value}))} className={INPUT}/></div>
        </div>
      </section>

      {/* Aktiviteter */}
      <section className="mt-6 rounded-2xl bg-indigo-50 p-6 shadow ring-1 ring-indigo-200">
        <div className="flex items-center justify_between">
          <h2 className="text-xl font-semibold text-indigo-700">Aktiviteter</h2>
          <span className="text-sm font-semibold text-neutral-900">{selectedActs.length} valgt</span>
        </div>
        <div className="mt-4">
          <h3 className="text-base font-semibold text-neutral-900">Tilbud</h3>
          <div className="mt-2 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {offers.map((a) => (
              <label key={a.id} className="flex items-center gap-3 rounded-lg bg-white p-3 ring-1 ring-neutral-200 hover:bg-neutral-50">
                <input type="checkbox" className="h-4 w-4 accent-indigo-600" checked={selectedActs.includes(a.id)} onChange={()=>toggleAct(a.id)} />
                <span className="text-[16px] text-neutral-900">{a.name}</span>
              </label>
            ))}
          </div>
        </div>
        <div className="mt-6">
          <h3 className="text-base font-semibold text-neutral-900">Eventer</h3>
          <div className="mt-2 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {events.map((a) => (
              <label key={a.id} className="flex items-center gap-3 rounded-lg bg_white p-3 ring-1 ring-neutral-200 hover:bg-neutral-50">
                <input type="checkbox" className="h-4 w-4 accent-indigo-600" checked={selectedActs.includes(a.id)} onChange={()=>toggleAct(a.id)} />
                <span className="text-[16px] text-neutral-900">{a.name}</span>
              </label>
            ))}
          </div>
        </div>
      </section>
    </div>
  );
}
