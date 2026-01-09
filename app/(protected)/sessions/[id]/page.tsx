"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";

function S(v: any) {
  return String(v ?? "");
}

function fmtNb(iso: string) {
  const d = new Date(iso);
  return Number.isNaN(+d) ? iso : d.toLocaleString("nb-NO");
}

function timeNb(iso: string) {
  const d = new Date(iso);
  return Number.isNaN(+d) ? "" : d.toLocaleTimeString("nb-NO");
}

export default function SessionPage() {
  const params = useParams();
  const router = useRouter();

  const sessionId = useMemo(() => {
    const raw = Array.isArray((params as any)?.id) ? (params as any).id[0] : (params as any)?.id;
    return raw ? String(raw) : "";
  }, [params]);

  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  const [session, setSession] = useState<any>(null);
  const [targetIds, setTargetIds] = useState<string[]>([]);
  const [targetMembers, setTargetMembers] = useState<any[]>([]);
  const [leaders, setLeaders] = useState<any[]>([]);
  const [participants, setParticipants] = useState<any[]>([]);

  const refresh = async () => {
    setLoading(true);
    setErr(null);
    try {
      const res = await fetch("/api/sessions/get", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ sessionId }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json?.error || "Failed");

      setSession(json.session);
      setTargetIds((json.targetIds ?? []).map(String));
      setTargetMembers(json.targetMembers ?? []);
      setLeaders(json.leaders ?? []);
      setParticipants(json.participants ?? []);
    } catch (e: any) {
      setErr(String(e?.message ?? e));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionId]);

  const onDelete = async () => {
    if (!session?.id) return;
    if (!confirm("Er du sikker på at du vil slette denne økten?")) return;

    try {
      const res = await fetch("/api/sessions/delete", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ sessionId: session.id }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json?.error || "Failed");

      // Tilbake til aktiviteten
      router.push(`/activities/${encodeURIComponent(S(session.activity_id))}`);
    } catch (e: any) {
      alert(`Kunne ikke slette: ${String(e?.message ?? e)}`);
    }
  };

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
      </div>
    );
  }

  const endTime = session.end_at ? timeNb(session.end_at) : "";
  const subtitle = `${fmtNb(session.start_at)}${endTime ? ` – ${endTime}` : ""}${session.location ? ` · Sted: ${session.location}` : ""}`;

  const targetCount = targetIds.length;
  const targetLabel = targetCount === 0 ? "Alle påmeldte (standard)" : `${targetCount} valgt`;

  return (
    <div className="mx-auto max-w-3xl px-4 py-8">
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight text-black">{session.title}</h1>
          <p className="mt-1 text-sm text-neutral-600">{subtitle}</p>
        </div>

        <div className="flex items-center gap-2">
          <Link
            href={`/activities/${encodeURIComponent(S(session.activity_id))}`}
            className="rounded-lg px-3.5 py-2 text-sm font-semibold text-neutral-900 ring-1 ring-neutral-300 hover:bg-neutral-900 hover:text-white"
          >
            Tilbake til aktivitet
          </Link>
          <button
            onClick={onDelete}
            className="rounded-lg bg-red-600 px-3.5 py-2 text-sm font-semibold text-white hover:bg-red-700"
          >
            Slett økt
          </button>
        </div>
      </div>

      <div className="space-y-5 rounded-2xl border border-neutral-200 bg-white p-5 shadow-sm">
        <div>
          <div className="text-sm font-semibold text-neutral-900">Notat</div>
          {session.note ? (
            <p className="mt-2 whitespace-pre-wrap text-sm text-neutral-700">{session.note}</p>
          ) : (
            <p className="mt-2 text-sm text-neutral-500">Ingen notat.</p>
          )}
        </div>

        <div className="rounded-xl border border-neutral-200 bg-neutral-50 p-4">
          <div className="text-sm font-semibold text-neutral-900">Målgruppe</div>
          <div className="mt-2 text-sm text-neutral-700">
            <span className="inline-flex items-center rounded-full border border-neutral-200 bg-white px-3 py-1 text-xs font-semibold text-neutral-800">
              {targetLabel}
            </span>
          </div>

          {targetCount > 0 ? (
            <ul className="mt-3 list-disc pl-5 text-sm text-neutral-700">
              {targetMembers
                .slice()
                .sort((a, b) => String(a?.name ?? "").localeCompare(String(b?.name ?? ""), "nb"))
                .map((m: any) => (
                  <li key={S(m.id)}>{m?.name ?? "Uten navn"}</li>
                ))}
            </ul>
          ) : null}
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <div className="rounded-xl border border-neutral-200 bg-white p-4">
            <div className="text-sm font-semibold text-neutral-900">Ledere</div>
            <div className="mt-2 text-sm text-neutral-700">
              {leaders.length ? (
                <ul className="list-disc pl-5">
                  {leaders.map((m: any) => (
                    <li key={S(m.id)}>{m?.name ?? "Uten navn"}</li>
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
                  {participants.map((m: any) => (
                    <li key={S(m.id)}>{m?.name ?? "Uten navn"}</li>
                  ))}
                </ul>
              ) : (
                <div className="text-neutral-500">Ingen funnet.</div>
              )}
            </div>
          </div>
        </div>

        <div className="text-xs text-neutral-500">
          Økt-ID: <span className="font-mono">{S(session.id)}</span>
        </div>
      </div>
    </div>
  );
}
