"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { createClientComponentClient } from "@/lib/supabase/browser";

type SessionRow = {
  id: string;
  activity_id: string;
  title: string;
  start_at: string;
  end_at: string | null;
  location: string | null;
  note: string | null;
};

type MemberRow = {
  id: string;
  first_name: string | null;
  last_name: string | null;
  email: string | null;
  name?: string | null;
  full_name?: string | null;
};

function S(v: any) {
  return String(v ?? "");
}

function fullName(m: MemberRow) {
  const fromFields = `${m.first_name ?? ""} ${m.last_name ?? ""}`.trim();
  const fromAlt = (m.full_name ?? m.name ?? "").trim();
  return (fromFields || fromAlt || m.email || "Uten navn").trim();
}

function fmtDateTimeNb(iso: string) {
  const d = new Date(iso);
  return Number.isNaN(+d) ? iso : d.toLocaleString("nb-NO");
}

function fmtTimeNb(iso: string) {
  const d = new Date(iso);
  return Number.isNaN(+d) ? "" : d.toLocaleTimeString("nb-NO");
}

function uniq(arr: string[]) {
  return Array.from(new Set(arr.map(String).filter(Boolean)));
}

export default function SessionPage() {
  const params = useParams();
  const supabase = createClientComponentClient();

  const sessionId = useMemo(() => {
    const raw = Array.isArray((params as any)?.id) ? (params as any).id[0] : (params as any)?.id;
    return raw ? String(raw) : "";
  }, [params]);

  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  const [session, setSession] = useState<SessionRow | null>(null);

  const [targetIds, setTargetIds] = useState<string[]>([]);
  const [targetMembers, setTargetMembers] = useState<MemberRow[]>([]);

  const [leaders, setLeaders] = useState<MemberRow[]>([]);
  const [participants, setParticipants] = useState<MemberRow[]>([]);

  useEffect(() => {
    let alive = true;

    (async () => {
      setLoading(true);
      setErr(null);

      try {
        // 1) Hent økt
        const sRes = await supabase
          .from("activity_sessions")
          .select("id, activity_id, title, start_at, end_at, location, note")
          .eq("id", sessionId)
          .single();

        if (sRes.error) throw sRes.error;

        const s = sRes.data as any;
        const row: SessionRow = {
          id: S(s.id),
          activity_id: S(s.activity_id),
          title: S(s.title || "Økt"),
          start_at: S(s.start_at),
          end_at: s.end_at ? S(s.end_at) : null,
          location: s.location ?? null,
          note: s.note ?? null,
        };

        if (!alive) return;
        setSession(row);

        // 2) Targets (hvem økten gjelder for)
        const tRes = await supabase
          .from("activity_session_targets")
          .select("member_id")
          .eq("session_id", sessionId);

        if (tRes.error) throw tRes.error;

        const tids = uniq((tRes.data ?? []).map((r: any) => S(r.member_id)));
        if (!alive) return;

        setTargetIds(tids);

        // 3) Hent medlem-info for targets (men aldri vis rå UUID hvis dette feiler)
        if (tids.length) {
          const mRes = await supabase
            .from("members")
            .select("id, first_name, last_name, email, name, full_name")
            .in("id", tids);

          if (!mRes.error && Array.isArray(mRes.data)) {
            const ms = (mRes.data as any[]).map((m) => ({
              id: S(m.id),
              first_name: m.first_name ?? null,
              last_name: m.last_name ?? null,
              email: m.email ?? null,
              name: m.name ?? null,
              full_name: m.full_name ?? null,
            })) as MemberRow[];

            // sorter pent
            ms.sort((a, b) => fullName(a).localeCompare(fullName(b), "nb"));
            if (!alive) return;
            setTargetMembers(ms);
          } else {
            // Hvis vi ikke får hentet, holder vi det tomt
            if (!alive) return;
            setTargetMembers([]);
          }
        } else {
          if (!alive) return;
          setTargetMembers([]);
        }

        // 4) Ledere / deltakere: 2-stegs (enrollments -> member_ids -> members)
        const eRes = await supabase
          .from("enrollments")
          .select("member_id, role")
          .eq("activity_id", row.activity_id);

        if (eRes.error) throw eRes.error;

        const enr = (eRes.data ?? []) as any[];
        const leaderIds = uniq(enr.filter((x) => x.role === "leader").map((x) => S(x.member_id)));
        const partIds = uniq(enr.filter((x) => x.role === "participant").map((x) => S(x.member_id)));
        const allIds = uniq([...leaderIds, ...partIds]);

        if (allIds.length) {
          const mmRes = await supabase
            .from("members")
            .select("id, first_name, last_name, email, name, full_name")
            .in("id", allIds);

          if (!mmRes.error && Array.isArray(mmRes.data)) {
            const allMembers: MemberRow[] = (mmRes.data as any[]).map((m) => ({
              id: S(m.id),
              first_name: m.first_name ?? null,
              last_name: m.last_name ?? null,
              email: m.email ?? null,
              name: m.name ?? null,
              full_name: m.full_name ?? null,
            }));

            const byId = new Map(allMembers.map((m) => [m.id, m]));
            const lead = leaderIds.map((id) => byId.get(id)).filter(Boolean) as MemberRow[];
            const part = partIds.map((id) => byId.get(id)).filter(Boolean) as MemberRow[];

            lead.sort((a, b) => fullName(a).localeCompare(fullName(b), "nb"));
            part.sort((a, b) => fullName(a).localeCompare(fullName(b), "nb"));

            if (!alive) return;
            setLeaders(lead);
            setParticipants(part);
          } else {
            if (!alive) return;
            setLeaders([]);
            setParticipants([]);
          }
        } else {
          if (!alive) return;
          setLeaders([]);
          setParticipants([]);
        }
      } catch (e: any) {
        if (!alive) return;
        setErr(String(e?.message ?? e));
      } finally {
        if (!alive) return;
        setLoading(false);
      }
    })();

    return () => {
      alive = false;
    };
  }, [sessionId, supabase]);

  if (loading) {
    return (
      <div className="mx-auto max-w-3xl px-4 py-8">
        <div className="rounded-2xl border border-neutral-200 bg-white p-5 shadow-sm">
          <div className="text-sm text-neutral-600">Laster økt…</div>
        </div>
      </div>
    );
  }

  if (err || !session) {
    return (
      <div className="mx-auto max-w-3xl px-4 py-8">
        <div className="rounded-2xl border border-red-200 bg-red-50 p-5 text-sm text-red-800">
          Kunne ikke åpne økt: {err || "Ukjent feil"}
        </div>
        <div className="mt-4">
          <Link
            href="/activities"
            className="rounded-lg px-3.5 py-2 text-sm font-semibold text-neutral-900 ring-1 ring-neutral-300 hover:bg-neutral-900 hover:text-white"
          >
            Tilbake
          </Link>
        </div>
      </div>
    );
  }

  const startLine = fmtDateTimeNb(session.start_at);
  const endTime = session.end_at ? fmtTimeNb(session.end_at) : "";
  const subtitle = `${startLine}${endTime ? ` – ${endTime}` : ""}${session.location ? ` · Sted: ${session.location}` : ""}`;

  // Pent målgruppe-tekst: aldri vis UUID-lista
  const targetCount = targetIds.length;
  const targetLabel =
    targetCount === 0
      ? "Alle påmeldte (standard)"
      : `${targetCount} valgt`;

  return (
    <div className="mx-auto max-w-3xl px-4 py-8">
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight text-black">{session.title}</h1>
          <p className="mt-1 text-sm text-neutral-600">{subtitle}</p>
        </div>

        <Link
          href={`/activities/${encodeURIComponent(session.activity_id)}`}
          className="rounded-lg px-3.5 py-2 text-sm font-semibold text-neutral-900 ring-1 ring-neutral-300 hover:bg-neutral-900 hover:text-white"
        >
          Tilbake til aktivitet
        </Link>
      </div>

      <div className="space-y-5 rounded-2xl border border-neutral-200 bg-white p-5 shadow-sm">
        {/* Notat */}
        <div>
          <div className="text-sm font-semibold text-neutral-900">Notat</div>
          {session.note ? (
            <p className="mt-2 whitespace-pre-wrap text-sm text-neutral-700">{session.note}</p>
          ) : (
            <p className="mt-2 text-sm text-neutral-500">Ingen notat.</p>
          )}
        </div>

        {/* Målgruppe */}
        <div className="rounded-xl border border-neutral-200 bg-neutral-50 p-4">
          <div className="text-sm font-semibold text-neutral-900">Målgruppe</div>
          <div className="mt-2 text-sm text-neutral-700">
            <span className="inline-flex items-center rounded-full border border-neutral-200 bg-white px-3 py-1 text-xs font-semibold text-neutral-800">
              {targetLabel}
            </span>
          </div>

          {/* Vis navn hvis vi klarer det, ellers ikke vis rå IDs */}
          {targetCount > 0 ? (
            targetMembers.length ? (
              <ul className="mt-3 list-disc pl-5 text-sm text-neutral-700">
                {targetMembers.map((m) => (
                  <li key={m.id}>{fullName(m)}</li>
                ))}
              </ul>
            ) : (
              <p className="mt-3 text-sm text-neutral-500">
                (Navn kunne ikke hentes akkurat nå – men målgruppen er lagret.)
              </p>
            )
          ) : null}
        </div>

        {/* Ledere / Deltakere */}
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="rounded-xl border border-neutral-200 bg-white p-4">
            <div className="text-sm font-semibold text-neutral-900">Ledere</div>
            <div className="mt-2 text-sm text-neutral-700">
              {leaders.length ? (
                <ul className="list-disc pl-5">
                  {leaders.map((m) => (
                    <li key={m.id}>{fullName(m)}</li>
                  ))}
                </ul>
              ) : (
                <div className="text-neutral-500">Ingen funnet.</div>
              )}
            </div>
          </div>

          <div className="rounded-xl border border-neutral-200 bg-white p-4">
            <div className="text-sm font-semibold text-neutral-900">Deltakere</div>
            <div className="mt-2 text-sm text-neutral-700">
              {participants.length ? (
                <ul className="list-disc pl-5">
                  {participants.map((m) => (
                    <li key={m.id}>{fullName(m)}</li>
                  ))}
                </ul>
              ) : (
                <div className="text-neutral-500">Ingen funnet.</div>
              )}
            </div>
          </div>
        </div>

        <div className="text-xs text-neutral-500">
          Økt-ID: <span className="font-mono">{session.id}</span>
        </div>
      </div>
    </div>
  );
}
