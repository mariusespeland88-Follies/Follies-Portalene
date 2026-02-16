"use client";

import * as React from "react";

type Target = "all" | "members" | "audience";

export default function AdminPushPage() {
  const [title, setTitle] = React.useState("");
  const [message, setMessage] = React.useState("");
  const [target, setTarget] = React.useState<Target>("all");
  const [deepLink, setDeepLink] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const [reminderBusy, setReminderBusy] = React.useState(false);
  const [status, setStatus] = React.useState<string | null>(null);
  const [err, setErr] = React.useState<string | null>(null);

  async function onSend(e: React.FormEvent) {
    e.preventDefault();
    setStatus(null);
    setErr(null);

    const t = title.trim();
    const m = message.trim();
    if (!t || !m) {
      setErr("Skriv både tittel og melding.");
      return;
    }

    setBusy(true);
    try {
      const res = await fetch("/api/admin/push/broadcast", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: t,
          message: m,
          target,
          deepLink: deepLink.trim() || null,
        }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json?.error || "Kunne ikke sende push.");

      setStatus(
        `Sendt: ${Number(json?.sent ?? 0)} · Feilet: ${Number(
          json?.failed ?? 0
        )} · Tokens: ${Number(json?.tokens ?? 0)}`
      );
    } catch (e: any) {
      setErr(String(e?.message ?? e));
    } finally {
      setBusy(false);
    }
  }

  async function runRemindersNow() {
    setStatus(null);
    setErr(null);
    setReminderBusy(true);
    try {
      const res = await fetch("/api/cron/session-reminders", { method: "POST" });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json?.error || "Kunne ikke kjøre påminnelser.");
      setStatus(
        `Påminnelser kjørt. Økter: ${Number(json?.sessions ?? 0)} · Sendt: ${Number(
          json?.sent ?? 0
        )} · Feilet: ${Number(json?.failed ?? 0)}`
      );
    } catch (e: any) {
      setErr(String(e?.message ?? e));
    } finally {
      setReminderBusy(false);
    }
  }

  return (
    <div className="mx-auto max-w-3xl px-4 py-8">
      <div className="rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm">
        <h1 className="text-2xl font-semibold text-black">Push-varsler</h1>
        <p className="mt-2 text-sm text-zinc-600">
          Send melding til appbrukere. Brukes sparsomt til viktige oppdateringer.
        </p>

        <form className="mt-6 space-y-4" onSubmit={onSend}>
          <div>
            <label className="mb-1 block text-sm font-semibold text-zinc-800">Målgruppe</label>
            <select
              className="w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm"
              value={target}
              onChange={(e) => setTarget(e.target.value as Target)}
            >
              <option value="all">Alle (medlem + publikum)</option>
              <option value="members">Kun medlemmer/innloggede</option>
              <option value="audience">Kun publikum</option>
            </select>
          </div>

          <div>
            <label className="mb-1 block text-sm font-semibold text-zinc-800">Tittel</label>
            <input
              className="w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              maxLength={80}
              placeholder="Ny forestilling: Billetter ute nå"
            />
          </div>

          <div>
            <label className="mb-1 block text-sm font-semibold text-zinc-800">Melding</label>
            <textarea
              className="h-28 w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm"
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              maxLength={280}
              placeholder="Billetter til vårens forestilling er ute nå."
            />
          </div>

          <div>
            <label className="mb-1 block text-sm font-semibold text-zinc-800">
              Dyp lenke (valgfritt)
            </label>
            <input
              className="w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm"
              value={deepLink}
              onChange={(e) => setDeepLink(e.target.value)}
              placeholder="folliesapp://offers"
            />
          </div>

          {status ? (
            <div className="rounded-lg bg-green-50 px-3 py-2 text-sm text-green-800 ring-1 ring-green-200">
              {status}
            </div>
          ) : null}
          {err ? (
            <div className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-800 ring-1 ring-red-200">
              {err}
            </div>
          ) : null}

          <button
            type="submit"
            disabled={busy}
            className="rounded-lg bg-black px-4 py-2 text-sm font-semibold text-white hover:bg-zinc-800 disabled:opacity-60"
          >
            {busy ? "Sender..." : "Send push"}
          </button>
          <button
            type="button"
            disabled={reminderBusy}
            onClick={runRemindersNow}
            className="ml-2 rounded-lg border border-zinc-300 bg-white px-4 py-2 text-sm font-semibold text-zinc-800 hover:bg-zinc-100 disabled:opacity-60"
          >
            {reminderBusy ? "Kjører..." : "Kjør øvingspåminnelser nå"}
          </button>
        </form>
      </div>
    </div>
  );
}
