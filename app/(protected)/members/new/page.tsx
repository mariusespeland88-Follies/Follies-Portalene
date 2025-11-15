"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";

import {
  Activity,
  FILE_INPUT_CLASS,
  INPUT_CLASS,
  MAX_IMAGE_BYTES,
  MemberFormState,
  cleanDate,
  emptyMemberFormState,
  mergeActivities,
  nullIfEmpty,
  numberOrNull,
  readActivitiesNormalized,
  safeHttpUrl,
} from "../formUtils";
import { createClientComponentClient } from "@/lib/supabase/browser";

type AnyObj = Record<string, any>;

function genId() {
  try {
    return crypto.randomUUID();
  } catch {
    return `m-${Date.now()}-${Math.floor(Math.random() * 1e6)}`;
  }
}

export default function NewMemberPage() {
  const router = useRouter();
  const supabase = createClientComponentClient();

  const [form, setForm] = useState<MemberFormState>(() => emptyMemberFormState());
  const [avatarFile, setAvatarFile] = useState<File | null>(null);
  const [activities, setActivities] = useState<Activity[]>([]);
  const [selectedActs, setSelectedActs] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);
  const fileRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    setActivities(readActivitiesNormalized());
  }, []);

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const { data, error } = await supabase
          .from("activities")
          .select(
            "id, name, type, archived, has_participants, has_leaders, has_sessions, has_files, has_messages, has_guests, has_attendance, has_volunteers, has_tasks"
          )
          .order("name", { ascending: true });
        if (!error && Array.isArray(data) && active) {
          setActivities((prev) =>
            mergeActivities(prev, data as any).filter((activity) => !activity.archived)
          );
        }
      } catch {
        /* ignore */
      }
    })();
    return () => {
      active = false;
    };
  }, [supabase]);

  function toggleAct(id: string) {
    setSelectedActs((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    );
  }

  async function onUploadAvatar() {
    if (!fileRef.current?.files?.length) return;
    const file = fileRef.current.files[0];

    if (!file.type.startsWith("image/")) {
      alert("Velg en bildefil.");
      return;
    }
    if (file.size > MAX_IMAGE_BYTES) {
      alert("Maks 10 MB.");
      return;
    }

    setAvatarFile(file);
    const url = URL.createObjectURL(file);
    setForm((f) => ({ ...f, avatar_url: url }));
    fileRef.current.value = "";
  }

  async function onSave() {
    setSaving(true);
    try {
      const id = genId();

      let avatarUrlToSave: string | null = null;
      if (avatarFile) {
        const { data: sess } = await supabase.auth.getSession();
        if (!sess?.session) {
          alert("Du er ikke innlogget.");
          setSaving(false);
          return;
        }
        const BUCKET = "profile-pictures";
        const path = `members/${id}/${Date.now()}-${avatarFile.name}`;
        const { error: upErr } = await supabase.storage.from(BUCKET).upload(path, avatarFile, {
          upsert: false,
          cacheControl: "3600",
          contentType: avatarFile.type,
        });
        if (upErr) throw upErr;
        const { data } = supabase.storage.from(BUCKET).getPublicUrl(path);
        avatarUrlToSave = data.publicUrl;
      }

      const payload: AnyObj = {
        id,
        first_name: nullIfEmpty(form.first_name),
        last_name: nullIfEmpty(form.last_name),
        email: nullIfEmpty(form.email),
        phone: nullIfEmpty(form.phone),
        address: nullIfEmpty(form.address),
        postal_code: nullIfEmpty(form.postal_code),
        city: nullIfEmpty(form.city),
        dob: cleanDate(form.dob),
        start_date: cleanDate(form.start_date),
        start_year: numberOrNull(form.start_year),
        guardian_name: nullIfEmpty(form.guardian_name),
        guardian_phone: nullIfEmpty(form.guardian_phone),
        guardian_email: nullIfEmpty(form.guardian_email),
        allergies: nullIfEmpty(form.allergies),
        medical_info: nullIfEmpty(form.medical_info),
        internal_notes: nullIfEmpty(form.internal_notes),
        archived: !!form.archived,
        avatar_url: safeHttpUrl(avatarUrlToSave ?? form.avatar_url),
        activities: selectedActs,
        activityIds: selectedActs,
        created_at: new Date().toISOString(),
      };

      Object.keys(payload).forEach((key) => {
        if (payload[key] === undefined) delete payload[key];
      });

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

  const offers = activities
    .filter((a) => a.type === "offer")
    .sort((a, b) => a.name.localeCompare(b.name));
  const events = activities
    .filter((a) => a.type === "event")
    .sort((a, b) => a.name.localeCompare(b.name));

  return (
    <div className="mx-auto max-w-6xl px-4 py-8 text-neutral-100">
      <div className="rounded-3xl border border-red-600/40 bg-neutral-950/80 p-8 shadow-[0_0_60px_rgba(239,68,68,0.25)] backdrop-blur">
        <div className="mb-8 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-3xl font-bold tracking-tight text-red-400">➕ Nytt medlem</h1>
            <p className="mt-1 text-sm text-neutral-400">Opprett ny profil og knytt aktiviteter.</p>
          </div>
          <button
            onClick={onSave}
            disabled={saving}
            className="inline-flex items-center justify-center rounded-xl bg-red-600 px-5 py-2.5 text-base font-semibold text-white shadow-lg shadow-red-600/30 transition focus:outline-none focus:ring-2 focus:ring-red-500 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {saving ? "Lagrer…" : "Opprett medlem"}
          </button>
        </div>

        <section className="rounded-2xl border border-red-600/25 bg-gradient-to-br from-neutral-950 via-neutral-900 to-neutral-950 p-6 shadow-lg shadow-red-900/20">
          <div className="grid gap-6 md:grid-cols-3">
            <div className="md:col-span-2 grid gap-4 sm:grid-cols-2">
              <div>
                <label className="block text-sm font-semibold text-neutral-300">Fornavn</label>
                <input
                  value={form.first_name}
                  onChange={(e) => setForm((f) => ({ ...f, first_name: e.target.value }))}
                  className={INPUT_CLASS}
                />
              </div>
              <div>
                <label className="block text-sm font-semibold text-neutral-300">Etternavn</label>
                <input
                  value={form.last_name}
                  onChange={(e) => setForm((f) => ({ ...f, last_name: e.target.value }))}
                  className={INPUT_CLASS}
                />
              </div>
              <div>
                <label className="block text-sm font-semibold text-neutral-300">Fødselsdato</label>
                <input
                  type="date"
                  value={form.dob}
                  onChange={(e) => setForm((f) => ({ ...f, dob: e.target.value }))}
                  className={INPUT_CLASS}
                />
              </div>
              <div>
                <label className="block text-sm font-semibold text-neutral-300">Startdato</label>
                <input
                  type="date"
                  value={form.start_date}
                  onChange={(e) => setForm((f) => ({ ...f, start_date: e.target.value }))}
                  className={INPUT_CLASS}
                />
              </div>
              <div>
                <label className="block text-sm font-semibold text-neutral-300">Startår</label>
                <input
                  inputMode="numeric"
                  pattern="[0-9]*"
                  value={form.start_year}
                  onChange={(e) => setForm((f) => ({ ...f, start_year: e.target.value }))}
                  className={INPUT_CLASS}
                />
              </div>
            </div>
            <div className="flex flex-col items-center justify-center gap-3">
              <div className="h-40 w-40 overflow-hidden rounded-2xl border border-red-600/40 bg-neutral-900 shadow-inner shadow-red-900/30">
                {form.avatar_url ? (
                  <img src={form.avatar_url} alt="Forhåndsvisning av profilbilde" className="h-full w-full object-cover" />
                ) : (
                  <div className="flex h-full w-full items-center justify-center text-sm text-neutral-500">Ingen bilde</div>
                )}
              </div>
              <input ref={fileRef} type="file" accept="image/*" className={FILE_INPUT_CLASS} />
              <div className="flex flex-col items-center gap-2">
                <button
                  type="button"
                  onClick={onUploadAvatar}
                  className="rounded-lg bg-red-600 px-4 py-2 text-sm font-semibold text-white shadow shadow-red-600/40 transition hover:bg-red-500 focus:outline-none focus:ring-2 focus:ring-red-500"
                >
                  Velg bilde
                </button>
                {form.avatar_url && (
                  <button
                    type="button"
                    onClick={() => {
                      setAvatarFile(null);
                      setForm((f) => ({ ...f, avatar_url: null }));
                    }}
                    className="text-xs font-medium text-neutral-400 hover:text-neutral-200"
                  >
                    Fjern bilde
                  </button>
                )}
              </div>
            </div>
          </div>
        </section>

        <section className="mt-8 rounded-2xl border border-neutral-800 bg-neutral-950/70 p-6 shadow-lg shadow-black/40">
          <h2 className="mb-4 text-xl font-semibold text-red-300">Kontaktinfo</h2>
          <div className="grid gap-5 md:grid-cols-2">
            <div>
              <label className="block text-sm font-semibold text-neutral-300">E-post</label>
              <input
                value={form.email}
                onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
                className={INPUT_CLASS}
              />
            </div>
            <div>
              <label className="block text-sm font-semibold text-neutral-300">Telefon</label>
              <input
                value={form.phone}
                onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))}
                className={INPUT_CLASS}
              />
            </div>
            <div className="md:col-span-2">
              <label className="block text-sm font-semibold text-neutral-300">Adresse</label>
              <input
                value={form.address}
                onChange={(e) => setForm((f) => ({ ...f, address: e.target.value }))}
                className={INPUT_CLASS}
              />
            </div>
            <div>
              <label className="block text-sm font-semibold text-neutral-300">Postnummer</label>
              <input
                value={form.postal_code}
                onChange={(e) => setForm((f) => ({ ...f, postal_code: e.target.value }))}
                className={INPUT_CLASS}
              />
            </div>
            <div>
              <label className="block text-sm font-semibold text-neutral-300">Sted</label>
              <input
                value={form.city}
                onChange={(e) => setForm((f) => ({ ...f, city: e.target.value }))}
                className={INPUT_CLASS}
              />
            </div>
          </div>
        </section>

        <section className="mt-8 rounded-2xl border border-red-600/25 bg-gradient-to-br from-neutral-950 via-neutral-900 to-neutral-950 p-6 shadow-lg shadow-red-900/20">
          <h2 className="mb-4 text-xl font-semibold text-red-300">Foresatt</h2>
          <div className="grid gap-5 md:grid-cols-3">
            <div>
              <label className="block text-sm font-semibold text-neutral-300">Navn</label>
              <input
                value={form.guardian_name}
                onChange={(e) => setForm((f) => ({ ...f, guardian_name: e.target.value }))}
                className={INPUT_CLASS}
              />
            </div>
            <div>
              <label className="block text-sm font-semibold text-neutral-300">Telefon</label>
              <input
                value={form.guardian_phone}
                onChange={(e) => setForm((f) => ({ ...f, guardian_phone: e.target.value }))}
                className={INPUT_CLASS}
              />
            </div>
            <div>
              <label className="block text-sm font-semibold text-neutral-300">E-post</label>
              <input
                value={form.guardian_email}
                onChange={(e) => setForm((f) => ({ ...f, guardian_email: e.target.value }))}
                className={INPUT_CLASS}
              />
            </div>
          </div>
        </section>

        <section className="mt-8 rounded-2xl border border-neutral-800 bg-neutral-950/70 p-6 shadow-lg shadow-black/40">
          <h2 className="mb-4 text-xl font-semibold text-red-300">Helse</h2>
          <div className="grid gap-5 md:grid-cols-2">
            <div>
              <label className="block text-sm font-semibold text-neutral-300">Allergier</label>
              <textarea
                value={form.allergies}
                onChange={(e) => setForm((f) => ({ ...f, allergies: e.target.value }))}
                className={`${INPUT_CLASS} min-h-[120px]`}
              />
            </div>
            <div>
              <label className="block text-sm font-semibold text-neutral-300">Medisinsk info</label>
              <textarea
                value={form.medical_info}
                onChange={(e) => setForm((f) => ({ ...f, medical_info: e.target.value }))}
                className={`${INPUT_CLASS} min-h-[120px]`}
              />
            </div>
          </div>
        </section>

        <section className="mt-8 rounded-2xl border border-red-600/25 bg-gradient-to-br from-neutral-950 via-neutral-900 to-neutral-950 p-6 shadow-lg shadow-red-900/20">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <h2 className="text-xl font-semibold text-red-300">Aktiviteter</h2>
            <span className="text-sm font-semibold text-neutral-300">{selectedActs.length} valgt</span>
          </div>
          <div className="mt-4">
            <h3 className="text-sm font-semibold uppercase tracking-wide text-neutral-400">Tilbud</h3>
            <div className="mt-2 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {offers.map((a) => (
                <label
                  key={a.id}
                  className="flex items-center gap-3 rounded-xl border border-neutral-700/60 bg-neutral-900/80 p-3 text-sm text-neutral-200 transition hover:border-red-500/60 hover:bg-neutral-900"
                >
                  <input
                    type="checkbox"
                    className="h-4 w-4 accent-red-500"
                    checked={selectedActs.includes(a.id)}
                    onChange={() => toggleAct(a.id)}
                  />
                  <span className="text-base">{a.name}</span>
                </label>
              ))}
              {offers.length === 0 && (
                <p className="col-span-full rounded-xl border border-dashed border-neutral-700/80 bg-neutral-900/60 p-4 text-sm text-neutral-400">
                  Ingen aktive tilbud funnet.
                </p>
              )}
            </div>
          </div>
          <div className="mt-6">
            <h3 className="text-sm font-semibold uppercase tracking-wide text-neutral-400">Eventer</h3>
            <div className="mt-2 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {events.map((a) => (
                <label
                  key={a.id}
                  className="flex items-center gap-3 rounded-xl border border-neutral-700/60 bg-neutral-900/80 p-3 text-sm text-neutral-200 transition hover:border-red-500/60 hover:bg-neutral-900"
                >
                  <input
                    type="checkbox"
                    className="h-4 w-4 accent-red-500"
                    checked={selectedActs.includes(a.id)}
                    onChange={() => toggleAct(a.id)}
                  />
                  <span className="text-base">{a.name}</span>
                </label>
              ))}
              {events.length === 0 && (
                <p className="col-span-full rounded-xl border border-dashed border-neutral-700/80 bg-neutral-900/60 p-4 text-sm text-neutral-400">
                  Ingen planlagte eventer funnet.
                </p>
              )}
            </div>
          </div>
        </section>

        <section className="mt-8 rounded-2xl border border-neutral-800 bg-neutral-950/70 p-6 shadow-lg shadow-black/40">
          <h2 className="mb-4 text-xl font-semibold text-red-300">Internt</h2>
          <div className="grid gap-5 md:grid-cols-[2fr,1fr]">
            <div>
              <label className="block text-sm font-semibold text-neutral-300">Interne notater</label>
              <textarea
                value={form.internal_notes}
                onChange={(e) => setForm((f) => ({ ...f, internal_notes: e.target.value }))}
                className={`${INPUT_CLASS} min-h-[140px]`}
              />
            </div>
            <div className="flex flex-col gap-4 rounded-xl border border-neutral-800 bg-neutral-900/60 p-4">
              <label className="flex items-center justify-between text-sm font-medium text-neutral-300">
                Arkiver medlem
                <input
                  type="checkbox"
                  className="h-4 w-4 accent-red-500"
                  checked={form.archived}
                  onChange={(e) => setForm((f) => ({ ...f, archived: e.target.checked }))}
                />
              </label>
              <p className="text-xs text-neutral-500">
                Arkiverte medlemmer skjules fra standardlister, men beholdes i databasen.
              </p>
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}
