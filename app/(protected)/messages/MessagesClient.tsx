"use client";

import { useEffect, useMemo, useState } from "react";
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
      new Date(b.lastMessageAt).getTime() - new Date(a.lastMessageAt).getTime()
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

/* ----------------------------- Client-komponent ----------------------------- */

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

  // Hent meldinger fra LS
  useEffect(() => {
    const g = loadMessagesGroupedByMember();
    const t = makeThreadSummaries(g);
    setGrouped(g);
    setThreads(t);
  }, []);

  // Hent medlemsinfo for alle involverte memberId-er (med eksisterende meldinger)
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
        for (const row of data || []) {
          const id = String((row as any).id);
          const fn = ((row as any).first_name || "").trim();
          const ln = ((row as any).last_name || "").trim();
          const name =
            fn || ln ? `${fn} ${ln}`.trim() : "Ukjent medlem";
          next[id] = { id, name, email: (row as any).email ?? null };
        }
        setMembers(next);
        setLoading(false);
      } catch (e) {
        console.error(
          "Uventet feil ved henting av medlemmer til Messenger:",
          e
        );
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

  // Hvis vi åpner Messenger med memberId i URL, men ingen meldinger finnes ennå:
  // hent info om dette medlemmet også (navn/e-post).
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
        console.error(
          "Uventet feil ved henting av medlem for første samtale:",
          e
        );
      }
    })();

    return () => {
      active = false;
    };
  }, [selectedMemberId, members, supabase]);

  const selectedMessages = useMemo(() => {
    if (!selectedMemberId) return [];
    const list = grouped[selectedMemberId] || [];
    return [...list].sort((a, b) => {
      const da = normalizeCreatedAt(a);
      const db = normalizeCreatedAt(b);
      if (!da && !db) return 0;
      if (!da) return -1;
      if (!db) return 1;
      return (
        new Date(da).getTime() - new Date(db).getTime()
      );
    });
  }, [grouped, selectedMemberId]);

  const selectedMemberInfo = selectedMemberId
    ? members[selectedMemberId] ?? {
        id: selectedMemberId,
        name: "Ukjent medlem",
        email: null,
      }
    : null;

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

      // Oppdater lokal state (grouped + threads)
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

      // Send e-post også, hvis vi har e-postadresse
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
          throw new Error(json?.error || "Kunne ikke sende e-post.");
        }
        setSendInfo(`Meldingen er lagret og sendt til ${email}.`);
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

  if (loading) {
    return (
      <main className="mx-auto max-w-6xl px-4 py-8 text-neutral-900">
        Laster meldinger…
      </main>
    );
  }

  // Helt tomt: ingen meldinger og ingen memberId i URL -> ren tom-state
  if (!threads.length && !selectedMemberIdFromQuery) {
    return (
      <main className="mx-auto max-w-6xl px-4 py-8 text-neutral-900 space-y-4">
        <h1 className="text-2xl font-semibold tracking-tight text-neutral-900">
          Follies Messenger
        </h1>
        <p className="text-sm text-neutral-700">
          Du har ikke sendt eller lagret noen meldinger ennå.
        </p>
        <p className="text-sm text-neutral-700">
          Åpne et medlem fra{" "}
          <Link href="/members" className="text-red-600 underline">
            medlemslisten
          </Link>{" "}
          og bruk knappen <span className="font-semibold">Messenger</span> for å
          starte en samtale.
        </p>
      </main>
    );
  }

  return (
    <main className="mx-auto max-w-6xl px-4 py-8 text-neutral-900">
      <div className="mb-4 flex items-center justify_between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-neutral-900">
            Follies Messenger
          </h1>
          <p className="text-sm text-neutral-600">
            Se samtaler med medlemmer og send nye meldinger.
          </p>
        </div>
        <Link
          href="/members"
          className="rounded-lg bg_white px-3.5 py-2 text-sm font-semibold text-neutral-900 ring-1 ring-neutral-300 hover:bg-neutral-100"
        >
          Gå til medlemmer
        </Link>
      </div>

      <div className="grid gap-4 rounded-2xl border border-zinc-300 bg-white shadow-sm lg:grid-cols-[minmax(0,0.9fr),minmax(0,1.4fr)]">
        {/* VENSTRE: Trådliste */}
        <aside className="flex min-h-[420px] flex-col border-b border-zinc-200 lg:border-b-0 lg:border-r">
          <div className="flex items-center justify-between border-b border-zinc-200 px-4 py-3">
            <h2 className="text-sm font-semibold text-neutral-900">Samtaler</h2>
            <span className="rounded-full bg-neutral-900 px-2.5 py-0.5 text-xs font-semibold text-white">
              {threads.length || (selectedMemberId ? 1 : 0)}
            </span>
          </div>
          <div className="flex-1 overflow-y-auto">
            {threads.length === 0 && selectedMemberId ? (
              <div className="px-4 py-3 text-xs text-neutral-600">
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
                      active ? "bg-red-50" : "hover:bg-neutral-50"
                    }`}
                  >
                    <div className="mt-0.5 h-8 w-8 flex-shrink-0 overflow-hidden rounded-full bg-neutral-900 text-xs font-semibold text-white flex items-center justify-center">
                      {initials(info.name)}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center justify-between gap-2">
                        <p className="truncate font-semibold text-neutral-900">
                          {info.name}
                        </p>
                        <span className="text-[10px] text-neutral-500">
                          {formatDateTime(t.lastMessageAt)}
                        </span>
                      </div>
                      <p className="mt-0.5 line-clamp-2 text-xs text-neutral-600">
                        {t.lastMessagePreview || "Ingen tekst."}
                      </p>
                      <p className="mt-0.5 text-[10px] text-neutral-500">
                        {t.count} melding{t.count === 1 ? "" : "er"}
                      </p>
                    </div>
                  </button>
                );
              })
            )}
          </div>
        </aside>

        {/* HØYRE: Valgt samtale */}
        <section className="flex min-h-[420px] flex-col">
          <div className="flex items-center justify-between border-b border-zinc-200 px-4 py-3">
            <div>
              <h2 className="text-sm font-semibold text-neutral-900">
                {selectedMemberInfo?.name ?? "Velg en samtale"}
              </h2>
              {selectedMemberInfo?.email && (
                <p className="text-xs text-neutral-600">
                  {selectedMemberInfo.email}
                </p>
              )}
            </div>
            {selectedMemberId && (
              <Link
                href={`/members/${encodeURIComponent(selectedMemberId)}`}
                className="rounded-lg bg-white px-3 py-1.5 text-xs font-semibold text-neutral-900 ring-1 ring-neutral-300 hover:bg-neutral-100"
              >
                Åpne medlem
              </Link>
            )}
          </div>

          {/* Meldingslogg */}
          <div className="flex-1 space-y-2 overflow-y-auto px-4 py-3">
            {selectedMessages.length === 0 ? (
              <p className="text-sm text-neutral-600">
                Ingen meldinger registrert i denne samtalen ennå.
              </p>
            ) : (
              selectedMessages.map((m) => (
                <article
                  key={m.id}
                  className="max-w-xl rounded-2xl border border-neutral-200 bg-neutral-50 px-3.5 py-2.5 text-xs text-neutral-900"
                >
                  <div className="mb-1 flex items-center justify-between gap-2">
                    <span className="font-semibold">
                      {m.subject || "Melding"}
                    </span>
                    <span className="text-[10px] text-neutral-500">
                      {formatDateTime(normalizeCreatedAt(m))}
                    </span>
                  </div>
                  <p className="whitespace-pre-wrap">{m.body || ""}</p>
                </article>
              ))
            )}
          </div>

          {/* Ny melding */}
          {selectedMemberId && (
            <div className="border-t border-zinc-200 bg-neutral-50 px-4 py-3">
              <div className="space-y-2">
                <input
                  value={subject}
                  onChange={(e) => setSubject(e.target.value)}
                  placeholder='Tittel (f.eks. "Husk øving") – valgfritt'
                  className="w-full rounded-lg border border-neutral-300 bg-white px-3 py-1.5 text-sm text-neutral-900 outline-none focus:border-red-500 focus:ring-1 focus:ring-red-500"
                />
                <textarea
                  value={body}
                  onChange={(e) => setBody(e.target.value)}
                  rows={3}
                  placeholder="Skriv meldingen du vil sende til medlemmet…"
                  className="w-full rounded-lg border border-neutral-300 bg-white px-3 py-1.5 text-sm text-neutral-900 outline-none focus:border-red-500 focus:ring-1 focus:ring-red-500"
                />
                <div className="flex items-center justify-between gap-3">
                  <p className="text-[11px] text-neutral-500">
                    Meldingen lagres i portalen og sendes som e-post hvis medlemmet
                    har en registrert e-postadresse.
                  </p>
                  <button
                    type="button"
                    onClick={handleSend}
                    disabled={sending || !body.trim()}
                    className="rounded-lg bg-red-600 px-4 py-1.5 text-sm font-semibold text-white shadow-sm hover:bg-red-700 disabled:opacity-60"
                  >
                    {sending ? "Sender…" : "Send melding"}
                  </button>
                </div>
                {sendError && (
                  <p className="text-[11px] text-red-600">{sendError}</p>
                )}
                {sendInfo && !sendError && (
                  <p className="text-[11px] text-emerald-700">{sendInfo}</p>
                )}
              </div>
            </div>
          )}
        </section>
      </div>
    </main>
  );
}
