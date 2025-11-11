"use client";

import { useRouter, useParams } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { createClientComponentClient } from "@supabase/auth-helpers-nextjs";

type AnyObj = Record<string, any>;
type Activity = {
  id: string;                 // UI-vennlig ID (string)
  rawId: string | number;     // ORIGINAL verdi fra DB (uuid eller number)
  name: string;
  type: "offer" | "event";
  archived?: boolean;
};

type Role = "leader" | "participant";

const LS_MEM_V1 = "follies.members.v1";
const LS_MEM_OLD = "follies.members";
const LS_ACT_V1 = "follies.activities.v1";
const LS_ACT_OLD = "follies.activities";
const LS_ENR_V1 = "follies.enrollments.v1";
const LS_PERMS_V1 = "follies.perms.v1";
const MAX_IMAGE_BYTES = 10 * 1024 * 1024;

const safeJSON = <T,>(s: string | null): T | null => {
  try { return s ? (JSON.parse(s) as T) : null; } catch { return null; }
};

const INPUT =
  "mt-1 w-full rounded-lg border border-neutral-300 bg-white px-4 py-2 text-[16px] text-black placeholder:text-neutral-700 focus:outline-none focus:ring-2 focus:ring-indigo-600";
const FILE_INPUT =
  "mt-3 block w-full text-base file:mr-3 file:rounded-md file:border-0 file:bg-neutral-200 file:px-3 file:py-2 file:text-base file:font-medium file:text-black hover:file:bg-neutral-300";

/* ---- Normalisering ---- */
const nullIfEmpty = (v: any) => (typeof v === "string" && v.trim() === "" ? null : v);
const cleanDate = (v: any) => { if (!v) return null; const s = String(v).trim(); return /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : null; };
const numberOrNull = (v: any) => { if (v === "" || v === null || v === undefined) return null; const n = Number(v); return Number.isFinite(n) ? n : null; };
const safeHttpUrl = (v: any) => { if (!v) return null; const s = String(v); if (s.startsWith("blob:")) return null; return /^https?:\/\//i.test(s) ? s : null; };
const normalizeRole = (val?: string | null): Role => {
  const v = (val || "").toLowerCase().trim();
  if (v === "leader" || v === "leder") return "leader";
  return "participant";
};

/* ---- Aktiviteter: DB først, LS fallback (for visning) ---- */
async function fetchActivitiesDB(): Promise<Activity[] | null> {
  try {
    const supabase = createClientComponentClient();
    const { data: sess } = await supabase.auth.getSession();
    if (!sess?.session) return null;

    const { data, error } = await supabase
      .from("activities")
      .select("id,name,type,archived");
    if (error || !data) return null;

    return (data as AnyObj[])
      .filter(a => !a.archived)
      .map(a => {
        const rawId = a.id as string | number;
        const id = String(rawId);
        const t = String(a.type ?? "").toLowerCase() === "event" ? "event" : "offer";
        return { id, rawId, name: String(a.name ?? ""), type: t as "offer" | "event", archived: !!a.archived };
      });
  } catch { return null; }
}

function readActivitiesFromLS(): Activity[] {
  const v1 = safeJSON<any[]>(localStorage.getItem(LS_ACT_V1)) ?? [];
  const old = safeJSON<any[]>(localStorage.getItem(LS_ACT_OLD)) ?? [];
  const merged = [...old, ...v1];
  const norm = merged.map((a, i) => {
    const anyId = a?.id ?? a?.uuid ?? a?._id ?? `a-${i}`;
    const id = String(anyId);
    const rawId: string | number = typeof anyId === "number" ? anyId : id; // best effort
    const name = a?.name ?? a?.title ?? a?.navn ?? a?.programName ?? `Aktivitet ${id}`;
    const rawType = String(a?.type ?? a?.category ?? a?.kategori ?? "").toLowerCase();
    const isEvent = rawType.includes("event") || rawType.includes("konsert") || rawType.includes("forest") || rawType.includes("åpen") || rawType.includes("open");
    const type: "offer" | "event" = isEvent ? "event" : "offer";
    const archived = !!(a?.archived || a?.is_archived || (String(a?.status).toLowerCase() === "archived"));
    return { id, rawId, name, type, archived };
  });
  const map = new Map<string, Activity>();
  for (const a of norm) map.set(a.id, a);
  return Array.from(map.values()).filter((x) => !x.archived);
}

/* ---- Speil til LS ---- */
function mirrorMemberToLS(memberId: string, updated: AnyObj) {
  const list = safeJSON<any[]>(localStorage.getItem(LS_MEM_V1)) ?? [];
  const newList = list.map((m) => (m.id === memberId ? { ...(m || {}), ...updated } : m));
  localStorage.setItem(LS_MEM_V1, JSON.stringify(newList));
  localStorage.setItem(LS_MEM_OLD, JSON.stringify(newList));
}
function mirrorEnrollmentsToLS(memberId: string, rows: Array<{ activity_id: string; role: Role }>) {
  const arr = safeJSON<any[]>(localStorage.getItem(LS_ENR_V1)) ?? [];
  const others = arr.filter((r) => !(String(r.member_id) === String(memberId)));
  const normalized = rows.map(r => ({ member_id: memberId, activity_id: String(r.activity_id), role: normalizeRole(r.role) }));
  localStorage.setItem(LS_ENR_V1, JSON.stringify([...others, ...normalized]));
}

/* ---- Finn leder-aktiviteter for dette medlemmet ---- */
/** Globalt lederflagg på medlem (fra members-objektet i LS) */
function isLeaderGlobal(m: AnyObj | null | undefined): boolean {
  if (!m) return false;
  if (m.is_leader === true || m.isLeader === true) return true;
  const txt = [
    m.role, m.rolle, m.title, m.position, m.stilling, m.tags, m.notes, m.internal_notes
  ].filter(Boolean).map(String).join(" ").toLowerCase();
  return /\bleder\b|\bleader\b|\binstrukt(ør|or)\b|\bkoreograf\b|\bcoach\b|\btrener\b/.test(txt);
}

/** Les ‘follies.perms.v1’ og finn hvilke av actIds som er leder-nivå (edit/admin) for memberId */
function leaderActivityIdsFromPerms(memberId: string, actIds: string[]): string[] {
  const raw = safeJSON<any>(localStorage.getItem(LS_PERMS_V1)) ?? null;
  if (!raw) return [];

  const wanted = new Set<string>();
  const actSet = new Set(actIds.map(String));
  const isLeaderLevel = (val: any) => {
    const s = String(val ?? "").toLowerCase();
    return s === "admin" || s === "edit" || s === "leder" || s === "leader";
  };

  // Variant A: { perOffer: { [activityId]: { [memberId]: "admin"|"edit"|... } } }
  if (raw.perOffer && typeof raw.perOffer === "object") {
    for (const [aid, map] of Object.entries<any>(raw.perOffer)) {
      if (!actSet.has(String(aid))) continue;
      if (map && typeof map === "object") {
        for (const [uid, lvl] of Object.entries<any>(map)) {
          if (String(uid) === String(memberId) && isLeaderLevel(lvl?.level ?? lvl)) wanted.add(String(aid));
        }
      }
    }
  }

  // Variant B: { byUser: { [memberId]: { [activityId]: "edit"|"admin"|... } } }
  if (raw.byUser && typeof raw.byUser === "object") {
    const entry = raw.byUser[memberId] || raw.byUser[String(memberId)];
    if (entry && typeof entry === "object") {
      for (const [aid, lvl] of Object.entries<any>(entry)) {
        if (actSet.has(String(aid)) && isLeaderLevel(lvl?.level ?? lvl)) wanted.add(String(aid));
      }
    }
  }

  // Variant C: entries/array med objekter
  const arr: any[] = Array.isArray(raw) ? raw : Array.isArray(raw?.entries) ? raw.entries : [];
  for (const r of arr) {
    const aid = String(r?.activityId ?? r?.offerId ?? r?.resourceId ?? r?.id ?? "");
    const uid = String(r?.memberId ?? r?.userId ?? r?.uid ?? r?.ownerId ?? r?.who ?? "");
    const lvl = r?.perm ?? r?.role ?? r?.level ?? r?.access ?? r?.type ?? "";
    if (aid && actSet.has(aid) && uid && String(uid) === String(memberId) && isLeaderLevel(lvl)) {
      wanted.add(aid);
    }
  }

  return Array.from(wanted);
}

/* ---- FK-sikker synk av enrollments + ROLLER (ingen UI-endring) ---- */
async function syncEnrollmentsStrict(
  supabase: ReturnType<typeof createClientComponentClient>,
  memberId: string,
  desiredUiIds: string[],
  leaderUiIds?: string[] | null // valgfritt: hvis satt, disse blir 'leader'
) {
  // 1) Finn hvilke av de ønskede som faktisk finnes i DB
  const desiredSet = new Set(desiredUiIds.map(String));
  let existingActIdsInDB: Array<{ id: any }> = [];
  if (desiredSet.size > 0) {
    const desiredArr = Array.from(desiredSet);
    const { data: actsInDb, error: actsErr } = await supabase
      .from("activities")
      .select("id")
      .in("id", desiredArr);
    if (actsErr) throw actsErr;
    existingActIdsInDB = actsInDb ?? [];
  }

  const validDbIdStrs = new Set(existingActIdsInDB.map(r => String(r.id)));
  const validUiIds = desiredUiIds.filter(id => validDbIdStrs.has(String(id)));
  const skippedUiIds = desiredUiIds.filter(id => !validDbIdStrs.has(String(id)));

  // 2) Nåværende enrollments for medlemmet
  const { data: existingEnr, error: selErr } = await supabase
    .from("enrollments")
    .select("activity_id, role")
    .eq("member_id", memberId);
  if (selErr) throw selErr;

  const currentMap = new Map<string, Role>((existingEnr ?? []).map(r => [String(r.activity_id), normalizeRole(r.role)]));

  // 3) Ønsket rolle pr valgt aktivitet
  const leaderSet = new Set((leaderUiIds ?? []).map(String));
  const desiredRoleMap = new Map<string, Role>();
  for (const id of validUiIds) {
    if (leaderSet.has(id)) desiredRoleMap.set(id, "leader");
    else if (currentMap.has(id)) desiredRoleMap.set(id, currentMap.get(id)!); // bevar
    else desiredRoleMap.set(id, "participant");
  }

  // 4) Diff
  const currentIds = new Set<string>(Array.from(currentMap.keys()));
  const desiredIds = new Set<string>(validUiIds.map(String));

  const toDelete = [...currentIds].filter(id => !desiredIds.has(id));
  const toUpsert: Array<{ member_id: string; activity_id: any; role: Role }> = [];

  for (const id of desiredIds) {
    const desiredRole = desiredRoleMap.get(id)!;
    const curRole = currentMap.get(id);
    if (!curRole || curRole !== desiredRole) {
      toUpsert.push({ member_id: memberId, activity_id: id, role: desiredRole });
    }
  }

  // 5) Skriv
  if (toUpsert.length) {
    const { error: upErr } = await supabase
      .from("enrollments")
      .upsert(toUpsert, { onConflict: "member_id,activity_id" });
    if (upErr) throw upErr;
  }

  if (toDelete.length) {
    const { error: delErr } = await supabase
      .from("enrollments")
      .delete()
      .eq("member_id", memberId)
      .in("activity_id", toDelete);
    if (delErr) throw delErr;
  }

  // 6) Les tilbake for speil, med rolle
  const { data: afterRows, error: afterErr } = await supabase
    .from("enrollments")
    .select("activity_id, role")
    .eq("member_id", memberId);
  if (afterErr) throw afterErr;

  const rowsForLS = (afterRows || []).map(r => ({ activity_id: String(r.activity_id), role: normalizeRole(r.role) }));
  mirrorEnrollmentsToLS(memberId, rowsForLS);

  return { finalCount: (afterRows ?? []).length, skippedUiIds };
}

export default function EditMemberPage() {
  const router = useRouter();
  const params = useParams();
  const memberId = params?.id as string;

  const [form, setForm] = useState<AnyObj | null>(null);
  const [activities, setActivities] = useState<Activity[]>([]);
  const [selectedActs, setSelectedActs] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);
  const fileRef = useRef<HTMLInputElement | null>(null);

  // 🚩 Laster medlem + aktiviteter, og PRUNER spøkelses-ID-er fra selectedActs
  useEffect(() => {
    // 1) last medlem fra LS
    const list = safeJSON<any[]>(localStorage.getItem(LS_MEM_V1)) ?? [];
    const found = list.find((m) => m.id === memberId);
    if (found) {
      setForm(found);
      setSelectedActs(found.activityIds || found.activities || []);
    }

    // 2) last aktiviteter (DB først, LS fallback) og PRUNE
    (async () => {
      const dbActs = await fetchActivitiesDB();
      const acts = dbActs && dbActs.length ? dbActs : readActivitiesFromLS();
      setActivities(acts);

      // PRUNE: fjern alle selectedActs som ikke finnes i 'acts'
      setSelectedActs(prev => {
        const validSet = new Set(acts.map(a => String(a.id)));
        const kept = (prev ?? []).filter(id => validSet.has(String(id)));
        const removed = (prev ?? []).filter(id => !validSet.has(String(id)));
        if (removed.length > 0) {
          alert("Noen valgte aktiviteter fantes ikke i databasen og ble fjernet: " + removed.join(", "));
        }
        // speil også inn i form så vi blir kvitt spøkelses-IDer i LS på neste lagring
        setForm(f => f ? { ...f, activities: kept, activityIds: kept } : f);
        return kept;
      });
    })();
  }, [memberId]);

  function toggleAct(id: string) {
    setSelectedActs((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  }

  async function onUploadAvatar() {
    if (!fileRef.current?.files?.length) return;
    const file = fileRef.current.files[0];
    if (!file.type.startsWith("image/")) { alert("Velg en bildefil."); return; }
    if (file.size > MAX_IMAGE_BYTES) { alert("Maks 10 MB."); return; }

    try {
      const supabase = createClientComponentClient();
      const { data: sess } = await supabase.auth.getSession();
      if (!sess?.session) { alert("Du er ikke innlogget."); return; }

      const BUCKET = "profile-pictures";
      const path = `members/${memberId}/${Date.now()}-${file.name}`;
      const { error: upErr } = await supabase.storage.from(BUCKET).upload(path, file, {
        upsert: false, cacheControl: "3600", contentType: file.type,
      });
      if (upErr) throw upErr;

      const { data } = supabase.storage.from(BUCKET).getPublicUrl(path);
      setForm((f: any) => ({ ...f, avatar_url: data.publicUrl }));
    } catch (e: any) {
      alert(e?.message || "Feil ved opplasting.");
    } finally {
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  async function onSave() {
    if (!form) return;
    setSaving(true);
    try {
      const updated: AnyObj = {
        id: memberId,
        first_name: nullIfEmpty(form.first_name ?? ""),
        last_name: nullIfEmpty(form.last_name ?? ""),
        email: nullIfEmpty(form.email ?? ""),
        phone: nullIfEmpty(form.phone ?? ""),
        address: nullIfEmpty(form.address ?? ""),
        postal_code: nullIfEmpty(form.postal_code ?? ""),
        city: nullIfEmpty(form.city ?? ""),
        dob: cleanDate(form.dob),
        start_date: cleanDate(form.start_date),
        start_year: numberOrNull(form.start_year),
        guardian_name: nullIfEmpty(form.guardian_name ?? ""),
        guardian_phone: nullIfEmpty(form.guardian_phone ?? ""),
        guardian_email: nullIfEmpty(form.guardian_email ?? ""),
        allergies: nullIfEmpty(form.allergies ?? ""),
        medical_info: nullIfEmpty(form.medical_info ?? ""),
        internal_notes: nullIfEmpty(form.internal_notes ?? ""),
        archived: !!form.archived,
        avatar_url: safeHttpUrl(form.avatar_url),
        // behold for LS, IKKE i DB:
        activities: Array.isArray(selectedActs) ? selectedActs : [],
        activityIds: Array.isArray(selectedActs) ? selectedActs : [],
      };

      Object.keys(updated).forEach((k) => { if (updated[k] === undefined) delete updated[k]; });

      // Finn hvilke av de valgte aktivitetene som skal være LEDER
      const selected = Array.isArray(selectedActs) ? selectedActs.map(String) : [];
      let leaderIds: string[] = [];

      if (isLeaderGlobal(form)) {
        // Globalt leder → alle valgte aktiviteter blir leder
        leaderIds = [...selected];
      } else {
        // Per-aktivitet leder via perms-speilet
        leaderIds = leaderActivityIdsFromPerms(memberId, selected);
      }

      const supabase = createClientComponentClient();
      const { data: sess } = await supabase.auth.getSession();

      if (!sess?.session) {
        mirrorMemberToLS(memberId, updated);
        const rowsForLS = selected.map((id) => ({
          activity_id: String(id),
          role: leaderIds.includes(String(id)) ? "leader" as Role : "participant" as Role,
        }));
        mirrorEnrollmentsToLS(memberId, rowsForLS);
        alert("Du er ikke innlogget. Endringen er lagret lokalt som fallback.");
        router.push(`/members/${memberId}`);
        return;
      }

      // Oppdater members (IKKE send activities-feltene)
      const { activities: _omit1, activityIds: _omit2, ...dbPayload } = updated;
      const { error: dbErr } = await supabase
        .from("members")
        .update(dbPayload)
        .eq("id", memberId);
      if (dbErr) {
        mirrorMemberToLS(memberId, updated);
        const rowsForLS = selected.map((id) => ({
          activity_id: String(id),
          role: leaderIds.includes(String(id)) ? "leader" as Role : "participant" as Role,
        }));
        mirrorEnrollmentsToLS(memberId, rowsForLS);
        alert(`Kunne ikke lagre i databasen (${dbErr.message}). Endringen er lagret lokalt som fallback.`);
        router.push(`/members/${memberId}`);
        return;
      }

      // FK-sikker synk av enrollments + ROLLER (DB-først)
      const { skippedUiIds } = await syncEnrollmentsStrict(
        supabase,
        memberId,
        selected,
        leaderIds
      );

      // Speil medlem til LS
      mirrorMemberToLS(memberId, { ...dbPayload, activities: updated.activities, activityIds: updated.activityIds });

      // Speil enrollments til LS med korrekt rolle (uten de som ble skippet)
      const validActs = selected.filter(id => !skippedUiIds.includes(id));
      const rowsForLS = validActs.map((id) => ({
        activity_id: String(id),
        role: leaderIds.includes(String(id)) ? "leader" as Role : "participant" as Role,
      }));
      mirrorEnrollmentsToLS(memberId, rowsForLS);

      router.push(`/members/${memberId}`);
    } catch (err: any) {
      const reason = err?.message || String(err);
      alert("Feil under lagring: " + reason + " – endringen lagres lokalt som fallback.");
      const selected = Array.isArray(selectedActs) ? selectedActs.map(String) : [];
      let leaderIds: string[] = [];
      if (isLeaderGlobal(form)) leaderIds = [...selected];
      else leaderIds = leaderActivityIdsFromPerms(memberId, selected);

      const rowsForLS = selected.map((id) => ({
        activity_id: String(id),
        role: leaderIds.includes(String(id)) ? "leader" as Role : "participant" as Role,
      }));
      mirrorMemberToLS(memberId, { id: memberId, ...form, activities: selected, activityIds: selected });
      mirrorEnrollmentsToLS(memberId, rowsForLS);
      router.push(`/members/${memberId}`);
    } finally {
      setSaving(false);
    }
  }

  if (!form) return <div className="p-8">Laster medlem...</div>;

  const offers = activities.filter(a => a.type === "offer").sort((a,b)=>a.name.localeCompare(b.name));
  const events = activities.filter(a => a.type === "event").sort((a,b)=>a.name.localeCompare(b.name));

  return (
    <div className="mx-auto max-w-6xl px-4 py-8">
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-3xl font-bold tracking-tight text-indigo-700">✏️ Rediger medlem</h1>
        <button onClick={onSave} disabled={saving}
          className="rounded-lg bg-indigo-600 px-4 py-2 text-base font-semibold text-white hover:bg-indigo-700 focus:ring-2 focus:ring-indigo-600 disabled:opacity-50">
          Lagre endringer
        </button>
      </div>

      {/* Øverste: Navn + bilde */}
      <section className="rounded-2xl bg-indigo-50 p-6 shadow ring-1 ring-indigo-200">
        <div className="grid gap-6 md:grid-cols-3">
          <div className="md:col-span-2 grid gap-4 sm:grid-cols-2">
            <div>
              <label className="block text-base font-medium text-neutral-900">Fornavn</label>
              <input value={form.first_name || ""} onChange={(e)=>setForm(f=>({...f, first_name: e.target.value}))} className={INPUT}/>
            </div>
            <div>
              <label className="block text-base font-medium text-neutral-900">Etternavn</label>
              <input value={form.last_name || ""} onChange={(e)=>setForm(f=>({...f, last_name: e.target.value}))} className={INPUT}/>
            </div>
            <div>
              <label className="block text-base font-medium text-neutral-900">Fødselsdato</label>
              <input type="date" value={form.dob || ""} onChange={(e)=>setForm(f=>({...f, dob: e.target.value}))} className={INPUT}/>
            </div>
          </div>
          <div className="flex flex-col items-center justify-center">
            <div className="h-40 w-40 overflow-hidden rounded-2xl bg-neutral-100 ring-1 ring-neutral-300">
              {form.avatar_url ? <img src={form.avatar_url} alt="" className="h-full w-full object-cover" /> : <div className="flex h-full w-full items-center justify-center text-neutral-500">Ingen bilde</div>}
            </div>
            <input ref={fileRef} type="file" accept="image/*" className={FILE_INPUT}/>
            <button onClick={onUploadAvatar}
              className="mt-2 rounded-lg bg-indigo-600 px-3.5 py-2 text-base font-semibold text-white hover:bg-indigo-700 focus:ring-2 focus:ring-indigo-600">
              Last opp bilde
            </button>
          </div>
        </div>
      </section>

      {/* Kontaktinfo */}
      <section className="mt-6 rounded-2xl bg-white p-6 shadow ring-1 ring-neutral-200">
        <h2 className="mb-4 text-xl font-semibold text-indigo-700">Kontaktinfo</h2>
        <div className="grid gap-5 md:grid-cols-2">
          <div>
            <label className="block text-base font-medium text-neutral-900">E-post</label>
            <input value={form.email || ""} onChange={(e)=>setForm(f=>({...f, email: e.target.value}))} className={INPUT}/>
          </div>
          <div>
            <label className="block text-base font-medium text-neutral-900">Telefon</label>
            <input value={form.phone || ""} onChange={(e)=>setForm(f=>({...f, phone: e.target.value}))} className={INPUT}/>
          </div>
          <div className="md:col-span-2">
            <label className="block text-base font-medium text-neutral-900">Adresse</label>
            <input value={form.address || ""} onChange={(e)=>setForm(f=>({...f, address: e.target.value}))} className={INPUT}/>
          </div>
          <div>
            <label className="block text-base font-medium text-neutral-900">Postnummer</label>
            <input value={form.postal_code || ""} onChange={(e)=>setForm(f=>({...f, postal_code: e.target.value}))} className={INPUT}/>
          </div>
          <div>
            <label className="block text-base font-medium text-neutral-900">Sted</label>
            <input value={form.city || ""} onChange={(e)=>setForm(f=>({...f, city: e.target.value}))} className={INPUT}/>
          </div>
        </div>
      </section>

      {/* Medlemskap */}
      <section className="mt-6 rounded-2xl bg-white p-6 shadow ring-1 ring-neutral-200">
        <h2 className="mb-4 text-xl font-semibold text-indigo-700">Medlemskap</h2>
        <div className="grid gap-5 md:grid-cols-3">
          <div>
            <label className="block text-base font-medium text-neutral-900">Startår</label>
            <input value={form.start_year ?? ""} onChange={(e)=>setForm(f=>({...f, start_year: e.target.value}))} className={INPUT}/>
          </div>
          <div>
            <label className="block text-base font-medium text-neutral-900">Startdato</label>
            <input type="date" value={form.start_date || ""} onChange={(e)=>setForm(f=>({...f, start_date: e.target.value}))} className={INPUT}/>
          </div>
          <div className="flex items-center">
            <input type="checkbox" checked={!!form.archived} onChange={(e)=>setForm(f=>({...f, archived: e.target.checked}))} className="h-4 w-4 accent-indigo-600"/>
            <label className="ml-2 text-base font-medium text-neutral-900">Arkivert</label>
          </div>
        </div>
      </section>

      {/* Foresatte */}
      <section className="mt-6 rounded-2xl bg-indigo-50 p-6 shadow ring-1 ring-indigo-200">
        <h2 className="mb-4 text-xl font-semibold text-indigo-700">Foresatt</h2>
        <div className="grid gap-5 md:grid-cols-3">
          <div>
            <label className="block text-base font-medium text-neutral-900">Navn</label>
            <input value={form.guardian_name || ""} onChange={(e)=>setForm(f=>({...f, guardian_name: e.target.value}))} className={INPUT}/>
          </div>
          <div>
            <label className="block text-base font-medium text-neutral-900">Telefon</label>
            <input value={form.guardian_phone || ""} onChange={(e)=>setForm(f=>({...f, guardian_phone: e.target.value}))} className={INPUT}/>
          </div>
          <div>
            <label className="block text-base font-medium text-neutral-900">E-post</label>
            <input value={form.guardian_email || ""} onChange={(e)=>setForm(f=>({...f, guardian_email: e.target.value}))} className={INPUT}/>
          </div>
        </div>
      </section>

      {/* Helse */}
      <section className="mt-6 rounded-2xl bg-white p-6 shadow ring-1 ring-neutral-200">
        <h2 className="mb-4 text-xl font-semibold text-indigo-700">Helse</h2>
        <div className="grid gap-5 md:grid-cols-2">
          <div>
            <label className="block text-base font-medium text-neutral-900">Allergier</label>
            <textarea value={form.allergies || ""} onChange={(e)=>setForm(f=>({...f, allergies: e.target.value}))} className={INPUT}/>
          </div>
          <div>
            <label className="block text-base font-medium text-neutral-900">Medisinsk info</label>
            <textarea value={form.medical_info || ""} onChange={(e)=>setForm(f=>({...f, medical_info: e.target.value}))} className={INPUT}/>
          </div>
        </div>
      </section>

      {/* Aktiviteter */}
      <section className="mt-6 rounded-2xl bg-indigo-50 p-6 shadow ring-1 ring-indigo-200">
        <div className="flex items-center justify-between">
          <h2 className="text-xl font-semibold text-indigo-700">Aktiviteter</h2>
          <span className="text-sm font-semibold text-neutral-900">{selectedActs.length} valgt</span>
        </div>
        <div className="mt-4">
          <h3 className="text-base font-semibold text-neutral-900">Tilbud</h3>
          <div className="mt-2 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {offers.map((a) => (
              <label key={a.id} className="flex items-center gap-3 rounded-lg bg-white p-3 ring-1 ring-neutral-200 hover:bg-neutral-50">
                <input
                  type="checkbox"
                  className="h-4 w-4 accent-indigo-600"
                  checked={selectedActs.includes(a.id)}
                  onChange={()=>toggleAct(a.id)}
                />
                <span className="text-[16px] text-neutral-900">{a.name}</span>
              </label>
            ))}
          </div>
        </div>
        <div className="mt-6">
          <h3 className="text-base font-semibold text-neutral-900">Eventer</h3>
          <div className="mt-2 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {events.map((a) => (
              <label key={a.id} className="flex items-center gap-3 rounded-lg bg-white p-3 ring-1 ring-neutral-200 hover:bg-neutral-50">
                <input
                  type="checkbox"
                  className="h-4 w-4 accent-indigo-600"
                  checked={selectedActs.includes(a.id)}
                  onChange={()=>toggleAct(a.id)}
                />
                <span className="text-[16px] text-neutral-900">{a.name}</span>
              </label>
            ))}
          </div>
        </div>
      </section>
    </div>
  );
}
