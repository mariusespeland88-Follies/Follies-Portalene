"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { createClientComponentClient } from "@/lib/supabase/browser";

type AnyObj = Record<string, any>;

type SessionRow = {
  id: string;
  activity_id: string;
  title: string;
  start_at: string;
  end_at: string | null;
  location: string | null;
  note: string | null;
};

type Member = {
  id: string;
  first_name?: string | null;
  last_name?: string | null;
  email?: string | null;
  full_name?: string | null;
  name?: string | null;
};

function S(v: any) {
  return String(v ?? "");
}
function fullName(m: Member) {
  const fromFields = `${m.first_name || ""} ${m.last_name || ""}`.trim();
  const fromAlt = m.full_name || m.name || "";
  return (fromFields || fromAlt || m.email || "Uten navn").trim();
}
function fmtNb(iso: string) {
  const d = new Date(iso);
  return Number.isNaN(+d) ? iso : d.toLocaleString("nb-NO");
}
function timeNb(iso: string) {
  const d = new Date(iso);
  return Number.isNaN(+d) ? iso : d.toLocaleTimeString("nb-NO");
}

export default function SessionPage() {
  const params = useParams();
  const supabase = createClientComponentClient();

  const sessionId = useMemo(() => {
    const raw = Array.isArray((params as any)?.id) ? (params as any).id[0] : (params as any)?.id;
    return raw ? String(raw) : "";
  }, [params]);

  const [session, setSession] = useState<SessionRow | null>(null);
  const [targets, setTargets] = useState<string[]>([]);
  const [targetMembers, setTargetMembers] = useState<Member[]>([]);
  const [leaders, setLeaders] = useState<Member[]>([]);
  const [participants, setParticipants] = useState<Member[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;

    (async () => {
      setLoading(true);
      setErr(null);

      try {
        // 1) Økt fra DB
        const sRes = await supabase
          .from("activity_sessions")
          .select("id, activity_id, title, start_at, end_at, location, note")
          .eq("id", sessionId)
          .single();

        if (sRes.error) throw sRes.error;
        const s = sRes.data as any;

        if (!alive) return;

        const row: SessionRow = {
          id: String(s.id),
          activity_id: String(s.activity_id),
          title: String(s.title ?? "Økt"),
          start_at: String(s.start_at),
          end_at: s.end_at ? String(s.end_at) : null,
          location: s.location ?? null,
          note: s.note ?? null,
        };
        setSession(row);

        // 2) Targets
        const tRes = await supabase
          .from("activity_session_targets")
          .select("member_id")
          .eq("session_id", sessionId);

        const tids = (tRes.error ? [] : (tRes.data ?? []))
          .map((r: any) => String(r.member_id))
          .filter(Boolean);

        setTargets(tids);

        // 3) Hent medlemsinfo på targets (for pent navn)
        if (tids.length) {
          const mRes = await supabase
            .from("members")
            .select("id, first_name, last_name, email, full_name, name")
            .in("id", tids);

          if (!mRes.error && Array.isArray(mRes.data)) {
            setTargetMembers(mRes.data as any);
          }
        } else {
          setTargetMembers([]);
        }

        // 4) Leder/deltaker-lister (for “send melding til alle” senere + oversikt)
        const actId = row.activity_id;

        const leadRows = await supabase
          .from("enrollments")
          .select("member:members(id,first_name,last_name,email)")
          .eq("activity_id", actId)
          .eq("role", "leader");

        const partRows = await supabase
          .from("enrollments")
          .select("member:members(id,first_name,last_name,email)")
          .eq("activity_id", actId)
          .eq("role", "participant");

        const toMembers = (rows: any[]) =>
          rows
            .map((r) => r?.member)
            .filter(Boolean)
            .map((m: any) => ({
              id: String(m.id),
              first_name: m.first_name ?? null,
              last_name: m.last_name ?? null,
              email: m.email ?? null,
            }));

        if (!leadRows.error && Array.isArray(leadRows.data)) setLeaders(toMembers(leadRows.data as any));
        if (!partRows.error && Array.isArray(partRows.data)) setParticipants(toMembers(partRows.data as any));
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

  const endTime = session.end_at ? timeNb(session.end_at) : null;

  return (
    <div className="mx-auto max-w-3xl px-4 py-8">
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight text-black">{session.title}</h1>
          <p className="mt-1 text-sm text-neutral-600">
            {fmtNb(session.start_at)}{endTime ? ` – ${endTime}` : ""}
            {session.location ? ` · Sted: ${session.location}` : ""}
          </p>
        </div>

        <Link
          href={`/activities/${encodeURIComponent(session.activity_id)}`}
          className="rounded-lg px-3.5 py-2 text-sm font-semibold text-neutral-900 ring-1 ring-neutral-300 hover:bg-neutral-900 hover:text-white"
        >
          Tilbake til aktivitet
        </Link>
      </div>

      <div className="space-y-5 rounded-2xl border border-neutral-200 bg-white p-5 shadow-sm">
        {session.note ? (
          <div>
            <div className="text-sm font-semibold text-neutral-900">Notat</div>
            <p className="mt-2 whitespace-pre-wrap text-sm text-neutral-700">{session.note}</p>
          </div>
        ) : (
          <div className="text-sm text-neutral-500">Ingen notat.</div>
        )}

        <div className="rounded-xl border border-neutral-200 bg-neutral-50 p-4">
          <div className="text-sm font-semibold text-neutral-900">Målgruppe</div>
          <div className="mt-2 text-sm text-neutral-700">
            {targets.length ? (
              <ul className="list-disc pl-5">
                {targetMembers.length
                  ? targetMembers
                      .slice()
                      .sort((a, b) => fullName(a).localeCompare(fullName(b), "nb"))
                      .map((m) => <li key={m.id}>{fullName(m)}</li>)
                  : targets.map((id) => <li key={id}>{id}</li>)}
              </ul>
            ) : (
              <div className="text-neutral-600">
                Ingen målgruppe registrert (kan bety “alle” i eldre data).
              </div>
            )}
          </div>
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <div className="rounded-xl border border-neutral-200 bg-white p-4">
            <div className="text-sm font-semibold text-neutral-900">Ledere</div>
            <div className="mt-2 text-sm text-neutral-700">
              {leaders.length ? (
                <ul className="list-disc pl-5">
                  {leaders.map((m) => <li key={m.id}>{fullName(m)}</li>)}
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
                  {participants.map((m) => <li key={m.id}>{fullName(m)}</li>)}
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
