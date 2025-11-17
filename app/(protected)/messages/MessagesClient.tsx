"use client";

import { useEffect, useMemo, useState, useRef } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { createClientComponentClient } from "@/lib/supabase/browser";
import { saveMessage } from "@/lib/messagesClient";

const MSG_LS = "follies.messages.v1";

type StoredMessage = {
  id: string;
  memberId?: string;
  member_id?: string;
  subject?: string;
  body?: string;
  createdAt?: string;
  created_at?: string;
  scope?: string;
  target?: string;
  activityId?: string | null;
  activity_id?: string | null;
};

type MemberInfo = {
  id: string;
  name: string;
  email: string | null;
};

type ThreadSummary = {
  memberId: string;
  lastMessageAt: string | null;
  lastMessagePreview: string;
  count: number;
};

/* ------------------------ LS helpers ------------------------ */

function safeJSON<T>(raw: string | null): T | null {
  try {
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}

function normalizeMemberId(
  m: StoredMessage,
  keyFromObject?: string
): string | null {
  if (m.memberId) return String(m.memberId);
  if (m.member_id) return String(m.member_id);
  if (keyFromObject) return String(keyFromObject);
  return null;
}

function normalizeCreatedAt(m: StoredMessage): string | null {
  return (m.createdAt || m.created_at || null) ?? null;
}

function loadMessagesGroupedByMember(): Record<string, StoredMessage[]> {
  if (typeof window === "undefined") return {};
  const raw = localStorage.getItem(MSG_LS);
  if (!raw) return {};

  const data = safeJSON<any>(raw);
  if (!data) return {};

  const grouped: Record<string, StoredMessage[]> = {};

  // Variant 1: Array av meldinger
  if (Array.isArray(data)) {
    for (const item of data as StoredMessage[]) {
      const mid = normalizeMemberId(item);
      if (!mid) continue;
      if (!grouped[mid]) grouped[mid] = [];
      grouped[mid].push({ ...item, memberId: mid });
    }
    return grouped;
  }

  // Variant 2: Objekt { memberId: [meldinger] }
  if (data && typeof data === "object") {
    for (const [key, value] of Object.entries(data)) {
      if (!Array.isArray(value)) continue;
      const mid = String(key);
      grouped[mid] = (value as StoredMessage[]).map((m) => ({
        ...m,
        memberId: normalizeMemberId(m, mid) ?? mid,
      }));
    }
    return grouped;
  }

  return {};
}

function makeThreadSummaries(
  grouped: Record<string, StoredMessage[]>
): ThreadSummary[] {
  const result: ThreadSummary[] = [];

  for (const [memberId, list] of Object.entries(grouped)) {
    if (!list.length) continue;

    const sorted = [...list].sort((a, b) => {
      const da = normalizeCreatedAt(a);
      const db = normalizeCreatedAt(b);
      if (!da && !db) return 0;
      if (!da) return 1;
      if (!db) return -1;
      return new Date(db).getTime() - new Date(da).getTime();
    });

    const newest = sorted[0];
    const lastBody = (newest.body || "").trim();
    const preview =
      lastBody.length > 100 ? lastBody.slice(0, 100) + "…" : lastBody;

    result.push({
      memberId,
      lastMessageAt: normalizeCreatedAt(newest),
      lastMessagePreview: preview,
      count: list.length,
    });
  }

  // Sorter threads etter nyeste melding
  return result.sort((a, b) => {
    if (!a.lastMessageAt && !b.lastMessageAt) return 0;
    if (!a.lastMessageAt) return 1;
    if (!b.lastMessageAt) return -1;
    return (
      new Date(b.lastMessageAt!).getTime() -
      new Date(a.lastMessageAt!).getTime()
    );
  });
}

/* ------------------------ UI helpers ------------------------ */

function formatDateTime(value: string | null): string {
  if (!value) return "—";
  const d = new Date(value);
  if (Number.isNaN(+d)) return "—";
  return d.toLocaleString("nb-NO");
}

function initials(name: string): string {
  return (
    name
      .trim()
      .split(/\s+/)
      .slice(0, 2)
      .map((p) => p[0]?.toUpperCase() ?? "")
      .join("") || "U"
  );
}

/* ----------------------------- Component ----------------------------- */

export default function MessagesClient() {
  const supabase = createClientComponentClient();
  const router = useRouter();
  const searchParams = useSearchParams();

  const [grouped, setGrouped] = useState<Record<string, StoredMessage[]>>({});
  const [threads, setThreads] = useState<ThreadSummary[]>([]);
  const [members, setMembers] = useState<Record<string, MemberInfo>>({});
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [sendError, setSendError] = useState<string | null>(null);
  const [sendInfo, setSendInfo] = useState<string | null>(null);
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");

  const logRef = useRef<HTMLDivElement | null>(null);

  /* --------- load messages from LS --------- */
  useEffect(() => {
    const g = loadMessagesGroupedByMember();
    const t = makeThreadSummaries(g);
    setGrouped(g);
    setThreads(t);
  }, []);

  /* --------- load member info from Supabase --------- */
  useEffect(() => {
    let active = true;

    (async () => {
      const memberIds = Object.keys(grouped);
      if (!memberIds.length) {
        setLoading(false);
        return;
      }

      try {
        const { data, error } = await supabase
          .from("members")
          .select("id, first_name, last_name, email")
          .in("id", memberIds);

        if (!active) return;
        if (error) {
          console.error("Feil ved henting av medlemmer til Messenger:", error);
          setLoading(false);
          return;
        }

        const next: Record<string, MemberInfo> = {};
        for (const row of (data || []) as any[]) {
          const id = String(row.id);
          const fn = (row.first_name || "").trim();
          const ln = (row.last_name || "").trim();
          const name = fn || ln ? `${fn} ${ln}`.trim() : "Ukjent medlem";
          next[id] = { id, name, email: row.email ?? null };
        }
        setMembers(next);
        setLoading(false);
      } catch (e) {
        console.error("Uventet feil ved henting av medlemmer til Messenger:", e);
        if (active) setLoading(false);
      }
    })();

    return () => {
      active = false;
    };
  }, [grouped, supabase]);

  const selectedMemberIdFromQuery = searchParams.get("memberId");

  const selectedMemberId = useMemo(() => {
    if (selectedMemberIdFromQuery) return selectedMemberIdFromQuery;
    if (threads.length) return threads[0].memberId;
    return null;
  }, [selectedMemberIdFromQuery, threads]);

  /* --------- ensure member info if opened from member page --------- */
  useEffect(() => {
    if (!selectedMemberId) return;
    if (members[selectedMemberId]) return;

    let active = true;

    (async () => {
      try {
        const { data, error } = await supabase
          .from("members")
          .select("id, first_name, last_name, email")
          .eq("id", selectedMemberId)
          .maybeSingle();

        if (!active) return;
        if (error) {
          console.error(
            "Feil ved henting av medlem for første samtale i Messenger:",
            error
          );
          return;
        }
        if (!data) return;

        const row: any = data;
        const id = String(row.id);
        const fn = (row.first_name || "").trim();
        const ln = (row.last_name || "").trim();
        const name = fn || ln ? `${fn} ${ln}`.trim() : "Ukjent medlem";
        const email = row.email ?? null;

        setMembers((prev) => ({
          ...prev,
          [id]: { id, name, email },
        }));
      } catch (e) {
        console.error("Uventet feil ved henting av medlem for første samtale:", e);
      }
    })();

    return () => {
      active = false;
    };
  }, [selectedMemberId, members, supabase]);

  /* --------- derived selected messages --------- */
  const selectedMessages = useMemo(() => {
    if (!selectedMemberId) return [];
    const list = grouped[selectedMemberId] || [];
    return [...list].sort((a, b) => {
      const da = normalizeCreatedAt(a);
      const db = normalizeCreatedAt(b);
      if (!da && !db) return 0;
      if (!da) return -1;
      if (!db) return 1;
      return new Date(da!).getTime() - new Date(db!).getTime();
    });
  }, [grouped, selectedMemberId]);

  const selectedMemberInfo: MemberInfo | null = selectedMemberId
    ? members[selectedMemberId] ?? {
        id: selectedMemberId,
        name: "Ukjent medlem",
        email: null,
      }
    : null;

  /* --------- scroll to bottom on new messages --------- */
  useEffect(() => {
    if (!logRef.current) return;
    logRef.current.scrollTop = logRef.current.scrollHeight;
  }, [selectedMessages.length]);

  /* --------- handlers --------- */

  async function handleSend() {
    if (!selectedMemberId) return;
    if (!body.trim()) {
      setSendError("Meldingen kan ikke være tom.");
      return;
    }

    setSending(true);
    setSendError(null);
    setSendInfo(null);

    try {
      const subjectToUse =
        subject.trim() ||
        `Melding til ${selectedMemberInfo?.name ?? "medlem"}`;

      const saved = saveMessage({
        scope: "member",
        memberId: selectedMemberId,
        activityId: null,
        target: "custom",
        subject: subjectToUse,
        body: body.trim(),
        createdByEmail: null,
        createdByName: null,
      });

      setGrouped((prev) => {
        const existing = prev[selectedMemberId] || [];
        const nextGrouped = {
          ...prev,
          [selectedMemberId]: [
            ...existing,
            {
              ...(saved as any),
              memberId: selectedMemberId,
            },
          ],
        };
        setThreads(makeThreadSummaries(nextGrouped));
        return nextGrouped;
      });

      const email = selectedMemberInfo?.email?.trim() || null;
      if (email) {
        const res = await fetch("/api/admin/send-member-email", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            memberId: selectedMemberId,
            email,
            subject: subjectToUse,
            body: body.trim(),
          }),
        });
        const json = await res.json().catch(() => ({}));
        if (!res.ok) {
          const msg = String(json?.error || "");
          if (
            msg.includes("Supabase or SMTP configuration missing") ||
            msg.toLowerCase().includes("smtp")
          ) {
            setSendInfo(
              "Meldingen er lagret, men e-post kunne ikke sendes fordi SMTP-oppsett mangler."
            );
          } else {
            throw new Error(json?.error || "Kunne ikke sende e-post.");
          }
        } else {
          setSendInfo(`Meldingen er lagret og sendt til ${email}.`);
        }
      } else {
        setSendInfo(
          "Meldingen er lagret i portalen (ingen e-post registrert)."
        );
      }

      setSubject("");
      setBody("");
    } catch (e: any) {
      setSendError(e?.message || "Noe gikk galt ved sending av melding.");
    } finally {
      setSending(false);
    }
  }

  function handleSelectThread(memberId: string) {
    const qs = new URLSearchParams(searchParams.toString());
    qs.set("memberId", memberId);
    router.push(`/messages?${qs.toString()}`);
  }

  /* ----------------------------- render states ----------------------------- */

  if (loading) {
    return (
      <main className="mx-auto max-w-7xl bg-neutral-950 px-4 py-10 text-neutral-100">
        <div className="rounded-2xl border border-neutral-700 bg-neutral-900 p-6 text-sm font-medium shadow-lg">
          Laster meldinger…
        </div>
      </main>
    );
  }

  if (!threads.length && !selectedMemberIdFromQuery) {
    return (
      <main className="mx-auto max-w-7xl bg-neutral-950 px-4 py-10 text-neutral-100">
        <section className="rounded-3xl border border-neutral-800 bg-gradient-to-br from-neutral-900 via-neutral-950 to-black p-8 shadow-[0_0_60px_rgba(0,0,0,0.8)]">
          <h1 className="text-3xl font-semibold tracking-tight text-red-300">
            Follies Messenger
          </h1>
          <p className="mt-2 text-sm font-medium text-neutral-200">
            Du har ikke sendt eller lagret noen meldinger ennå.
          </p>
          <p className="mt-3 text-sm text-neutral-200">
            Gå til{" "}
            <Link
              href="/members"
              className="font-semibold text-red-300 underline underline-offset-2"
            >
              Medlemmer
            </Link>{" "}
            og bruk knappen <span className="font-semibold">Messenger</span> på
            et medlem for å starte en samtale.
          </p>
        </section>
      </main>
    );
  }

  /* ----------------------------- main render ----------------------------- */

  return (
    <main className="mx-auto max-w-7xl bg-neutral-950 px-4 py-8 text-neutral-100">
      {/* Tittelrad */}
      <div className="mb-6 flex items-center justify-between gap-3">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight text-red-300">
            Follies Messenger
          </h1>
          <p className="mt-1 text-sm font-medium text-neutral-100">
            Hold kontakt med deltakere og foresatte direkte fra portalen.
          </p>
        </div>
        <Link
          href="/members"
          className="rounded-xl border border-red-500/70 bg-neutral-950 px-4 py-2 text-sm font-semibold text-red-100 shadow-[0_0_20px_rgba(239,68,68,0.5)] hover:bg-neutral-900"
        >
          Gå til medlemmer
        </Link>
      </div>

      {/* Hovedkort */}
      <section className="rounded-[28px] border border-neutral-800 bg-gradient-to-br from-neutral-900 via-neutral-900 to-neutral-800 p-4 shadow-[0_0_80px_rgba(0,0,0,0.9)]">
        <div className="grid gap-4 lg:grid-cols-[minmax(0,0.9fr),minmax(0,1.4fr)]">
          {/* VENSTRE: trådliste */}
          <aside className="flex min-h-[420px] flex-col rounded-2xl border border-neutral-800 bg-neutral-850">
            <div className="flex items-center justify-between border-b border-neutral-800 px-4 py-3">
              <div className="flex items-center gap-2">
                <span className="inline-flex h-7 w-7 items-center justify-center rounded-full bg-red-500 text-xs font-semibold text-white">
                  ✉
                </span>
                <h2 className="text-sm font-semibold text-neutral-50">
                  Samtaler
                </h2>
              </div>
              <span className="rounded-full bg-neutral-900 px-2.5 py-0.5 text-xs font-semibold text-red-100 ring-1 ring-red-500/70">
                {threads.length || (selectedMemberId ? 1 : 0)}
              </span>
            </div>
            <div className="flex-1 overflow-y-auto">
              {threads.length === 0 && selectedMemberId ? (
                <div className="px-4 py-3 text-sm text-neutral-200">
                  Du starter en ny samtale med{" "}
                  <span className="font-semibold">
                    {selectedMemberInfo?.name ?? "medlem"}
                  </span>
                  .
                </div>
              ) : (
                threads.map((t) => {
                  const info =
                    members[t.memberId] ?? {
                      id: t.memberId,
                      name: "Ukjent medlem",
                      email: null,
                    };
                  const active = selectedMemberId === t.memberId;
                  return (
                    <button
                      key={t.memberId}
                      onClick={() => handleSelectThread(t.memberId)}
                      className={`flex w-full items-start gap-3 px-4 py-3 text-left text-sm transition ${
                        active
                          ? "bg-red-900/60"
                          : "hover:bg-neutral-800/90"
                      }`}
                    >
                      <div className="mt-0.5 flex h-9 w-9 flex-shrink-0 items-center justify-center overflow-hidden rounded-full bg-red-600 text-xs font-semibold text-white ring-2 ring-red-300/80">
                        {initials(info.name)}
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center justify-between gap-2">
                          <p className="truncate text-[13px] font-semibold text-neutral-50">
                            {info.name}
                          </p>
                          <span className="text-[11px] font-medium text-neutral-400">
                            {formatDateTime(t.lastMessageAt)}
                          </span>
                        </div>
                        <p className="mt-0.5 line-clamp-2 text-[12px] text-neutral-200">
                          {t.lastMessagePreview || "Ingen tekst."}
                        </p>
                        <p className="mt-1 text-[10px] text-neutral-500">
                          {t.count} melding{t.count === 1 ? "" : "er"}
                        </p>
                      </div>
                    </button>
                  );
                })
              )}
            </div>
          </aside>

          {/* HØYRE: valgt samtale */}
          <section className="flex min-h-[420px] flex-col rounded-2xl border border-neutral-800 bg-neutral-850">
            <div className="flex items-center justify-between border-b border-neutral-800 px-4 py-3">
              <div>
                <h2 className="text-sm font-semibold text-neutral-50">
                  {selectedMemberInfo?.name ?? "Velg en samtale"}
                </h2>
                {selectedMemberInfo?.email && (
                  <p className="text-xs text-neutral-300">
                    {selectedMemberInfo.email}
                  </p>
                )}
              </div>
              {selectedMemberId && (
                <Link
                  href={`/members/${encodeURIComponent(selectedMemberId)}`}
                  className="rounded-lg border border-neutral-700 bg-neutral-900 px-3 py-1.5 text-xs font-semibold text-neutral-100 hover:bg-neutral-850"
                >
                  Åpne medlem
                </Link>
              )}
            </div>

            {/* Meldingslogg */}
            <div
              ref={logRef}
              className="flex-1 space-y-2 overflow-y-auto px-4 py-3"
            >
              {selectedMessages.length === 0 ? (
                <p className="text-sm text-neutral-200">
                  Ingen meldinger registrert i denne samtalen ennå.
                </p>
              ) : (
                selectedMessages.map((m) => (
                  <article
                    key={m.id}
                    className="max-w-xl rounded-2xl border border-neutral-700 bg-neutral-900 px-3.5 py-2.5 text-sm text-neutral-50 shadow-sm"
                  >
                    <div className="mb-1.5 flex items-center justify-between gap-2">
                      <span className="truncate text-[13px] font-semibold text-red-300">
                        {m.subject || "Melding"}
                      </span>
                      <span className="text-[11px] font-medium text-neutral-400">
                        {formatDateTime(normalizeCreatedAt(m))}
                      </span>
                    </div>
                    <p className="whitespace-pre-wrap text-[13px] leading-relaxed text-neutral-50">
                      {m.body || ""}
                    </p>
                  </article>
                ))
              )}
            </div>

            {/* Ny melding */}
            {selectedMemberId && (
              <div className="border-t border-neutral-800 bg-neutral-900 px-4 py-3">
                <div className="space-y-2">
                  <input
                    value={subject}
                    onChange={(e) => setSubject(e.target.value)}
                    placeholder='Tittel (f.eks. "Husk øving") – valgfritt'
                    className="w-full rounded-lg border border-neutral-700 bg-neutral-850 px-3 py-1.5 text-sm text-neutral-50 outline-none focus:border-red-400 focus:ring-1 focus:ring-red-400"
                  />
                  <textarea
                    value={body}
                    onChange={(e) => setBody(e.target.value)}
                    rows={3}
                    placeholder="Skriv meldingen du vil sende til medlemmet…"
                    className="w-full rounded-lg border border-neutral-700 bg-neutral-850 px-3 py-1.5 text-sm text-neutral-50 outline-none focus:border-red-400 focus:ring-1 focus:ring-red-400"
                  />
                  <div className="flex items-start justify-between gap-3">
                    <p className="mt-1 text-[11px] text-neutral-300">
                      Meldingen lagres i portalen og forsøkes sendt som e-post
                      hvis medlemmet har en registrert adresse.
                    </p>
                    <button
                      type="button"
                      onClick={handleSend}
                      disabled={sending || !body.trim()}
                      className="rounded-lg bg-red-600 px-4 py-1.5 text-sm font-semibold text-white shadow-[0_0_18px_rgba(239,68,68,0.7)] hover:bg-red-500 disabled:opacity-60"
                    >
                      {sending ? "Sender…" : "Send melding"}
                    </button>
                  </div>

                  {sendError && (
                    <div className="mt-1 inline-flex items-center gap-2 rounded-lg border border-red-500/60 bg-red-950/60 px-3 py-1 text-[11px] text-red-100">
                      <span className="text-xs">⚠️</span>
                      <span>{sendError}</span>
                    </div>
                  )}
                  {sendInfo && !sendError && (
                    <div className="mt-1 inline-flex items-center gap-2 rounded-lg border border-emerald-500/60 bg-emerald-950/60 px-3 py-1 text-[11px] text-emerald-100">
                      <span className="text-xs">✔</span>
                      <span>{sendInfo}</span>
                    </div>
                  )}
                </div>
              </div>
            )}
          </section>
        </div>
      </section>
    </main>
  );
}
