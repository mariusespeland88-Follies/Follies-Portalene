"use client";

import { useEffect, use State } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { createClientComponentClient } from "@/lib/supabase/browser";
import UploadProfilePicture from "../../../components/UploadProfilePicture";

/* ------------------------------- Typer ------------------------------- */
type Member = {
  id: string;
  first_name?: string | null;
  last_name?: string | null;
  full_name?: string | null;
  name?: string | null;
  email?: string | null;
  phone?: string | null;
  address?: string | null;
  postal_code?: string | null;
  city?: string | null;
  dob?: string | null;          // YYYY-MM-DD
  start_date?: string | null;   // YYYY-MM-DD
  start_year?: number | null;
  guardian_name?: string | null;
  guardian_phone?: string | null;
  guardian_email?: string | null;
  allergies?: string | null;
  medical_info?: string | null;
  internal_notes?: string | null;
  avatar_url?: string | null;
  archived?: boolean | null;
};
type Enrollment = {
  id: string;
  activity_id: string;
  role: "participant" | "leader";
  activity: { id: string; name: string; type: string; archived: boolean } | null;
};

/* ------------------------------- Utils ------------------------------- */
function safe(v?: string | number | null, fb = "—") {
  if (v === undefined || v === null) return fb;
  const s = String(v).trim();
  return s ? s : fb;
}
function titleCase(s: string) {
  return s
    .split(/\s+/)
    .map((w) => (w ? w[0].toUpperCase() + w.slice(1).toLowerCase() : w))
    .join(" ");
}
function fullNameOf(m: Member): string {
  const fromFields = `${m.first_name || ""} ${m.last_name || ""}`.trim();
  const fromAlt = m.full_name || m.name || "";
  const name = fromFields || fromAlt || "";
  return titleCase(name) || "Uten navn";
}
function fmtDateISO(iso?: string | null) {
  if (!iso) return "—";
  const d = new Date(iso);
  return Number.isNaN(+d)
    ? "—"
    : d.toLocaleDateString("nb-NO", { year: "numeric", month: "2-digit", day: "2-digit" });
}
function calcAge(dob?: string | null): string {
  if (!dob) return "—";
  try {
    const d = new Date(dob);
    const now = new Date();
    let y = now.getFullYear() - d.getFullYear();
    let m = now.getMonth() - d.getMonth();
    if (m < 0 || (m === 0 && now.getDate() < d.getDate())) { y--; m += 12; }
    return y < 0 ? "—" : `${y} år${m > 0 ? `, ${m} mnd` : ""}`;
  } catch { return "—"; }
}
function calcTenure(start_date?: string | null, start_year?: number | null) {
  let since = "—", span = "—";
  try {
    let start: Date | null = null;
    if (start_date) { start = new Date(start_date); since = fmtDateISO(start_date); }
    else if (start_year && Number.isFinite(start_year)) { start = new Date(Number(start_year), 0, 1); since = String(start_year); }
    if (start) {
      const now = new Date();
      let y = now.getFullYear() - start.getFullYear();
      let m = now.getMonth() - start.getMonth();
      if (m < 0) { y--; m += 12; }
      span = `${y} år${m > 0 ? `, ${m} mnd` : ""}`;
    }
  } catch {}
  return { since, span };
}

/* ------------------------------ Komponent ----------------------------- */
export default function MemberProfilePage() {
  const supabase = createClientComponentClient();
  const { id: memberId } = useParams() as { id: string };

  const [member, setMember] = useState<Member | null>(null);
  const [enrollments, setEnrollments] = useState<Enrollment[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyArchive, setBusyArchive] = useState(false);
  const [banner, setBanner] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    (async () => {
      setLoading(true);
      try {
        // Medlem (DB-first)
        const { data: m } = await supabase
          .from("members")
          .select("*")
          .eq("id", memberId)
          .maybeSingle();
        if (!alive) return;
        if (m) setMember(m as Member);
        else {
          // Fallback LS
          try {
            const raw = localStorage.getItem("follies.members.v1");
            if (raw) {
              const arr = JSON.parse(raw) as Member[];
              const hit = arr.find((mm) => String(mm.id) === String(memberId));
              if (hit) setMember(hit);
            }
          } catch {}
        }

        // Enrollments + activity (DB-first)
        const { data: enr } = await supabase
          .from("enrollments")
          .select("id, activity_id, role, activity:activities(id,name,type,archived)")
          .eq("member_id", memberId);

        if (enr) {
          type RawEnrollment = {
            id: string;
            activity_id: string;
            role: "participant" | "leader";
            activity:
              | {
                  id: string;
                  name: string;
                  type: string;
                  archived: boolean;
                }[]
              | null;
          };

          const rows = enr as unknown as RawEnrollment[];

          const normalized: Enrollment[] = rows.map((row) => ({
            id: row.id,
            activity_id: row.activity_id,
            role: row.role,
            activity:
              row.activity && row.activity.length > 0 ? row.activity[0] : null,
          }));

          if (alive) {
            setEnrollments(normalized);
          }
        }
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => { alive = false; };
  }, [memberId, supabase]);

  /* ------- Arkiver: DB-first med LS fallback ------- */
  async function handleArchive() {
    if (!member) return;
    if (member.archived) return;
    if (!confirm("Vil du arkivere dette medlemmet?")) return;

    setBusyArchive(true);
    try {
      // forsøk DB
      const { data: sess } = await supabase.auth.getSession();
      if (sess?.session) {
        const { error } = await supabase
          .from("members")
          .update({ archived: true })
          .eq("id", member.id);
        if (error) throw error;
      }
      // uansett: speil til LS
      try {
        const raw = localStorage.getItem("follies.members.v1");
        const list = raw ? (JSON.parse(raw) as Member[]) : [];
        const idx = list.findIndex((m) => String(m.id) === String(member.id));
        if (idx >= 0) list[idx] = { ...list[idx], archived: true };
        else list.unshift({ ...member, archived: true });
        localStorage.setItem("follies.members.v1", JSON.stringify(list));
        localStorage.setItem("follies.members", JSON.stringify(list));
      } catch {}
      setMember((m) => (m ? { ...m, archived: true } : m));
      setBanner("Medlemmet er arkivert.");
      setTimeout(() => setBanner(null), 2500);
    } catch (e: any) {
      alert(e?.message || "Kunne ikke arkivere medlemmet.");
    } finally {
      setBusyArchive(false);
    }
  }

  if (loading) return <main className="p-6 text-neutral-900">Laster medlem…</main>;
  if (!member)  return <main className="p-6 text-neutral-900">Fant ikke medlem.</main>;

  const name = fullNameOf(member);
  const ageLabel = calcAge(member.dob);
  const tenure = calcTenure(member.start_date, member.start_year);
  const activeActs = enrollments.filter((e) => e.activity && !e.activity.archived);
  const pastShows  = enrollments.filter((e) => e.activity && e.activity.type === "forestilling" && e.activity.archived);

  const hasEmail = !!(member.email && String(member.email).trim());
  const hasPhone = !!(member.phone && String(member.phone).trim());

  return (
    <main className="mx-auto max-w-7xl px-4 py-8 text-neutral-900 space-y-6">
      {/* Banner */}
      {banner ? (
        <div className="rounded-lg bg-green-50 text-green-900 ring-1 ring-green-200 px-4 py-2 text-sm">
          {banner}
        </div>
      ) : null}

      {/* HERO – premium look */}
      <section className="relative overflow-hidden rounded-3xl ring-1 ring-black/10 shadow-sm">
        <div className="absolute inset-0 bg-gradient-to-r from-black via-red-800 to-red-600" />
        {/* Arkivert bånd */}
        {member.archived ? (
          <div className="absolute right-4 top-4 rounded-full bg-white/20 px-3 py-1 text-xs font-semibold text-white ring-1 ring-white/30">
            Arkivert
          </div>
        ) : null}

        <div className="relative grid gap-6 p-6 md:grid-cols-[auto,1fr] md:p-8">
          {/* Avatar kort */}
          <div className="rounded-2xl bg-white/10 p-2 ring-1 ring-white/20 backdrop-blur-sm w-[9rem] h-[9rem]">
            <div className="h-full w-full overflow-hidden rounded-xl ring-1 ring-white/30 bg-white/10">
              <UploadProfilePicture memberId={member.id} value={member.avatar_url ?? null} />
            </div>
          </div>

          {/* Navn + stat-badges + actions */}
          <div className="flex flex-col justify-center">
            <h1 className="text-3xl md:text-4xl font-semibold tracking-tight text-white">{name}</h1>

            <div className="mt-4 flex flex-wrap gap-3">
              <StatBadge label="Fødselsdato" value={fmtDateISO(member.dob)} />
              <StatBadge label="Alder" value={ageLabel} />
              <StatBadge label="Medlem siden" value={tenure.since} />
              <StatBadge label="Medlemstid" value={tenure.span} />
            </div>

            {/* Actions */}
            <div className="mt-5 flex flex-wrap gap-2">
              {/* Rediger */}
              <Link
                href={`/members/${member.id}/edit`}
                className="inline-flex items-center gap-2 rounded-lg bg-white px-3.5 py-2 text-sm font-semibold text-neutral-900 ring-1 ring-white/40 hover:bg-neutral-100"
                title="Rediger medlem"
              >
                <IconEdit />
                Rediger
              </Link>

              {/* Follies Messenger – NY hovedknapp her */}
              <Link
                href={`/messages?memberId=${encodeURIComponent(member.id)}`}
                className="inline-flex items-center gap-2 rounded-lg bg-red-600 px-3.5 py-2 text-sm font-semibold text-white ring-1 ring-white/40 hover:bg-red-700"
                title="Åpne Follies Messenger med dette medlemmet"
              >
                <IconChat />
                Messenger
              </Link>

              {/* Mail (tidligere "Send melding" – nå kun e-post) */}
              <a
                href={hasEmail ? `mailto:${member.email}?subject=Follies` : undefined}
                onClick={(e) => { if (!hasEmail) e.preventDefault(); }}
                className={`inline-flex items-center gap-2 rounded-lg px-3.5 py-2 text-sm font-semibold ring-1 ${
                  hasEmail
                    ? "bg-white/15 text-white ring-white/40 hover:bg-white/25"
                    : "bg-white/20 text-white/60 ring-white/20 cursor-not-allowed"
                }`}
                title={hasEmail ? `Send e-post til ${member.email}` : "Ingen e-post registrert"}
              >
                <IconMail />
                Mail
              </a>

              {/* Ring (tel) */}
              <a
                href={hasPhone ? `tel:${member.phone}` : undefined}
                onClick={(e) => { if (!hasPhone) e.preventDefault(); }}
                className={`inline-flex items-center gap-2 rounded-lg px-3.5 py-2 text-sm font-semibold ring-1 ${
                  hasPhone
                    ? "bg-white/15 text-white ring-white/40 hover:bg-white/25"
                    : "bg-white/20 text-white/60 ring-white/20 cursor-not-allowed"
                }`}
                title={hasPhone ? `Ring ${member.phone}` : "Ingen telefon registrert"}
              >
                <IconPhone />
                Ring
              </a>

              {/* Arkiver */}
              <button
                onClick={handleArchive}
                disabled={member.archived || busyArchive}
                className={`inline-flex items-center gap-2 rounded-lg px-3.5 py-2 text-sm font-semibold ring-1 ${
                  member.archived
                    ? "bg-white/20 text-white/60 ring-white/20 cursor-not-allowed"
                    : "bg-white/15 text-white ring-white/40 hover:bg-white/25"
                }`}
                title={member.archived ? "Allerede arkivert" : "Arkiver medlem"}
              >
                <IconArchive />
                {busyArchive ? "Arkiverer…" : member.archived ? "Arkivert" : "Arkiver"}
              </button>
            </div>
          </div>
        </div>
      </section>

      {/* GRID – venstre info, høyre aktiviteter/historikk */}
      <div className="grid gap-6 lg:grid-cols-3">
        {/* VENSTRE KOLONNE */}
        <div className="space-y-6 lg:col-span-2">
          {/* Kontakt */}
          <Card title="Kontakt">
            <InfoGrid
              rows={[
                ["E-post", safe(member.email)],
                ["Telefon", safe(member.phone)],
                ["Adresse", member.address ? `${member.address}${member.postal_code ? `, ${member.postal_code}` : ""}${member.city ? ` ${member.city}` : ""}` : "—"],
              ]}
            />
          </Card>

          {/* Foresatt */}
          {(member.guardian_name || member.guardian_phone || member.guardian_email) && (
            <Card title="Foresatt" tone="muted">
              <InfoGrid
                cols={3}
                rows={[
                  ["Navn", safe(member.guardian_name)],
                  ["Telefon", safe(member.guardian_phone)],
                  ["E-post", safe(member.guardian_email)],
                ]}
              />
            </Card>
          )}

          {/* Helse */}
          {(member.allergies || member.medical_info) && (
            <Card title="Helse">
              <InfoGrid
                rows={[
                  ["Allergier", safe(member.allergies)],
                  ["Medisinsk info", safe(member.medical_info)],
                ]}
              />
            </Card>
          )}

          {/* Interne notater */}
          {member.internal_notes && (
            <Card title="Interne notater">
              <p className="text-sm text-neutral-800 whitespace-pre-line">{member.internal_notes}</p>
            </Card>
          )}
        </div>

        {/* HØYRE KOLONNE */}
        <div className="space-y-6">
          {/* Aktiviteter (aktive) */}
          <Card title={`Aktiviteter (aktive)`} badge={String(activeActs.length)}>
            {activeActs.length === 0 ? (
              <p className="text-neutral-700">Ingen aktive aktiviteter.</p>
            ) : (
              <ul className="divide-y divide-neutral-200">
                {activeActs.map((e) => (
                  <li key={e.id} className="py-3 flex items-center justify-between gap-3">
                    <div className="min-w-0">
                      <div className="font-medium text-neutral-900 truncate">{e.activity?.name || "Ukjent aktivitet"}</div>
                      <div className="mt-0.5 text-xs text-neutral-600">
                        Rolle: <span className={`inline-flex items-center rounded-full px-2 py-0.5 ring-1 text-[11px] ${
                          e.role === "leader"
                            ? "bg-red-50 text-red-800 ring-red-200"
                            : "bg-neutral-100 text-neutral-800 ring-neutral-300"
                        }`}>
                          {e.role === "leader" ? "Leder" : "Deltaker"}
                        </span>
                      </div>
                    </div>
                    {e.activity?.id ? (
                      <Link
                        href={`/activities/${e.activity.id}`}
                        className="rounded-md bg-white px-3 py-1.5 text-sm font-semibold text-neutral-900 ring-1 ring-neutral-300 hover:bg-neutral-100"
                      >
                        Åpne
                      </Link>
                    ) : null}
                  </li>
                ))}
              </ul>
            )}
          </Card>

          {/* Historikk – forestillinger */}
          <Card title="Historikk – forestillinger" tone="muted" badge={String(pastShows.length)}>
            {pastShows.length === 0 ? (
              <p className="text-neutral-900">Ingen tidligere forestillinger registrert.</p>
            ) : (
              <ul className="space-y-3">
                {pastShows.map((e) => (
                  <li key={e.id} className="rounded-xl border border-neutral-200 p-3 flex items-center justify-between gap-3">
                    <div className="min-w-0">
                      <div className="font-medium text-neutral-900 truncate">{e.activity?.name || "Ukjent forestilling"}</div>
                      <div className="mt-0.5 text-xs text-neutral-700">
                        Rolle: {e.role === "leader" ? "Leder" : "Deltaker"} · Arkivert
                      </div>
                    </div>
                    {e.activity?.id ? (
                      <Link
                        href={`/activities/${e.activity.id}`}
                        className="rounded-md bg-white px-3 py-1.5 text-sm font-semibold text-neutral-900 ring-1 ring-neutral-300 hover:bg-neutral-100"
                      >
                        Åpne
                      </Link>
                    ) : null}
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </div>
      </div>
    </main>
  );
}

/* ------------------------- Små byggesteiner ------------------------- */
function StatBadge({ label, value }: { label: string; value: string }) {
  return (
    <span className="inline-flex items-center gap-2 rounded-full bg-white/10 px-3 py-1.5 text-sm font-semibold text-white ring-1 ring-white/25">
      <IconClock />
      <span className="opacity-80">{label}:</span>
      <span className="opacity-100">{value}</span>
    </span>
  );
}

function Card({
  title,
  children,
  badge,
  tone = "default",
}: {
  title: string;
  children: React.ReactNode;
  badge?: string;
  tone?: "default" | "muted";
}) {
  const cls =
    tone === "muted"
      ? "rounded-2xl border border-indigo-100 bg-indigo-50 p-6 shadow-sm"
      : "rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm";
  return (
    <section className={cls}>
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-semibold text-neutral-900">{title}</h2>
        {badge ? (
          <span className="inline-flex items-center rounded-full bg-black/85 px-2.5 py-0.5 text-xs font-semibold text-white">
            {badge}
          </span>
        ) : null}
      </div>
      <div className="mt-3">{children}</div>
    </section>
  );
}

function InfoGrid({ rows, cols = 2 }: { rows: [string, string][]; cols?: 1 | 2 | 3 }) {
  const grid = cols === 3 ? "md:grid-cols-3" : cols === 1 ? "md:grid-cols-1" : "md:grid-cols-2";
  return (
    <div className={`grid gap-3 ${grid}`}>
      {rows.map(([label, value], i) => (
        <div key={i}>
          <div className="text-sm text-neutral-600">{label}</div>
          <div className="font-medium break-words">{value}</div>
        </div>
      ))}
    </div>
  );
}

/* ------------------------------ Ikoner ------------------------------ */
function IconMail() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" className="fill-current" aria-hidden>
      <path d="M20 4H4a2 2 0 00-2 2v1.2l10 5.8 10-5.8V6a2 2 0 00-2-2zm0 6.3l-8.6 5a1 1 0 01-1 0L4 10.3V18a2 2 0 002 2h12a2 2 0 002-2v-7.7z"/>
    </svg>
  );
}
function IconPhone() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" className="fill-current" aria-hidden>
      <path d="M6.6 10.8a15.05 15.05 0 006.6 6.6l2.2-2.2a1 1 0 011.1-.2c1.2.5 2.6.8 4 .8a1 1 0 011 1V20a1 1 0 01-1 1C12.4 21 3 11.6 3 1a1 1 0 011-1h3.2a1 1 0 011 1c0 1.4.3 2.8.8 4a1 1 0 01-.2 1.1l-2.2 2.2z"/>
    </svg>
  );
}
function IconEdit() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" className="fill-current" aria-hidden>
      <path d="M3 17.25V21h3.75l11-11.03-3.75-3.75L3 17.25zM20.71 7.04a1.004 1.004 0 000-1.42l-2.34-2.34a1.004 1.004 0 00-1.42 0l-1.83 1.83 3.75 3.75 1.84-1.82z"/>
    </svg>
  );
}
function IconArchive() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" className="fill-current" aria-hidden>
      <path d="M20.54 5.23L19.15 3.5A2 2 0 0017.57 3H6.43a2 2 0 00-1.58.5L3.46 5.23A2 2 0 003 6.57V19a2 2 0 002 2h14a2 2 0 002-2V6.57a2 2 0 00-.46-1.34zM6.24 5h11.52l.81 1H5.43l.81-1zM19 19H5V8h14v11zM9 12h6v2H9v-2z"/>
    </svg>
  );
}
function IconClock() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" className="fill-current" aria-hidden>
      <path d="M12 2a10 10 0 100 20 10 10 0 000-20zm1 5v6h5v2h-7V7h2z" />
    </svg>
  );
}
function IconChat() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" className="fill-current" aria-hidden>
      <path d="M4 4h16a2 2 0 012 2v8a2 2 0 01-2 2h-5.6l-3.2 3.2a1 1 0 01-1.7-.7V16H4a2 2 0 01-2-2V6a2 2 0 012-2zm0 2v8h7v3l2.5-2.5.3-.5H20V6H4z" />
    </svg>
  );
}
