"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";

import {
  Activity,
  FILE_INPUT_CLASS,
  // INPUT_CLASS,  // vi bruker egen lys variant her
  MAX_IMAGE_BYTES,
  MemberFormState,
  cleanDate,
  emptyMemberFormState,
  mergeActivities,
  nullIfEmpty,
  numberOrNull,
  readActivitiesNormalized,
  safeHttpUrl,
} from "../../formUtils";
import { createClientComponentClient } from "@/lib/supabase/browser";

type AnyObj = Record<string, any>;
type Role = "none" | "participant" | "leader";

type EnrollmentRow = {
  activity_id: string | number | null;
  role: string | null;
};

type MemberRow = {
  id: string;
  first_name: string | null;
  last_name: string | null;
  email: string | null;
  phone: string | null;
  address: string | null;
  postal_code: string | null;
  city: string | null;
  dob: string | null;
  start_date: string | null;
  start_year: number | null;
  guardian_name: string | null;
  guardian_phone: string | null;
  guardian_email: string | null;
  allergies: string | null;
  medical_info: string | null;
  internal_notes: string | null;
  archived: boolean | null;
  avatar_url: string | null;
};

const INPUT_LIGHT =
  "mt-1 w-full rounded-lg border border-neutral-300 bg-white px-3 py-2 text-sm text-neutral-900 shadow-sm outline-none focus:border-red-500 focus:ring-1 focus:ring-red-500";
const TEXTAREA_LIGHT = INPUT_LIGHT + " min-h-[120px]";

function normalizeRole(value: string | null | undefined): Role {
  const v = String(value ?? "").toLowerCase();
  if (v === "leader" || v === "leder") return "leader";
  if (v === "participant" || v === "deltaker") return "participant";
  return "none";
}

function defaultRole(existing: Role | undefined): Role {
  if (existing && existing !== "none") return existing;
  return "participant";
}

function RolePill({
  label,
  active,
  onClick,
}: {
  label: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={
        active
          ? "rounded-full bg-red-600 px-3 py-1 text-xs font-semibold text-white shadow shadow-red-600/40"
          : "rounded-full border border-neutral-300 px-3 py-1 text-xs font-medium text-neutral-700 transition hover:border-red-500/60 hover:text-neutral-900"
      }
    >
      {label}
    </button>
  );
}

export default function MemberEditPage() {
  const params = useParams();
  const router = useRouter();
  const supabase = createClientComponentClient();

  const id = useMemo(() => {
    const raw = Array.isArray(params?.id)
      ? params?.id[0]
      : (params?.id as string | undefined);
    return raw ? String(raw) : undefined;
  }, [params?.id]);

  const [form, setForm] = useState<MemberFormState>(() =>
    emptyMemberFormState()
  );
  const [avatarFile, setAvatarFile] = useState<File | null>(null);
  const [activities, setActivities] = useState<Activity[]>([]);
  const [selectedActs, setSelectedActs] = useState<string[]>([]);
  const [selectedRoles, setSelectedRoles] = useState<Record<string, Role>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [banner, setBanner] = useState<string | null>(null);
  const [inviteBusy, setInviteBusy] = useState(false);
  const [inviteMsg, setInviteMsg] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    setActivities(readActivitiesNormalized());
  }, []);

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const { data, error: actError } = await supabase
          .from("activities")
          .select(
            "id, name, type, archived, has_guests, has_attendance, has_volunteers, has_tasks"
          )
          .order("name", { ascending: true });
        if (!active) return;
        if (!actError && Array.isArray(data)) {
          setActivities((prev) =>
            mergeActivities(prev, data as any).filter(
              (activity) => !activity.archived
            )
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

  useEffect(() => {
    if (!id) {
      setError("Mangler medlems-ID i URLen.");
      setLoading(false);
      return;
    }

    let active = true;
    (async () => {
      try {
        setLoading(true);
        setError(null);
        setBanner(null);

        const [
          { data: memberData, error: memberErr },
          { data: enrollmentData, error: enrollErr },
        ] = await Promise.all([
          supabase
            .from("members")
            .select(
              "id, first_name, last_name, email, phone, address, postal_code, city, dob, start_date, start_year, guardian_name, guardian_phone, guardian_email, allergies, medical_info, internal_notes, archived, avatar_url"
            )
            .eq("id", id)
            .maybeSingle(),
          supabase
            .from("enrollments")
            .select("activity_id, role")
            .eq("member_id", id),
        ]);

        if (!active) return;

        if (memberErr) {
          console.error(memberErr);
          setError("Kunne ikke hente medlem fra databasen.");
          setLoading(false);
          return;
        }
        if (!memberData) {
          setError("Fant ikke medlemmet.");
          setLoading(false);
          return;
        }

        const member = memberData as MemberRow;
        setForm({
          first_name: member.first_name ?? "",
          last_name: member.last_name ?? "",
          email: member.email ?? "",
          phone: member.phone ?? "",
          address: member.address ?? "",
          postal_code: member.postal_code ?? "",
          city: member.city ?? "",
          dob: member.dob ?? "",
          start_date: member.start_date ?? "",
          start_year: member.start_year ? String(member.start_year) : "",
          guardian_name: member.guardian_name ?? "",
          guardian_phone: member.guardian_phone ?? "",
          guardian_email: member.guardian_email ?? "",
          allergies: member.allergies ?? "",
          medical_info: member.medical_info ?? "",
          internal_notes: member.internal_notes ?? "",
          archived: !!member.archived,
          avatar_url: member.avatar_url ?? null,
        });

        if (enrollErr) {
          console.error(enrollErr);
        }
        const rolesMap: Record<string, Role> = {};
        const selected: string[] = [];
        for (const row of (enrollmentData ?? []) as EnrollmentRow[]) {
          const aid = String(row.activity_id ?? "");
          if (!aid) continue;
          const role = normalizeRole(row.role);
          rolesMap[aid] = role;
          if (role !== "none") selected.push(aid);
        }
        setSelectedRoles(rolesMap);
        setSelectedActs(Array.from(new Set(selected)));
        setLoading(false);
      } catch (err) {
        console.error(err);
        if (active) {
          setError("Noe gikk galt ved innlasting av medlemmet.");
          setLoading(false);
        }
      }
    })();

    return () => {
      active = false;
    };
  }, [id, supabase]);

  const offers = activities
    .filter((a) => a.type === "offer")
    .sort((a, b) => a.name.localeCompare(b.name));
  const events = activities
    .filter((a) => a.type === "event")
    .sort((a, b) => a.name.localeCompare(b.name));

  const fullName = useMemo(() => {
    const name = `${form.first_name || ""} ${form.last_name || ""}`.trim();
    return name || "Uten navn";
  }, [form.first_name, form.last_name]);

  const isLoaded = !loading && !error;

  async function sendInvite(email: string) {
    setInviteBusy(true);
    setInviteMsg(null);
    try {
      const res = await fetch("/api/admin/invite-member", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });
      const json = await res.json();
      if (!res.ok) {
        throw new Error(json?.error || "Kunne ikke sende invitasjon.");
      }
      setInviteMsg(`Invitasjon sendt til ${email}.`);
    } catch (e: any) {
      setInviteMsg(
        e?.message || "Noe gikk galt ved sending av invitasjon."
      );
    } finally {
      setInviteBusy(false);
    }
  }

  function handleToggleActivity(activityId: string) {
    setSelectedActs((prev) => {
      const next = prev.includes(activityId)
        ? prev.filter((x) => x !== activityId)
        : [...prev, activityId];
      setSelectedRoles((roles) => {
        const updated = { ...roles };
        if (next.includes(activityId)) {
          updated[activityId] = defaultRole(roles[activityId]);
        } else {
          updated[activityId] = "none";
        }
        return updated;
      });
      return next;
    });
  }

  function handleRoleChange(activityId: string, role: Role) {
    setSelectedRoles((prev) => ({ ...prev, [activityId]: role }));
    if (role === "none") {
      setSelectedActs((prev) => prev.filter((x) => x !== activityId));
    } else {
      setSelectedActs((prev) =>
        prev.includes(activityId) ? prev : [...prev, activityId]
      );
    }
  }

  async function handleUploadAvatar() {
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
    const preview = URL.createObjectURL(file);
    setForm((f) => ({ ...f, avatar_url: preview }));
    fileRef.current.value = "";
  }

  async function handleSave() {
    if (!id) return;
    setSaving(true);
    setError(null);
    setBanner(null);
    try {
      let avatarUrlToSave: string | null = safeHttpUrl(form.avatar_url);
      if (avatarFile) {
        const { data: sess } = await supabase.auth.getSession();
        if (!sess?.session) {
          alert("Du er ikke innlogget.");
          setSaving(false);
          return;
        }
        const BUCKET = "profile-pictures";
        const path = `members/${id}/${Date.now()}-${avatarFile.name}`;
        const { error: uploadErr } = await supabase.storage
          .from(BUCKET)
          .upload(path, avatarFile, {
            upsert: false,
            cacheControl: "3600",
            contentType: avatarFile.type,
          });
        if (uploadErr) throw uploadErr;
        const { data } = supabase.storage.from(BUCKET).getPublicUrl(path);
        avatarUrlToSave = data.publicUrl;
      }

      const updatePayload: AnyObj = {
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
        avatar_url: avatarUrlToSave,
      };
      Object.keys(updatePayload).forEach((key) => {
        if (updatePayload[key] === undefined) delete updatePayload[key];
      });

      const { error: updateErr } = await supabase
        .from("members")
        .update(updatePayload)
        .eq("id", id);
      if (updateErr) {
        console.error(updateErr);
        throw new Error("Kunne ikke oppdatere medlemmet.");
      }

      const desiredRoles: Record<string, Role> = {};
      for (const aid of selectedActs) {
        desiredRoles[aid] = defaultRole(selectedRoles[aid]);
      }

      const {
        data: currentEnrollments,
        error: enrollLoadErr,
      } = await supabase
        .from("enrollments")
        .select("activity_id, role")
        .eq("member_id", id);
      if (enrollLoadErr) {
        console.error(enrollLoadErr);
        throw new Error("Kunne ikke hente eksisterende roller.");
      }

      const currentMap = new Map<string, Role>();
      for (const row of (currentEnrollments ?? []) as EnrollmentRow[]) {
        const aid = String(row.activity_id ?? "");
        if (!aid) continue;
        currentMap.set(aid, normalizeRole(row.role));
      }

      const desiredSet = new Set(selectedActs);
      const toDelete = [...currentMap.keys()].filter(
        (aid) => !desiredSet.has(aid)
      );
      if (toDelete.length) {
        const { error: deleteErr } = await supabase
          .from("enrollments")
          .delete()
          .eq("member_id", id)
          .in("activity_id", toDelete);
        if (deleteErr) {
          console.error(deleteErr);
          throw new Error("Kunne ikke fjerne enkelte aktiviteter.");
        }
      }

      const upsertPayload = [...desiredSet].map((aid) => ({
        member_id: id,
        activity_id: aid,
        role: desiredRoles[aid] === "leader" ? "leader" : "participant",
      }));
      if (upsertPayload.length) {
        const { error: upsertErr } = await supabase
          .from("enrollments")
          .upsert(upsertPayload, { onConflict: "member_id,activity_id" });
        if (upsertErr) {
          console.error(upsertErr);
          throw new Error(
            "Kunne ikke oppdatere aktiviteter for medlemmet."
          );
        }
      }

      setBanner("Endringer lagret.");
      if (avatarFile && avatarUrlToSave) {
        setForm((f) => ({ ...f, avatar_url: avatarUrlToSave }));
        setAvatarFile(null);
      }
    } catch (err: any) {
      console.error(err);
      setError(err?.message || "Noe gikk galt ved lagring.");
    } finally {
      setSaving(false);
    }
  }

  if (!id) {
    return (
      <main className="mx-auto max-w-3xl bg-neutral-100 px-4 py-10 text-neutral-900">
        <div className="rounded-2xl border border-red-200 bg-red-50 p-6 text-sm text-red-800">
          Mangler medlems-ID.
        </div>
      </main>
    );
  }

  if (loading) {
    return (
      <main className="mx-auto max-w-3xl bg-neutral-100 px-4 py-10 text-neutral-900">
        <div className="rounded-2xl border border-neutral-200 bg-white p-6 text-sm text-neutral-700">
          Laster medlem…
        </div>
      </main>
    );
  }

  if (error && !isLoaded) {
    return (
      <main className="mx-auto max-w-3xl bg-neutral-100 px-4 py-10 text-neutral-900">
        <div className="rounded-2xl border border-red-300 bg-red-50 p-6">
          <p className="text-sm font-semibold text-red-700">Feil</p>
          <p className="mt-2 text-sm text-red-700/90">{error}</p>
          <div className="mt-6 flex gap-3">
            <Link
              href="/members"
              className="inline-flex items-center justify-center rounded-lg bg-red-600 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-red-500"
            >
              Til medlemmer
            </Link>
          </div>
        </div>
      </main>
    );
  }

  const emailForDisplay = form.email?.trim() || "";

  return (
    <main className="mx-auto max-w-6xl bg-neutral-100 px-4 py-8 text-neutral-900">
      {/* TOPPSEKSJON – hvit kort, lik profilens følelsesnivå */}
      <section className="mb-6 rounded-3xl border border-neutral-200 bg-white p-6 shadow-sm">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-3xl font-bold tracking-tight text-red-600">
              Rediger medlem
            </h1>
            <p className="mt-1 text-sm font-medium text-neutral-900">
              {fullName}
            </p>
            <p className="text-xs text-neutral-600">
              {emailForDisplay || "Ingen e-post"}
            </p>
          </div>
          <div className="flex flex-col items-stretch gap-2 sm:flex-row sm:items-center">
            <Link
              href={`/members/${encodeURIComponent(id)}`}
              className="inline-flex items-center justify-center rounded-xl border border-neutral-300 bg-white px-4 py-2 text-sm font-semibold text-neutral-800 transition hover:bg-neutral-50"
            >
              Vis medlem
            </Link>
            <button
              type="button"
              onClick={() =>
                emailForDisplay && sendInvite(emailForDisplay)
              }
              disabled={inviteBusy || !emailForDisplay}
              className="rounded-lg border border-neutral-300 bg-white px-3.5 py-2 text-sm font-semibold text-neutral-900 hover:bg-neutral-50 disabled:opacity-50"
            >
              {inviteBusy ? "Sender…" : "Send innloggingslenke"}
            </button>
            <button
              onClick={handleSave}
              disabled={saving}
              className="inline-flex items-center justify-center rounded-xl bg-red-600 px-5 py-2.5 text-base font-semibold text-white shadow-sm hover:bg-red-500 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {saving ? "Lagrer…" : "Lagre endringer"}
            </button>
          </div>
        </div>

        {inviteMsg && (
          <div className="mt-4 rounded-lg border border-neutral-200 bg-neutral-50 px-3 py-2 text-xs text-neutral-800">
            {inviteMsg}
          </div>
        )}

        {(error || banner) && (
          <div className="mt-4">
            {error && (
              <div className="rounded-2xl border border-red-200 bg-rose-50 p-4 text-sm text-red-800">
                {error}
              </div>
            )}
            {banner && !error && (
              <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-800">
                {banner}
              </div>
            )}
          </div>
        )}
      </section>

      {/* INNHOLD – kort som på profilsiden */}
      <div className="space-y-6">
        {/* Grunninfo + avatar */}
        <section className="rounded-2xl border border-neutral-200 bg-white p-6 shadow-sm">
          <div className="grid gap-6 md:grid-cols-3">
            <div className="grid gap-4 md:col-span-2 sm:grid-cols-2">
              <div>
                <label className="block text-sm font-semibold text-neutral-700">
                  Fornavn
                </label>
                <input
                  value={form.first_name}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, first_name: e.target.value }))
                  }
                  className={INPUT_LIGHT}
                />
              </div>
              <div>
                <label className="block text-sm font-semibold text-neutral-700">
                  Etternavn
                </label>
                <input
                  value={form.last_name}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, last_name: e.target.value }))
                  }
                  className={INPUT_LIGHT}
                />
              </div>
              <div>
                <label className="block text-sm font-semibold text-neutral-700">
                  Fødselsdato
                </label>
                <input
                  type="date"
                  value={form.dob}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, dob: e.target.value }))
                  }
                  className={INPUT_LIGHT}
                />
              </div>
              <div>
                <label className="block text-sm font-semibold text-neutral-700">
                  Startdato
                </label>
                <input
                  type="date"
                  value={form.start_date}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, start_date: e.target.value }))
                  }
                  className={INPUT_LIGHT}
                />
              </div>
              <div>
                <label className="block text-sm font-semibold text-neutral-700">
                  Startår
                </label>
                <input
                  inputMode="numeric"
                  pattern="[0-9]*"
                  value={form.start_year}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, start_year: e.target.value }))
                  }
                  className={INPUT_LIGHT}
                />
              </div>
            </div>
            <div className="flex flex-col items-center justify-center gap-3">
              <div className="h-40 w-40 overflow-hidden rounded-2xl border border-neutral-200 bg-neutral-100">
                {form.avatar_url ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={form.avatar_url}
                    alt="Profilbilde"
                    className="h-full w-full object-cover"
                  />
                ) : (
                  <div className="flex h-full w-full items-center justify-center text-sm text-neutral-500">
                    Ingen bilde
                  </div>
                )}
              </div>
              <input
                ref={fileRef}
                type="file"
                accept="image/*"
                className={FILE_INPUT_CLASS}
              />
              <div className="flex flex-col items-center gap-2">
                <button
                  type="button"
                  onClick={handleUploadAvatar}
                  className="rounded-lg bg-red-600 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-red-500 focus:outline-none focus:ring-2 focus:ring-red-500"
                >
                  Velg nytt bilde
                </button>
                {form.avatar_url && (
                  <button
                    type="button"
                    onClick={() => {
                      setAvatarFile(null);
                      setForm((f) => ({ ...f, avatar_url: null }));
                    }}
                    className="text-xs font-medium text-neutral-500 hover:text-neutral-800"
                  >
                    Fjern bilde
                  </button>
                )}
              </div>
            </div>
          </div>
        </section>

        {/* Kontaktinfo */}
        <section className="rounded-2xl border border-neutral-200 bg-white p-6 shadow-sm">
          <h2 className="mb-4 text-xl font-semibold text-neutral-900">
            Kontaktinfo
          </h2>
          <div className="grid gap-5 md:grid-cols-2">
            <div>
              <label className="block text-sm font-semibold text-neutral-700">
                E-post
              </label>
              <input
                value={form.email}
                onChange={(e) =>
                  setForm((f) => ({ ...f, email: e.target.value }))
                }
                className={INPUT_LIGHT}
              />
            </div>
            <div>
              <label className="block text-sm font-semibold text-neutral-700">
                Telefon
              </label>
              <input
                value={form.phone}
                onChange={(e) =>
                  setForm((f) => ({ ...f, phone: e.target.value }))
                }
                className={INPUT_LIGHT}
              />
            </div>
            <div className="md:col-span-2">
              <label className="block text-sm font-semibold text-neutral-700">
                Adresse
              </label>
              <input
                value={form.address}
                onChange={(e) =>
                  setForm((f) => ({ ...f, address: e.target.value }))
                }
                className={INPUT_LIGHT}
              />
            </div>
            <div>
              <label className="block text-sm font-semibold text-neutral-700">
                Postnummer
              </label>
              <input
                value={form.postal_code}
                onChange={(e) =>
                  setForm((f) => ({ ...f, postal_code: e.target.value }))
                }
                className={INPUT_LIGHT}
              />
            </div>
            <div>
              <label className="block text-sm font-semibold text-neutral-700">
                Sted
              </label>
              <input
                value={form.city}
                onChange={(e) =>
                  setForm((f) => ({ ...f, city: e.target.value }))
                }
                className={INPUT_LIGHT}
              />
            </div>
          </div>
        </section>

        {/* Foresatt */}
        <section className="rounded-2xl border border-neutral-200 bg-white p-6 shadow-sm">
          <h2 className="mb-4 text-xl font-semibold text-neutral-900">
            Foresatt
          </h2>
          <div className="grid gap-5 md:grid-cols-3">
            <div>
              <label className="block text-sm font-semibold text-neutral-700">
                Navn
              </label>
              <input
                value={form.guardian_name}
                onChange={(e) =>
                  setForm((f) => ({ ...f, guardian_name: e.target.value }))
                }
                className={INPUT_LIGHT}
              />
            </div>
            <div>
              <label className="block text-sm font-semibold text-neutral-700">
                Telefon
              </label>
              <input
                value={form.guardian_phone}
                onChange={(e) =>
                  setForm((f) => ({ ...f, guardian_phone: e.target.value }))
                }
                className={INPUT_LIGHT}
              />
            </div>
            <div>
              <label className="block text-sm font-semibold text-neutral-700">
                E-post
              </label>
              <input
                value={form.guardian_email}
                onChange={(e) =>
                  setForm((f) => ({ ...f, guardian_email: e.target.value }))
                }
                className={INPUT_LIGHT}
              />
            </div>
          </div>
        </section>

        {/* Helse */}
        <section className="rounded-2xl border border-neutral-200 bg-white p-6 shadow-sm">
          <h2 className="mb-4 text-xl font-semibold text-neutral-900">
            Helse
          </h2>
          <div className="grid gap-5 md:grid-cols-2">
            <div>
              <label className="block text-sm font-semibold text-neutral-700">
                Allergier
              </label>
              <textarea
                value={form.allergies}
                onChange={(e) =>
                  setForm((f) => ({ ...f, allergies: e.target.value }))
                }
                className={TEXTAREA_LIGHT}
              />
            </div>
            <div>
              <label className="block text-sm font-semibold text-neutral-700">
                Medisinsk info
              </label>
              <textarea
                value={form.medical_info}
                onChange={(e) =>
                  setForm((f) => ({ ...f, medical_info: e.target.value }))
                }
                className={TEXTAREA_LIGHT}
              />
            </div>
          </div>
        </section>

        {/* Aktiviteter */}
        <section className="rounded-2xl border border-neutral-200 bg-white p-6 shadow-sm">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h2 className="text-xl font-semibold text-neutral-900">
                Aktiviteter
              </h2>
              <p className="text-xs text-neutral-500">
                Kryss av og velg rolle for medlemmet i hver aktivitet.
              </p>
            </div>
            <span className="text-sm font-semibold text-neutral-700">
              {selectedActs.length} valgt
            </span>
          </div>
          <div className="mt-4 space-y-6">
            <ActivitySection
              title="Tilbud"
              activities={offers}
              selectedActs={selectedActs}
              selectedRoles={selectedRoles}
              onToggle={handleToggleActivity}
              onRoleChange={handleRoleChange}
            />
            <ActivitySection
              title="Eventer"
              activities={events}
              selectedActs={selectedActs}
              selectedRoles={selectedRoles}
              onToggle={handleToggleActivity}
              onRoleChange={handleRoleChange}
            />
          </div>
        </section>

        {/* Internt + arkiv + slett */}
        <section className="rounded-2xl border border-neutral-200 bg-white p-6 shadow-sm">
          <h2 className="mb-4 text-xl font-semibold text-neutral-900">
            Internt
          </h2>
          <div className="grid gap-5 md:grid-cols-[2fr,1fr]">
            <div>
              <label className="block text-sm font-semibold text-neutral-700">
                Interne notater
              </label>
              <textarea
                value={form.internal_notes}
                onChange={(e) =>
                  setForm((f) => ({
                    ...f,
                    internal_notes: e.target.value,
                  }))
                }
                className={TEXTAREA_LIGHT + " min-h-[140px]"}
              />
            </div>
            <div className="flex flex-col gap-4 rounded-xl border border-neutral-200 bg-neutral-50 p-4">
              <label className="flex items-center justify-between text-sm font-medium text-neutral-800">
                Arkiver medlem
                <input
                  type="checkbox"
                  className="h-4 w-4 accent-red-500"
                  checked={form.archived}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, archived: e.target.checked }))
                  }
                />
              </label>
              <p className="text-xs text-neutral-600">
                Arkiverte medlemmer skjules fra standardlister, men beholdes i
                databasen.
              </p>

              {/* Slett medlem – farlig område */}
              <DeleteMemberButton memberId={id} memberName={fullName} />
            </div>
          </div>
        </section>
      </div>
    </main>
  );
}

type ActivitySectionProps = {
  title: string;
  activities: Activity[];
  selectedActs: string[];
  selectedRoles: Record<string, Role>;
  onToggle: (id: string) => void;
  onRoleChange: (id: string, role: Role) => void;
};

function ActivitySection({
  title,
  activities,
  selectedActs,
  selectedRoles,
  onToggle,
  onRoleChange,
}: ActivitySectionProps) {
  if (activities.length === 0) {
    return (
      <div>
        <h3 className="text-sm font-semibold uppercase tracking-wide text-neutral-500">
          {title}
        </h3>
        <p className="mt-2 rounded-xl border border-dashed border-neutral-300 bg-neutral-50 p-4 text-sm text-neutral-600">
          Ingen {title.toLowerCase()} funnet.
        </p>
      </div>
    );
  }

  return (
    <div>
      <h3 className="text-sm font-semibold uppercase tracking-wide text-neutral-500">
        {title}
      </h3>
      <div className="mt-3 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {activities.map((activity) => {
          const aid = activity.id;
          const selected = selectedActs.includes(aid);
          const role = selectedRoles[aid] ?? "none";
          const typeLabel = activity.type === "event" ? "EVENT" : "TILBUD";

          return (
            <div
              key={aid}
              className={`rounded-2xl border p-4 transition ${
                selected
                  ? "border-red-400 bg-red-50"
                  : "border-neutral-200 bg-white hover:border-red-300"
              }`}
            >
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-base font-semibold text-neutral-900">
                    {activity.name}
                  </p>
                  <span className="inline-flex items-center rounded-full bg-red-100 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-red-700">
                    {typeLabel}
                  </span>
                </div>
                <button
                  type="button"
                  onClick={() => onToggle(aid)}
                  className={`rounded-full border px-3 py-1 text-xs font-semibold transition ${
                    selected
                      ? "border-red-500 bg-red-600 text-white shadow-sm"
                      : "border-neutral-300 bg-white text-neutral-800 hover:border-red-400"
                  }`}
                >
                  {selected ? "Valgt" : "Velg"}
                </button>
              </div>
              <div className="mt-4 flex flex-wrap gap-2">
                <RolePill
                  label="Ingen"
                  active={role === "none"}
                  onClick={() => onRoleChange(aid, "none")}
                />
                <RolePill
                  label="Deltaker"
                  active={role === "participant"}
                  onClick={() => onRoleChange(aid, "participant")}
                />
                <RolePill
                  label="Leder"
                  active={role === "leader"}
                  onClick={() => onRoleChange(aid, "leader")}
                />
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

/* ----------------------------- Delete knapp ----------------------------- */

function safeJSON<T>(raw: string | null, fallback: T): T {
  try {
    if (!raw) return fallback;
    const d = JSON.parse(raw);
    return (d ?? fallback) as T;
  } catch {
    return fallback;
  }
}

const MEM_V1 = "follies.members.v1";
const MEM_FB = "follies.members";

function DeleteMemberButton({
  memberId,
  memberName,
}: {
  memberId: string;
  memberName?: string;
}) {
  const supabase = createClientComponentClient();
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function handleDelete() {
    if (!memberId) return;
    const label = (memberName || "").trim() || "dette medlemmet";

    const ok = window.confirm(
      `Er du sikker på at du vil slette ${label}?\n\n` +
        "Dette fjerner medlemmet, påmeldinger og meldinger knyttet til medlemmet."
    );
    if (!ok) return;

    setBusy(true);
    setErr(null);

    try {
      // 1) Slett enrollments
      try {
        await supabase.from("enrollments").delete().eq("member_id", memberId);
      } catch (e) {
        console.error("Feil ved sletting av enrollments:", e);
      }

      // 2) Slett meldinger (hvis messages-tabell finnes)
      try {
        await supabase.from("messages").delete().eq("member_id", memberId);
      } catch (e) {
        console.error("Feil ved sletting av messages:", e);
      }

      // 3) Slett medlem
      const { error: delErr } = await supabase
        .from("members")
        .delete()
        .eq("id", memberId);

      if (delErr) {
        console.error("Feil ved sletting av medlem:", delErr);
        throw delErr;
      }

      // 4) Rydd LS (members)
      if (typeof window !== "undefined") {
        const keys = [MEM_V1, MEM_FB];
        for (const key of keys) {
          const raw = window.localStorage.getItem(key);
          if (!raw) continue;
          const list = safeJSON<any[]>(raw, []);
          if (!Array.isArray(list)) continue;
          const filtered = list.filter(
            (m) => String(m.id ?? "") !== String(memberId)
          );
          window.localStorage.setItem(key, JSON.stringify(filtered));
        }
      }

      router.push("/members");
      router.refresh();
    } catch (e: any) {
      console.error("Uventet feil ved sletting av medlem:", e);
      setErr(
        e?.message ||
          "Noe gikk galt ved sletting av medlem. Sjekk loggen i Supabase."
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mt-4 border-t border-neutral-300 pt-4">
      <p className="mb-1 text-sm font-semibold text-red-700">Slett medlem</p>
      <p className="mb-3 text-xs text-neutral-600">
        Dette er permanent. Bruk kun hvis medlemmet ikke lenger skal ligge i
        systemet.
      </p>
      <button
        type="button"
        onClick={handleDelete}
        disabled={busy}
        className="rounded-md border border-red-500 bg-rose-50 px-4 py-2 text-sm font-semibold text-red-700 hover:bg-rose-100 disabled:opacity-60"
      >
        {busy ? "Sletter…" : "Slett medlem"}
      </button>
      {err && (
        <p className="mt-2 text-xs text-red-700">
          {err}
        </p>
      )}
    </div>
  );
}
