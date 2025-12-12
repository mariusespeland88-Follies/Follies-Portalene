"use client";

import { Fragment, useCallback, useEffect, useMemo, useState } from "react";

const INPUT_CLASSES =
  "mt-1 w-full rounded-lg border border-neutral-300 bg-white px-3 py-2 text-sm text-neutral-900 placeholder:text-neutral-500 focus:outline-none focus:ring-2 focus:ring-red-600";
const TEXTAREA_CLASSES =
  "mt-1 w-full rounded-lg border border-neutral-300 bg-white px-3 py-2 text-sm text-neutral-900 placeholder:text-neutral-500 focus:outline-none focus:ring-2 focus:ring-red-600";

export type GuestChild = {
  id: string;
  guest_id: string;
  first_name: string | null;
  age: number | null;
  gender: string | null;
  notes: string | null;
  created_at?: string | null;
};

export type Guest = {
  id: string;
  activity_id: string;
  first_name: string;
  last_name: string;
  phone: string;
  email: string | null;
  is_norwegian: boolean | null;
  notes: string | null;
  present: boolean;
  present_marked_at: string | null;
  created_at?: string | null;
  updated_at?: string | null;
  children: GuestChild[];
};

type SortKey = "name" | "phone" | "email" | "children" | "persons";

type GuestFormState = {
  firstName: string;
  lastName: string;
  phone: string;
  email: string;
  isNorwegian: boolean;
  notes: string;
};

type ChildFormState = {
  guestId: string;
  child?: GuestChild | null;
  firstName: string;
  age: string;
  gender: string;
  notes: string;
  saving: boolean;
  error: string | null;
};

const defaultGuestForm = (): GuestFormState => ({
  firstName: "",
  lastName: "",
  phone: "",
  email: "",
  isNorwegian: false,
  notes: "",
});

/* ------------------ Display-normalisering (uten å skrive til DB) ------------------ */

const phoneDigits = (s: string) => (s || "").replace(/[^\d+]/g, "").trim();

function extractPhoneFromName(full: string): { cleanName: string; phone: string | null } {
  const raw = String(full || "").trim();
  if (!raw) return { cleanName: "", phone: null };

  const parts = raw.split(/\s+/);
  if (parts.length <= 1) return { cleanName: raw, phone: null };

  const last = parts[parts.length - 1];
  const digits = phoneDigits(last);

  if (/^\+?\d{7,15}$/.test(digits)) {
    return { cleanName: parts.slice(0, -1).join(" "), phone: digits };
  }
  return { cleanName: raw, phone: null };
}

function normalizeGuestForDisplay(g: Guest) {
  const fn = String(g.first_name || "").trim();
  const ln = String(g.last_name || "").trim();

  const baseName = `${fn} ${ln}`.trim();
  const extracted = extractPhoneFromName(baseName);

  const phoneRaw = String(g.phone || "").trim();
  const phoneClean = phoneDigits(phoneRaw);

  const phoneLooksMissing =
    !phoneClean || /^mangler$/i.test(phoneRaw) || /^missing-/i.test(phoneRaw);

  const displayPhone = phoneLooksMissing
    ? extracted.phone
      ? extracted.phone
      : ""
    : phoneClean;

  const displayName = extracted.phone ? extracted.cleanName : baseName;

  return {
    displayName: displayName || "Uten navn",
    displayPhone: displayPhone || "",
    displayEmail: (g.email || "").trim(),
  };
}

function personsCount(guest: Guest) {
  const kids = guest.children?.length ?? 0;
  return 1 + kids;
}

function sortDateValue(guest: Guest) {
  const a = guest.updated_at || guest.created_at || "";
  const t = Date.parse(a);
  return Number.isNaN(t) ? 0 : t;
}

const genderLabel = (value: string | null | undefined) => {
  const v = (value ?? "").toLowerCase();
  if (!v) return "—";
  if (v === "male" || v === "mann" || v === "gutt" || v === "m") return "Gutt";
  if (v === "female" || v === "kvinne" || v === "jente" || v === "f") return "Jente";
  if (v === "other") return "Annet";
  return "Ønsker ikke å oppgi";
};

const childSummary = (child: GuestChild) => {
  const name = child.first_name ? child.first_name : "Barn";
  const age =
    typeof child.age === "number" && !Number.isNaN(child.age)
      ? `${child.age} år`
      : "Alder ukjent";
  return `${name} (${age})`;
};

/* ------------------ Duplikat-gruppering ------------------ */
/**
 * Vi grupperer på “fingerprint” (navn + telefon + e-post) slik at:
 * - samme gjest som er blitt lagret dobbelt i DB ikke vises to ganger
 * - du kan slette/rydde alle i gruppen hvis du vil
 */
type GuestGroup = {
  key: string;
  primary: Guest;      // den vi viser i tabellen
  allIds: string[];    // alle ids i gruppen (for “slett alle”)
  count: number;       // hvor mange som ble slått sammen
};

function fingerprint(guest: Guest) {
  const n = normalizeGuestForDisplay(guest);
  const name = n.displayName.toLowerCase().trim();
  const phone = (n.displayPhone || "").toLowerCase().trim();
  const email = (n.displayEmail || "").toLowerCase().trim();
  return `${name}||${phone}||${email}`;
}

function mergeChildrenUnique(items: GuestChild[]) {
  const map = new Map<string, GuestChild>();
  for (const c of items || []) {
    const id = String(c?.id || "");
    if (!id) continue;
    map.set(id, c);
  }
  return Array.from(map.values());
}

function buildGroups(rawGuests: Guest[]): GuestGroup[] {
  const groups = new Map<string, Guest[]>();

  for (const g of rawGuests || []) {
    const k = fingerprint(g);
    const list = groups.get(k) || [];
    list.push(g);
    groups.set(k, list);
  }

  const out: GuestGroup[] = [];

  for (const [k, list] of groups.entries()) {
    // velg primary: den som er “nyest” (updated/created), fall back første
    const sorted = [...list].sort((a, b) => sortDateValue(b) - sortDateValue(a));
    const primaryBase = sorted[0] || list[0];

    // merge children fra alle i gruppen
    const mergedChildren = mergeChildrenUnique(
      list.flatMap((x) => Array.isArray(x.children) ? x.children : [])
    );

    // velg “best” felter: hvis primary mangler e-post/telefon, ta fra andre
    const pick = (field: "email" | "phone" | "notes") => {
      const firstNonEmpty =
        sorted.find((x) => String((x as any)[field] || "").trim()) ||
        primaryBase;
      return (firstNonEmpty as any)[field];
    };

    const primary: Guest = {
      ...primaryBase,
      email: pick("email") ?? primaryBase.email,
      phone: pick("phone") ?? primaryBase.phone,
      notes: pick("notes") ?? primaryBase.notes,
      children: mergedChildren,
    };

    const allIds = Array.from(new Set(list.map((x) => String(x.id)).filter(Boolean)));

    out.push({
      key: k,
      primary,
      allIds,
      count: allIds.length,
    });
  }

  return out;
}

/* -------------------------------- Component -------------------------------- */

export default function GuestsTab({ activityId }: { activityId: string }) {
  const [guests, setGuests] = useState<Guest[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [search, setSearch] = useState("");
  const [sortKey, setSortKey] = useState<SortKey>("name");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");

  const [expandedKey, setExpandedKey] = useState<string | null>(null);

  const [formOpen, setFormOpen] = useState(false);
  const [editingGroup, setEditingGroup] = useState<GuestGroup | null>(null);
  const [formState, setFormState] = useState<GuestFormState>(defaultGuestForm);
  const [formError, setFormError] = useState<string | null>(null);
  const [formSaving, setFormSaving] = useState(false);

  const [childForm, setChildForm] = useState<ChildFormState | null>(null);

  const fetchGuests = useCallback(async () => {
    if (!activityId) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(
        `/api/activity-guests?activityId=${encodeURIComponent(activityId)}`
      );
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body?.error || "Kunne ikke hente gjester");
      }
      const data = (await res.json()) as Guest[];
      setGuests(Array.isArray(data) ? data : []);
    } catch (e: any) {
      setError(e?.message || "Kunne ikke hente gjester");
    } finally {
      setLoading(false);
    }
  }, [activityId]);

  useEffect(() => {
    fetchGuests();
  }, [fetchGuests]);

  const groups = useMemo(() => buildGroups(guests), [guests]);

  const filteredAndSorted = useMemo(() => {
    const term = search.trim().toLowerCase();

    const filtered = groups.filter((g) => {
      if (!term) return true;
      const n = normalizeGuestForDisplay(g.primary);
      const name = n.displayName.toLowerCase();
      const phone = (n.displayPhone || "").toLowerCase();
      const email = (n.displayEmail || "").toLowerCase();
      return name.includes(term) || phone.includes(term) || email.includes(term);
    });

    const valueForSort = (grp: GuestGroup) => {
      const guest = grp.primary;
      const n = normalizeGuestForDisplay(guest);
      switch (sortKey) {
        case "name":
          return n.displayName.toLowerCase();
        case "phone":
          return (n.displayPhone || "").toLowerCase();
        case "email":
          return (n.displayEmail || "").toLowerCase();
        case "children":
          return guest.children?.length ?? 0;
        case "persons":
          return personsCount(guest);
        default:
          return 0;
      }
    };

    const sorted = [...filtered].sort((a, b) => {
      const av = valueForSort(a) as any;
      const bv = valueForSort(b) as any;
      if (av < bv) return sortDir === "asc" ? -1 : 1;
      if (av > bv) return sortDir === "asc" ? 1 : -1;
      return 0;
    });

    return sorted;
  }, [groups, search, sortDir, sortKey]);

  const toggleSort = (key: SortKey) => {
    if (sortKey === key) setSortDir((p) => (p === "asc" ? "desc" : "asc"));
    else {
      setSortKey(key);
      setSortDir("asc");
    }
  };

  const openNewForm = () => {
    setFormState(defaultGuestForm());
    setEditingGroup(null);
    setFormError(null);
    setFormOpen(true);
  };

  const openEditForm = (group: GuestGroup) => {
    const guest = group.primary;
    setEditingGroup(group);
    setFormState({
      firstName: guest.first_name,
      lastName: guest.last_name,
      phone: guest.phone || "",
      email: guest.email || "",
      isNorwegian: Boolean(guest.is_norwegian),
      notes: guest.notes || "",
    });
    setFormError(null);
    setFormOpen(true);
  };

  const closeForm = () => {
    setFormOpen(false);
    setEditingGroup(null);
    setFormError(null);
  };

  const submitForm = async () => {
    const payload = {
      firstName: formState.firstName.trim(),
      lastName: formState.lastName.trim(),
      phone: formState.phone.trim(),
      email: formState.email.trim() || null,
      isNorwegian: formState.isNorwegian,
      notes: formState.notes.trim() || null,
    };

    if (!payload.firstName || !payload.lastName || !payload.phone) {
      setFormError("Fornavn, etternavn og telefon er påkrevd.");
      return;
    }

    try {
      setFormSaving(true);
      setFormError(null);

      if (editingGroup) {
        // Rediger bare primary (trygt). Duplikater håndteres separat (rydde ved slett).
        const res = await fetch(`/api/activity-guests/${editingGroup.primary.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
        const data = await res.json().catch(() => null);
        if (!res.ok) throw new Error(data?.error || "Kunne ikke lagre gjest");
      } else {
        const res = await fetch(`/api/activity-guests`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ ...payload, activityId }),
        });
        const data = await res.json().catch(() => null);
        if (!res.ok) throw new Error(data?.error || "Kunne ikke lagre gjest");
      }

      closeForm();
      await fetchGuests();
    } catch (e: any) {
      setFormError(e?.message || "Kunne ikke lagre gjest");
    } finally {
      setFormSaving(false);
    }
  };

  const removeGroup = async (group: GuestGroup) => {
    const n = normalizeGuestForDisplay(group.primary);
    const hasDupes = group.allIds.length > 1;

    const msg = hasDupes
      ? `Denne gjesten ser ut til å finnes ${group.allIds.length} ganger.\n\nVil du slette ALLE?`
      : `Slette ${n.displayName}?`;

    if (!confirm(msg)) return;

    try {
      // Slett alle ids i gruppen (så blir det faktisk ryddig, ikke bare skjult)
      for (const id of group.allIds) {
        const res = await fetch(`/api/activity-guests/${id}`, { method: "DELETE" });
        const data = await res.json().catch(() => null);
        if (!res.ok) throw new Error(data?.error || `Kunne ikke slette (id: ${id})`);
      }
      await fetchGuests();
    } catch (e: any) {
      alert(e?.message || "Kunne ikke slette gjesten(e).");
    }
  };

  const openChildForm = (group: GuestGroup, child?: GuestChild | null) => {
    setChildForm({
      guestId: group.primary.id,
      child: child ?? null,
      firstName: child?.first_name || "",
      age:
        typeof child?.age === "number" && !Number.isNaN(child.age)
          ? String(child.age)
          : "",
      gender: child?.gender || "",
      notes: child?.notes || "",
      saving: false,
      error: null,
    });
  };

  const closeChildForm = () => setChildForm(null);

  const submitChildForm = async () => {
    if (!childForm) return;

    const ageValue = childForm.age.trim();
    const ageNumber = ageValue === "" ? null : Number(ageValue);
    if (ageNumber !== null && Number.isNaN(ageNumber)) {
      setChildForm((prev) => (prev ? { ...prev, error: "Alder må være et tall" } : prev));
      return;
    }

    const payload = {
      firstName: childForm.firstName.trim() || null,
      age: ageNumber,
      gender: childForm.gender || null,
      notes: childForm.notes.trim() || null,
    };

    try {
      setChildForm((prev) => (prev ? { ...prev, saving: true, error: null } : prev));

      if (childForm.child) {
        const res = await fetch(`/api/activity-guest-children/${childForm.child.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
        const data = await res.json().catch(() => null);
        if (!res.ok) throw new Error(data?.error || "Kunne ikke lagre barn");
      } else {
        const res = await fetch(`/api/activity-guests/${childForm.guestId}/children`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
        const data = await res.json().catch(() => null);
        if (!res.ok) throw new Error(data?.error || "Kunne ikke legge til barn");
      }

      closeChildForm();
      await fetchGuests();
    } catch (e: any) {
      setChildForm((prev) =>
        prev ? { ...prev, saving: false, error: e?.message || "Kunne ikke lagre" } : prev
      );
    }
  };

  const removeChild = async (child: GuestChild) => {
    if (!confirm("Slette barnet?")) return;
    try {
      const res = await fetch(`/api/activity-guest-children/${child.id}`, { method: "DELETE" });
      const data = await res.json().catch(() => null);
      if (!res.ok) throw new Error(data?.error || "Kunne ikke slette barn");
      await fetchGuests();
    } catch (e: any) {
      alert(e?.message || "Kunne ikke slette barnet.");
    }
  };

  const duplicateCount = useMemo(() => {
    const hidden = groups.reduce((sum, g) => sum + Math.max(0, g.count - 1), 0);
    return hidden;
  }, [groups]);

  return (
    <div className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold text-neutral-900">Gjester</h2>
          {duplicateCount > 0 ? (
            <p className="mt-1 text-xs text-neutral-600">
              Skjulte duplikater: <span className="font-semibold">{duplicateCount}</span> (du kan slette alle fra “Slett”)
            </p>
          ) : null}
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Søk på navn, telefon eller e-post"
            className="w-72 rounded-lg border border-neutral-300 bg-white px-3 py-2 text-sm text-neutral-900 placeholder:text-neutral-500 focus:outline-none focus:ring-2 focus:ring-red-600"
          />
          <button
            onClick={openNewForm}
            className="rounded-lg bg-red-600 px-3.5 py-2 text-sm font-semibold text-white hover:bg-red-700"
          >
            Ny gjest
          </button>
        </div>
      </div>

      {formOpen && (
        <div className="mt-4 rounded-xl border border-dashed border-red-200 bg-red-50/40 p-4">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold text-neutral-900">
              {editingGroup ? "Rediger gjest" : "Ny gjest"}
            </h3>
            <button onClick={closeForm} className="text-sm font-medium text-neutral-600 hover:text-neutral-900">
              Lukk
            </button>
          </div>

          {formError && <p className="mt-2 text-sm text-red-600">{formError}</p>}

          <div className="mt-3 grid gap-4 md:grid-cols-2">
            <label className="text-sm text-neutral-800">
              Fornavn
              <input
                value={formState.firstName}
                onChange={(e) => setFormState((p) => ({ ...p, firstName: e.target.value }))}
                className={INPUT_CLASSES}
              />
            </label>
            <label className="text-sm text-neutral-800">
              Etternavn
              <input
                value={formState.lastName}
                onChange={(e) => setFormState((p) => ({ ...p, lastName: e.target.value }))}
                className={INPUT_CLASSES}
              />
            </label>
            <label className="text-sm text-neutral-800">
              Telefon
              <input
                value={formState.phone}
                onChange={(e) => setFormState((p) => ({ ...p, phone: e.target.value }))}
                className={INPUT_CLASSES}
              />
            </label>
            <label className="text-sm text-neutral-800">
              E-post (valgfri)
              <input
                value={formState.email}
                onChange={(e) => setFormState((p) => ({ ...p, email: e.target.value }))}
                className={INPUT_CLASSES}
              />
            </label>
            <label className="text-sm text-neutral-800 md:col-span-2">
              <span className="mb-1 block">Nasjonalitet</span>
              <select
                value={formState.isNorwegian ? "true" : "false"}
                onChange={(e) => setFormState((p) => ({ ...p, isNorwegian: e.target.value === "true" }))}
                className={INPUT_CLASSES}
              >
                <option value="true">Norge</option>
                <option value="false">Annen nasjonalitet</option>
              </select>
            </label>
            <label className="text-sm text-neutral-800 md:col-span-2">
              Notater (vises kun når du åpner raden)
              <textarea
                rows={3}
                value={formState.notes}
                onChange={(e) => setFormState((p) => ({ ...p, notes: e.target.value }))}
                className={TEXTAREA_CLASSES}
              />
            </label>
          </div>

          <div className="mt-4 flex items-center gap-2">
            <button
              onClick={submitForm}
              disabled={formSaving}
              className="rounded-lg bg-red-600 px-3.5 py-2 text-sm font-semibold text-white hover:bg-red-700 disabled:opacity-60"
            >
              {formSaving ? "Lagrer…" : "Lagre"}
            </button>
            <button
              onClick={closeForm}
              type="button"
              className="rounded-lg px-3.5 py-2 text-sm font-semibold text-neutral-900 ring-1 ring-neutral-300 hover:bg-neutral-900 hover:text-white"
            >
              Avbryt
            </button>
          </div>
        </div>
      )}

      <div className="mt-5 overflow-x-auto">
        {error ? (
          <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700">
            {error}
          </div>
        ) : loading ? (
          <div className="text-sm text-neutral-600">Laster gjester…</div>
        ) : filteredAndSorted.length === 0 ? (
          <div className="rounded-lg border border-neutral-200 bg-neutral-50 p-4 text-sm text-neutral-700">
            Ingen gjester registrert enda.
          </div>
        ) : (
          <table className="min-w-full divide-y divide-neutral-200 text-left text-sm">
            <thead>
              <tr className="text-xs uppercase tracking-wide text-neutral-500">
                <th className="cursor-pointer px-3 py-2" onClick={() => toggleSort("name")}>
                  Navn
                </th>
                <th className="cursor-pointer px-3 py-2" onClick={() => toggleSort("phone")}>
                  Telefon
                </th>
                <th className="cursor-pointer px-3 py-2" onClick={() => toggleSort("email")}>
                  E-post
                </th>
                <th className="cursor-pointer px-3 py-2" onClick={() => toggleSort("children")}>
                  Barn
                </th>
                <th className="cursor-pointer px-3 py-2" onClick={() => toggleSort("persons")}>
                  Personer
                </th>
                <th className="px-3 py-2">Notat</th>
                <th className="px-3 py-2 text-right">Handlinger</th>
              </tr>
            </thead>

            <tbody className="divide-y divide-neutral-200">
              {filteredAndSorted.map((group) => {
                const guest = group.primary;
                const n = normalizeGuestForDisplay(guest);
                const isExpanded = expandedKey === group.key;

                const notesHasContent = Boolean(String(guest.notes || "").trim());
                const hasDupes = group.allIds.length > 1;

                return (
                  <Fragment key={group.key}>
                    <tr className="align-top text-sm text-neutral-900">
                      <td className="px-3 py-3 font-medium text-neutral-900">
                        <div className="flex items-center gap-2">
                          <span>{n.displayName}</span>
                          {hasDupes ? (
                            <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-semibold text-amber-900">
                              Duplikat ×{group.allIds.length}
                            </span>
                          ) : null}
                        </div>
                      </td>
                      <td className="px-3 py-3 text-neutral-700">{n.displayPhone ? n.displayPhone : "—"}</td>
                      <td className="px-3 py-3 text-neutral-700">{n.displayEmail ? n.displayEmail : "—"}</td>
                      <td className="px-3 py-3 text-neutral-700">{guest.children?.length ?? 0}</td>
                      <td className="px-3 py-3 text-neutral-700">{personsCount(guest)}</td>
                      <td className="px-3 py-3 text-neutral-700">{notesHasContent ? "Ja" : "—"}</td>
                      <td className="px-3 py-3 text-right">
                        <div className="flex justify-end gap-2">
                          <button
                            onClick={() => setExpandedKey((p) => (p === group.key ? null : group.key))}
                            className="rounded-lg px-2.5 py-1 text-xs font-semibold text-neutral-900 ring-1 ring-neutral-300 hover:bg-neutral-900 hover:text-white"
                          >
                            {isExpanded ? "Lukk" : "Åpne"}
                          </button>
                          <button
                            onClick={() => openEditForm(group)}
                            className="rounded-lg px-2.5 py-1 text-xs font-semibold text-neutral-900 ring-1 ring-neutral-300 hover:bg-neutral-900 hover:text-white"
                          >
                            Rediger
                          </button>
                          <button
                            onClick={() => removeGroup(group)}
                            className="rounded-lg px-2.5 py-1 text-xs font-semibold text-red-700 ring-1 ring-red-200 hover:bg-red-50"
                          >
                            Slett
                          </button>
                        </div>
                      </td>
                    </tr>

                    {isExpanded && (
                      <tr>
                        <td colSpan={7} className="px-3 pb-4">
                          <div className="rounded-xl bg-neutral-50 p-4">
                            <div className="flex flex-wrap items-center justify-between gap-3">
                              <div>
                                <h4 className="text-sm font-semibold text-neutral-900">Detaljer</h4>
                                {hasDupes ? (
                                  <p className="mt-1 text-xs text-neutral-600">
                                    Denne raden representerer {group.allIds.length} like gjester. “Slett” sletter alle.
                                  </p>
                                ) : null}
                              </div>
                              <button
                                onClick={() => openChildForm(group)}
                                className="rounded-lg bg-white px-3 py-1.5 text-xs font-semibold text-neutral-900 ring-1 ring-neutral-300 hover:bg-neutral-100"
                              >
                                Legg til barn
                              </button>
                            </div>

                            {guest.children?.length ? (
                              <div className="mt-3 space-y-3">
                                {guest.children.map((child) => (
                                  <div key={child.id} className="rounded-lg border border-neutral-200 bg-white px-3 py-2">
                                    <div className="flex flex-wrap items-center justify-between gap-3">
                                      <div>
                                        <div className="text-sm font-medium text-neutral-900">
                                          {childSummary(child)}
                                        </div>
                                        <div className="text-xs text-neutral-600">
                                          {genderLabel(child.gender)}
                                          {child.notes ? ` · ${child.notes}` : ""}
                                        </div>
                                      </div>
                                      <div className="flex gap-2">
                                        <button
                                          onClick={() => openChildForm(group, child)}
                                          className="rounded-lg px-2.5 py-1 text-xs font-semibold text-neutral-900 ring-1 ring-neutral-300 hover:bg-neutral-900 hover:text-white"
                                        >
                                          Rediger
                                        </button>
                                        <button
                                          onClick={() => removeChild(child)}
                                          className="rounded-lg px-2.5 py-1 text-xs font-semibold text-red-700 ring-1 ring-red-200 hover:bg-red-50"
                                        >
                                          Slett
                                        </button>
                                      </div>
                                    </div>
                                  </div>
                                ))}
                              </div>
                            ) : (
                              <p className="mt-3 text-sm text-neutral-700">Ingen barn registrert.</p>
                            )}

                            {String(guest.notes || "").trim() ? (
                              <div className="mt-4 rounded-lg border border-neutral-200 bg-white p-3">
                                <div className="text-xs font-semibold text-neutral-700">Notat</div>
                                <div className="mt-1 whitespace-pre-wrap text-sm text-neutral-800">
                                  {guest.notes}
                                </div>
                              </div>
                            ) : null}

                            {childForm?.guestId === guest.id && (
                              <div className="mt-4 rounded-lg border border-dashed border-neutral-300 bg-white p-4">
                                <div className="flex items-center justify-between">
                                  <h5 className="text-sm font-semibold text-neutral-900">
                                    {childForm.child ? "Rediger barn" : "Nytt barn"}
                                  </h5>
                                  <button
                                    onClick={closeChildForm}
                                    className="text-xs font-medium text-neutral-600 hover:text-neutral-900"
                                  >
                                    Lukk
                                  </button>
                                </div>

                                {childForm.error && (
                                  <p className="mt-2 text-xs text-red-600">{childForm.error}</p>
                                )}

                                <div className="mt-3 grid gap-3 md:grid-cols-2">
                                  <label className="text-xs text-neutral-700">
                                    Navn (valgfritt)
                                    <input
                                      value={childForm.firstName}
                                      onChange={(e) =>
                                        setChildForm((prev) =>
                                          prev ? { ...prev, firstName: e.target.value } : prev
                                        )
                                      }
                                      className={INPUT_CLASSES}
                                    />
                                  </label>

                                  <label className="text-xs text-neutral-700">
                                    Alder
                                    <input
                                      value={childForm.age}
                                      onChange={(e) =>
                                        setChildForm((prev) =>
                                          prev ? { ...prev, age: e.target.value } : prev
                                        )
                                      }
                                      className={INPUT_CLASSES}
                                      type="number"
                                      min={0}
                                    />
                                  </label>

                                  <label className="text-xs text-neutral-700">
                                    Kjønn
                                    <select
                                      value={childForm.gender}
                                      onChange={(e) =>
                                        setChildForm((prev) =>
                                          prev ? { ...prev, gender: e.target.value } : prev
                                        )
                                      }
                                      className={INPUT_CLASSES}
                                    >
                                      <option value="">Velg</option>
                                      <option value="male">Gutt</option>
                                      <option value="female">Jente</option>
                                      <option value="other">Annet / ønsker ikke å oppgi</option>
                                    </select>
                                  </label>

                                  <label className="text-xs text-neutral-700 md:col-span-2">
                                    Notater
                                    <textarea
                                      rows={2}
                                      value={childForm.notes}
                                      onChange={(e) =>
                                        setChildForm((prev) =>
                                          prev ? { ...prev, notes: e.target.value } : prev
                                        )
                                      }
                                      className={TEXTAREA_CLASSES}
                                    />
                                  </label>
                                </div>

                                <div className="mt-3 flex items-center gap-2">
                                  <button
                                    onClick={submitChildForm}
                                    disabled={childForm.saving}
                                    className="rounded-lg bg-red-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-red-700 disabled:opacity-60"
                                  >
                                    {childForm.saving ? "Lagrer…" : "Lagre"}
                                  </button>
                                  <button
                                    onClick={closeChildForm}
                                    className="rounded-lg px-3 py-1.5 text-xs font-semibold text-neutral-900 ring-1 ring-neutral-300 hover:bg-neutral-900 hover:text-white"
                                  >
                                    Avbryt
                                  </button>
                                </div>
                              </div>
                            )}
                          </div>
                        </td>
                      </tr>
                    )}
                  </Fragment>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
