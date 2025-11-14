"use client";

import { useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { createClientComponentClient } from "@supabase/auth-helpers-nextjs";

type AnyObj = Record<string, any>;

type Role = "none" | "participant" | "leader";

type Member = {
  id: string;
  first_name: string | null;
  last_name: string | null;
  email: string | null;
};

type Activity = {
  id: string;
  name: string;
  type: string | null;
  archived?: boolean | null;
};

type Enrollment = {
  activity_id: string;
  role: "participant" | "leader" | null;
};

const labelForType = (t?: string | null) => {
  const v = String(t ?? "").toLowerCase();
  if (v.includes("forest")) return "Forestilling";
  if (v.includes("event") || v.includes("arrangement")) return "Event";
  if (v.includes("offer") || v.includes("tilbud")) return "Tilbud";
  if (v === "forestilling") return "Forestilling";
  if (v === "event") return "Event";
  if (v === "tilbud") return "Tilbud";
  return "Tilbud";
};

export default function MemberEditPage() {
  const params = useParams();
  const router = useRouter();
  const supabase = createClientComponentClient();

  const id =
    Array.isArray(params?.id) ? params.id[0] : (params?.id as string | undefined);

  const [member, setMember] = useState<Member | null>(null);
  const [activities, setActivities] = useState<Activity[]>([]);
  const [selectedRoles, setSelectedRoles] = useState<Record<string, Role>>({}); // activityId -> role

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [saveMsg, setSaveMsg] = useState<string | null>(null);

  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [email, setEmail] = useState("");

  useEffect(() => {
    let alive = true;
    (async () => {
      if (!id) {
        setErr("Mangler medlems-ID i URLen.");
        setLoading(false);
        return;
      }

      try {
        setLoading(true);
        setErr(null);

        const [mRes, enrRes, actRes] = await Promise.all([
          supabase
            .from("members")
            .select("id, first_name, last_name, email")
            .eq("id", id)
            .maybeSingle(),
          supabase
            .from("enrollments")
            .select("activity_id, role")
            .eq("member_id", id),
          supabase
            .from("activities")
            .select("id, name, type, archived")
            .order("name", { ascending: true }),
        ]);

        if (!alive) return;

        if (mRes.error) {
          console.error(mRes.error);
          setErr("Kunne ikke hente medlem fra databasen.");
          setLoading(false);
          return;
        }
        if (!mRes.data) {
          setErr("Fant ikke medlemmet.");
          setLoading(false);
          return;
        }

        const memberRow = mRes.data as Member;
        setMember(memberRow);
        setFirstName(memberRow.first_name ?? "");
        setLastName(memberRow.last_name ?? "");
        setEmail(memberRow.email ?? "");

        if (actRes.error) {
          console.error(actRes.error);
          setErr("Kunne ikke hente aktiviteter.");
          setLoading(false);
          return;
        }

        setActivities((actRes.data ?? []) as Activity[]);

        if (enrRes.error) {
          console.error(enrRes.error);
          // Ikke fatal – bare ingen enrollments
        }

        const existing = (enrRes.data ?? []) as Enrollment[];
        const roleMap: Record<string, Role> = {};
        for (const r of existing) {
          const activityId = String(r.activity_id);
          if (!activityId) continue;
          if (r.role === "leader") roleMap[activityId] = "leader";
          else if (r.role === "participant") roleMap[activityId] = "participant";
          else roleMap[activityId] = "none";
        }
        setSelectedRoles(roleMap);

        setLoading(false);
      } catch (e) {
        console.error(e);
        if (alive) {
          setErr("Noe gikk galt ved innlasting av medlemmet.");
          setLoading(false);
        }
      }
    })();

    return () => {
      alive = false;
    };
  }, [id, supabase]);

  const handleChangeRole = (activityId: string, role: Role) => {
    setSelectedRoles((prev) => ({
      ...prev,
      [activityId]: role,
    }));
  };

  const canSave = useMemo(() => {
    if (!member) return false;
    if (!firstName.trim() && !lastName.trim()) return false;
    return true;
  }, [member, firstName, lastName]);

  const handleSave = async () => {
    if (!id || !member) return;
    if (!canSave) {
      alert("Fyll inn minst fornavn eller etternavn.");
      return;
    }

    try {
      setSaving(true);
      setErr(null);
      setSaveMsg(null);

      // 1) Oppdater medlem
      const { error: mErr } = await supabase
        .from("members")
        .update({
          first_name: firstName.trim() || null,
          last_name: lastName.trim() || null,
          email: email.trim() || null,
        })
        .eq("id", id);

      if (mErr) {
        console.error(mErr);
        throw new Error("Kunne ikke oppdatere medlemmet.");
      }

      // 2) Hent eksisterende enrollments på nytt for å sammenligne
      const { data: enrData, error: enrErr } = await supabase
        .from("enrollments")
        .select("activity_id, role")
        .eq("member_id", id);

      if (enrErr) {
        console.error(enrErr);
        throw new Error("Kunne ikke hente eksisterende roller.");
      }

      const current: Record<string, Role> = {};
      for (const r of (enrData ?? []) as Enrollment[]) {
        const aid = String(r.activity_id);
        if (!aid) continue;
        if (r.role === "leader") current[aid] = "leader";
        else if (r.role === "participant") current[aid] = "participant";
        else current[aid] = "none";
      }

      // 3) Sammenligne valgt rolle vs dagens, og gjøre nødvendige endringer
      for (const act of activities) {
        const aid = String(act.id);
        const desired: Role = selectedRoles[aid] ?? "none";
        const existing: Role = current[aid] ?? "none";

        if (desired === existing) continue;

        if (desired === "none") {
          // Slett enrollment
          const { error } = await supabase
            .from("enrollments")
            .delete()
            .eq("member_id", id)
            .eq("activity_id", aid);
          if (error) {
            console.error(error);
            throw new Error(
              `Kunne ikke fjerne rolle for aktivitet "${act.name}".`
            );
          }
        } else {
          // Upsert enrollment
          const { error } = await supabase
            .from("enrollments")
            .upsert(
              {
                member_id: id,
                activity_id: aid,
                role: desired,
              },
              {
                onConflict: "member_id,activity_id",
              }
            );
          if (error) {
            console.error(error);
            throw new Error(
              `Kunne ikke sette rolle "${desired}" for aktivitet "${act.name}".`
            );
          }
        }
      }

      setSaveMsg("Endringer lagret.");
    } catch (e: any) {
      console.error(e);
      setErr(e?.message || "Noe gikk galt ved lagring.");
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <main className="px-4 py-6 text-neutral-900">
        Laster medlem…
      </main>
    );
  }

  if (err && !member) {
    return (
      <main className="px-4 py-6 text-neutral-900">
        <div className="text-red-600 mb-3 font-semibold">Feil</div>
        <div className="text-red-700 text-sm mb-4">{err}</div>
        <button
          onClick={() => router.push("/members")}
          className="rounded-lg bg-red-600 hover:bg-red-700 px-4 py-2 text-white text-sm font-semibold"
        >
          Tilbake til medlemmer
        </button>
      </main>
    );
  }

  if (!member) {
    return (
      <main className="px-4 py-6 text-neutral-900">
        Fant ikke medlemmet.
      </main>
    );
  }

  const fullName = `${firstName || ""} ${lastName || ""}`.trim() || "Uten navn";

  return (
    <main className="mx-auto max-w-5xl px-4 py-8 text-neutral-900">
      {/* Topp */}
      <div className="mb-6 flex items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">
            Rediger medlem
          </h1>
          <p className="mt-1 text-sm text-neutral-600">
            {fullName} ({member.email || "ingen e-post"})
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Link
            href="/members"
            className="rounded-lg bg-white px-3.5 py-2 text-sm font-semibold text-neutral-900 ring-1 ring-neutral-300 hover:bg-neutral-100"
          >
            Til medlemsliste
          </Link>
          <button
            onClick={handleSave}
            disabled={!canSave || saving}
            className="rounded-lg bg-red-600 px-4 py-2 text-sm font-semibold text-white hover:bg-red-700 disabled:opacity-60"
          >
            {saving ? "Lagrer…" : "Lagre endringer"}
          </button>
        </div>
      </div>

      {/* Feil / OK-melding */}
      {(err || saveMsg) && (
        <div className="mb-4">
          {err && (
            <div className="mb-2 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
              {err}
            </div>
          )}
          {saveMsg && !err && (
            <div className="rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-700">
              {saveMsg}
            </div>
          )}
        </div>
      )}

      <div className="grid gap-6 lg:grid-cols-3">
        {/* Venstre: medlem-info */}
        <section className="lg:col-span-1 space-y-4">
          <div className="rounded-2xl bg-white p-5 shadow-sm ring-1 ring-black/5">
            <h2 className="text-sm font-semibold text-neutral-900">
              Grunnleggende info
            </h2>
            <div className="mt-3 space-y-3 text-sm">
              <div>
                <label className="block text-xs font-medium text-neutral-600">
                  Fornavn
                </label>
                <input
                  className="mt-1 w-full rounded-md border border-neutral-300 px-2 py-1.5 text-sm text-neutral-900 focus:border-red-500 focus:outline-none focus:ring-1 focus:ring-red-500"
                  value={firstName}
                  onChange={(e) => setFirstName(e.target.value)}
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-neutral-600">
                  Etternavn
                </label>
                <input
                  className="mt-1 w-full rounded-md border border-neutral-300 px-2 py-1.5 text-sm text-neutral-900 focus:border-red-500 focus:outline-none focus:ring-1 focus:ring-red-500"
                  value={lastName}
                  onChange={(e) => setLastName(e.target.value)}
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-neutral-600">
                  E-post
                </label>
                <input
                  type="email"
                  className="mt-1 w-full rounded-md border border-neutral-300 px-2 py-1.5 text-sm text-neutral-900 focus:border-red-500 focus:outline-none focus:ring-1 focus:ring-red-500"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="epost@example.no"
                />
              </div>
            </div>
          </div>
        </section>

        {/* Høyre: aktivitetsroller */}
        <section className="lg:col-span-2">
          <div className="rounded-2xl bg-white p-5 shadow-sm ring-1 ring-black/5">
            <h2 className="text-sm font-semibold text-neutral-900">
              Roller per aktivitet
            </h2>
            <p className="mt-1 text-xs text-neutral-600">
              Velg om medlemmet skal være deltaker eller leder på de ulike
              aktivitetene. Velg &quot;Ingen&quot; for å fjerne medlemmet fra en aktivitet.
            </p>

            {activities.length === 0 ? (
              <p className="mt-4 text-sm text-neutral-700">
                Ingen aktiviteter er registrert ennå.
              </p>
            ) : (
              <div className="mt-4 space-y-3">
                {activities.map((act) => {
                  const aid = String(act.id);
                  const currentRole: Role = selectedRoles[aid] ?? "none";
                  const typeLabel = labelForType(act.type);
                  const archived = !!act.archived;

                  return (
                    <div
                      key={aid}
                      className={`flex items-center justify-between gap-3 rounded-xl border px-3 py-2 text-sm ${
                        archived
                          ? "border-neutral-200 bg-neutral-50"
                          : "border-neutral-200 bg-white"
                      }`}
                    >
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <p className="font-medium text-neutral-900 truncate">
                            {act.name}
                          </p>
                          <span className="inline-flex items-center rounded-full bg-black/80 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-white">
                            {typeLabel}
                          </span>
                          {archived && (
                            <span className="inline-flex items-center rounded-full bg-neutral-200 px-2 py-0.5 text-[10px] font-medium text-neutral-700">
                              Arkivert
                            </span>
                          )}
                        </div>
                      </div>
                      <div className="flex flex-wrap items-center gap-2 text-xs">
                        <RolePill
                          label="Ingen"
                          active={currentRole === "none"}
                          onClick={() => handleChangeRole(aid, "none")}
                        />
                        <RolePill
                          label="Deltaker"
                          active={currentRole === "participant"}
                          onClick={() => handleChangeRole(aid, "participant")}
                        />
                        <RolePill
                          label="Leder"
                          active={currentRole === "leader"}
                          onClick={() => handleChangeRole(aid, "leader")}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </section>
      </div>
    </main>
  );
}

/* Småkomponent */

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
          ? "rounded-full bg-red-600 px-3 py-1 text-xs font-semibold text-white"
          : "rounded-full bg-white px-3 py-1 text-xs font-medium text-neutral-800 ring-1 ring-neutral-300 hover:bg-neutral-100"
      }
    >
      {label}
    </button>
  );
}
