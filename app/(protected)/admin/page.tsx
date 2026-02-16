"use client";

import * as React from "react";
import Link from "next/link";
import getSupabaseBrowserClient from "@/lib/supabase/client";

type MemberRow = {
  id: string;
  first_name: string | null;
  last_name: string | null;
  email: string | null;
  phone: string | null;
  avatar_url: string | null;
  created_at: string | null;
  roles: string[];
};

type AdminStats = {
  membersTotal: number;
  leadersTotal: number;
  adminsTotal: number;
  activitiesTotal: number;
  enrollmentsTotal: number;
  conversationsTotal: number;
  sessionsUpcoming14d: number;
  membersAdded7d: number;
  messages7d: number;
  memberPushActive: number;
  audiencePushActive: number;
};

type PushTarget = "all" | "members" | "audience";
type Banner = { type: "ok" | "err"; text: string };

const EMPTY_STATS: AdminStats = {
  membersTotal: 0,
  leadersTotal: 0,
  adminsTotal: 0,
  activitiesTotal: 0,
  enrollmentsTotal: 0,
  conversationsTotal: 0,
  sessionsUpcoming14d: 0,
  membersAdded7d: 0,
  messages7d: 0,
  memberPushActive: 0,
  audiencePushActive: 0,
};

function fullName(member: Pick<MemberRow, "first_name" | "last_name" | "email">): string {
  const n = `${member.first_name ?? ""} ${member.last_name ?? ""}`.trim();
  return n || String(member.email ?? "Uten navn");
}

function uniqueLower(values: string[]): string[] {
  return Array.from(new Set(values.map((x) => String(x).trim().toLowerCase()).filter(Boolean)));
}

function isEmail(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

export default function AdminPage() {
  const supabase = React.useMemo(() => getSupabaseBrowserClient(), []);

  const [members, setMembers] = React.useState<MemberRow[]>([]);
  const [membersLoading, setMembersLoading] = React.useState(true);
  const [membersError, setMembersError] = React.useState<string | null>(null);

  const [stats, setStats] = React.useState<AdminStats>(EMPTY_STATS);
  const [statsLoading, setStatsLoading] = React.useState(true);
  const [statsError, setStatsError] = React.useState<string | null>(null);

  const [banner, setBanner] = React.useState<Banner | null>(null);

  const [firstName, setFirstName] = React.useState("");
  const [lastName, setLastName] = React.useState("");
  const [email, setEmail] = React.useState("");
  const [phone, setPhone] = React.useState("");
  const [avatarUrl, setAvatarUrl] = React.useState("");
  const [createAsAdmin, setCreateAsAdmin] = React.useState(false);
  const [createBusy, setCreateBusy] = React.useState(false);

  const [selfBusy, setSelfBusy] = React.useState<"leader" | "admin" | null>(null);
  const [rowBusyId, setRowBusyId] = React.useState<string | null>(null);

  const [search, setSearch] = React.useState("");

  const [pushTitle, setPushTitle] = React.useState("");
  const [pushMessage, setPushMessage] = React.useState("");
  const [pushDeepLink, setPushDeepLink] = React.useState("");
  const [pushTarget, setPushTarget] = React.useState<PushTarget>("all");
  const [pushBusy, setPushBusy] = React.useState(false);
  const [reminderBusy, setReminderBusy] = React.useState(false);

  const setOk = React.useCallback((text: string) => setBanner({ type: "ok", text }), []);
  const setErr = React.useCallback((text: string) => setBanner({ type: "err", text }), []);

  const loadMembers = React.useCallback(async () => {
    setMembersLoading(true);
    setMembersError(null);
    try {
      const { data, error } = await supabase
        .from("members")
        .select("id, first_name, last_name, email, phone, avatar_url, created_at, member_roles(role)")
        .order("created_at", { ascending: false });

      if (error) throw error;

      const rows = Array.isArray(data) ? data : [];
      const normalized: MemberRow[] = rows.map((row: any) => ({
        id: String(row.id),
        first_name: row.first_name ?? null,
        last_name: row.last_name ?? null,
        email: row.email ?? null,
        phone: row.phone ?? null,
        avatar_url: row.avatar_url ?? null,
        created_at: row.created_at ?? null,
        roles: uniqueLower(
          Array.isArray(row.member_roles)
            ? row.member_roles.map((r: any) => String(r?.role ?? ""))
            : []
        ),
      }));

      setMembers(normalized);
    } catch (e: any) {
      setMembers([]);
      setMembersError(String(e?.message ?? e));
    } finally {
      setMembersLoading(false);
    }
  }, [supabase]);

  const loadStats = React.useCallback(async () => {
    setStatsLoading(true);
    setStatsError(null);
    try {
      const res = await fetch("/api/admin/overview", { cache: "no-store" });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(String((json as any)?.error ?? "Kunne ikke hente statistikk."));

      const s = (json as any)?.stats ?? {};
      setStats({
        membersTotal: Number(s.membersTotal ?? 0),
        leadersTotal: Number(s.leadersTotal ?? 0),
        adminsTotal: Number(s.adminsTotal ?? 0),
        activitiesTotal: Number(s.activitiesTotal ?? 0),
        enrollmentsTotal: Number(s.enrollmentsTotal ?? 0),
        conversationsTotal: Number(s.conversationsTotal ?? 0),
        sessionsUpcoming14d: Number(s.sessionsUpcoming14d ?? 0),
        membersAdded7d: Number(s.membersAdded7d ?? 0),
        messages7d: Number(s.messages7d ?? 0),
        memberPushActive: Number(s.memberPushActive ?? 0),
        audiencePushActive: Number(s.audiencePushActive ?? 0),
      });
    } catch (e: any) {
      setStats(EMPTY_STATS);
      setStatsError(String(e?.message ?? e));
    } finally {
      setStatsLoading(false);
    }
  }, []);

  React.useEffect(() => {
    void loadMembers();
    void loadStats();
  }, [loadMembers, loadStats]);

  const refreshAll = async () => {
    await Promise.all([loadMembers(), loadStats()]);
  };

  const promoteByEmail = async (payload: {
    email: string;
    first_name?: string;
    last_name?: string;
    phone?: string;
    avatar_url?: string;
    asAdmin: boolean;
  }) => {
    const res = await fetch("/api/admin/create-leader", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const json = await res.json().catch(() => ({}));
    if (!res.ok || !(json as any)?.ok) {
      throw new Error(String((json as any)?.error ?? "Kunne ikke oppdatere roller."));
    }
  };

  const makeSelf = async (asAdmin: boolean) => {
    setBanner(null);
    setSelfBusy(asAdmin ? "admin" : "leader");
    try {
      const { data } = await supabase.auth.getSession();
      const em = String(data.session?.user?.email ?? "").trim().toLowerCase();
      if (!em) throw new Error("Du må være innlogget for å bruke denne knappen.");

      const nameGuess = em.split("@")[0]?.replace(/[._-]/g, " ") || "";
      const first = nameGuess.split(" ").filter(Boolean)[0] || "";
      const last = nameGuess.split(" ").slice(1).join(" ");

      await promoteByEmail({ email: em, first_name: first, last_name: last, asAdmin });
      await refreshAll();
      setOk(asAdmin ? "Du er nå satt som admin." : "Du er nå satt som leder.");
    } catch (e: any) {
      setErr(String(e?.message ?? e));
    } finally {
      setSelfBusy(null);
    }
  };

  const onCreateLeader = async (e: React.FormEvent) => {
    e.preventDefault();
    setBanner(null);

    const em = email.trim().toLowerCase();
    if (!isEmail(em)) {
      setErr("Skriv en gyldig e-post.");
      return;
    }

    setCreateBusy(true);
    try {
      await promoteByEmail({
        email: em,
        first_name: firstName.trim(),
        last_name: lastName.trim(),
        phone: phone.trim(),
        avatar_url: avatarUrl.trim(),
        asAdmin: createAsAdmin,
      });
      await refreshAll();
      setOk("Bruker oppdatert med roller.");
      setFirstName("");
      setLastName("");
      setEmail("");
      setPhone("");
      setAvatarUrl("");
      setCreateAsAdmin(false);
    } catch (e: any) {
      setErr(String(e?.message ?? e));
    } finally {
      setCreateBusy(false);
    }
  };

  const promoteExisting = async (member: MemberRow, asAdmin: boolean) => {
    setBanner(null);
    setRowBusyId(member.id);
    try {
      const em = String(member.email ?? "").trim().toLowerCase();
      if (!isEmail(em)) throw new Error("Denne brukeren mangler gyldig e-post.");

      await promoteByEmail({
        email: em,
        first_name: String(member.first_name ?? ""),
        last_name: String(member.last_name ?? ""),
        phone: String(member.phone ?? ""),
        avatar_url: String(member.avatar_url ?? ""),
        asAdmin,
      });
      await refreshAll();
      setOk(asAdmin ? `Satte ${fullName(member)} som admin.` : `Satte ${fullName(member)} som leder.`);
    } catch (e: any) {
      setErr(String(e?.message ?? e));
    } finally {
      setRowBusyId(null);
    }
  };

  const sendBroadcast = async (e: React.FormEvent) => {
    e.preventDefault();
    setBanner(null);

    const t = pushTitle.trim();
    const m = pushMessage.trim();
    if (!t || !m) {
      setErr("Skriv både tittel og melding.");
      return;
    }

    setPushBusy(true);
    try {
      const res = await fetch("/api/admin/push/broadcast", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: t,
          message: m,
          target: pushTarget,
          deepLink: pushDeepLink.trim() || null,
        }),
      });

      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(String((json as any)?.error ?? "Kunne ikke sende push."));

      setOk(
        `Push sendt. Sendt: ${Number((json as any)?.sent ?? 0)} · Feilet: ${Number(
          (json as any)?.failed ?? 0
        )} · Tokens: ${Number((json as any)?.tokens ?? 0)}`
      );
    } catch (e: any) {
      setErr(String(e?.message ?? e));
    } finally {
      setPushBusy(false);
    }
  };

  const runRemindersNow = async () => {
    setBanner(null);
    setReminderBusy(true);
    try {
      const res = await fetch("/api/cron/session-reminders", { method: "POST" });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(String((json as any)?.error ?? "Kunne ikke kjøre påminnelser."));

      setOk(
        `Påminnelser kjørt. Økter: ${Number((json as any)?.sessions ?? 0)} · Sendt: ${Number(
          (json as any)?.sent ?? 0
        )} · Feilet: ${Number((json as any)?.failed ?? 0)}`
      );
    } catch (e: any) {
      setErr(String(e?.message ?? e));
    } finally {
      setReminderBusy(false);
    }
  };

  const leaders = React.useMemo(
    () => members.filter((m) => m.roles.includes("leader")),
    [members]
  );
  const admins = React.useMemo(() => members.filter((m) => m.roles.includes("admin")), [members]);

  const filteredMembers = React.useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return members;
    return members.filter((m) => {
      const text = [fullName(m), m.email ?? "", m.phone ?? "", m.roles.join(" ")]
        .join(" ")
        .toLowerCase();
      return text.includes(q);
    });
  }, [members, search]);

  const toolLinks = [
    { href: "/admin/access", title: "Tilgang & roller", desc: "Sett detaljtilganger per modul." },
    { href: "/activities", title: "Aktiviteter", desc: "Planlegg, rediger og organiser innhold." },
    { href: "/members", title: "Medlemmer", desc: "Se alle medlemmer og profilinfo." },
    { href: "/messages", title: "Portal Messenger", desc: "Følg samtaler i portalversjonen." },
    { href: "/admin/cleanup-db-activities", title: "Datarydding", desc: "Rydd opp i utdaterte poster." },
  ];

  return (
    <div className="min-h-screen bg-[radial-gradient(circle_at_20%_-10%,rgba(225,6,0,0.18),transparent_40%),radial-gradient(circle_at_80%_0%,rgba(0,0,0,0.25),transparent_35%),#f5f6f8]">
      <div className="mx-auto max-w-[1400px] px-4 py-8">
        <section className="overflow-hidden rounded-3xl border border-black/10 bg-gradient-to-r from-black via-zinc-900 to-red-700 text-white shadow-2xl">
          <div className="grid gap-6 px-6 py-7 lg:grid-cols-[1.5fr_1fr]">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.22em] text-red-200">Follies Admin Control Center</p>
              <h1 className="mt-2 text-3xl font-black leading-tight">Én samlet side for admin, lederroller, statistikk og varsler</h1>
              <p className="mt-3 max-w-2xl text-sm text-zinc-200">
                Denne siden er laget for rask oversikt og færre klikk: legg til ledere/admin, følg nøkkeltall,
                send push-varsler og kjør øvingspåminnelser fra samme sted.
              </p>
            </div>

            <div className="flex flex-wrap items-start justify-start gap-2 lg:justify-end">
              <button
                onClick={() => void refreshAll()}
                className="rounded-xl bg-white/10 px-4 py-2 text-sm font-semibold text-white ring-1 ring-white/25 transition hover:bg-white/20"
              >
                Oppdater data
              </button>
              <button
                onClick={() => void makeSelf(false)}
                disabled={selfBusy !== null}
                className="rounded-xl bg-white px-4 py-2 text-sm font-semibold text-black transition hover:bg-zinc-200 disabled:opacity-60"
              >
                {selfBusy === "leader" ? "Setter leder..." : "Gjør meg til leder"}
              </button>
              <button
                onClick={() => void makeSelf(true)}
                disabled={selfBusy !== null}
                className="rounded-xl bg-red-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-red-500 disabled:opacity-60"
              >
                {selfBusy === "admin" ? "Setter admin..." : "Gjør meg til admin"}
              </button>
            </div>
          </div>
        </section>

        {banner ? (
          <div className="mt-4">
            <div
              className={`rounded-2xl px-4 py-3 text-sm font-semibold ring-1 ${
                banner.type === "ok"
                  ? "bg-emerald-50 text-emerald-800 ring-emerald-200"
                  : "bg-red-50 text-red-800 ring-red-200"
              }`}
            >
              {banner.text}
            </div>
          </div>
        ) : null}

        <section className="mt-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
          <StatCard title="Medlemmer" value={stats.membersTotal} hint={`${stats.membersAdded7d} nye siste 7 dager`} loading={statsLoading} />
          <StatCard title="Ledere" value={stats.leadersTotal} hint={`${stats.adminsTotal} av disse er admin`} loading={statsLoading} />
          <StatCard title="Aktiviteter" value={stats.activitiesTotal} hint={`${stats.sessionsUpcoming14d} økter neste 14 dager`} loading={statsLoading} />
          <StatCard title="Meldingsaktivitet" value={stats.messages7d} hint={`${stats.conversationsTotal} samtaler totalt`} loading={statsLoading} />
          <StatCard
            title="Push-klare enheter"
            value={stats.memberPushActive + stats.audiencePushActive}
            hint={`${stats.memberPushActive} medlem · ${stats.audiencePushActive} publikum`}
            loading={statsLoading}
          />
        </section>

        {statsError ? (
          <div className="mt-4 rounded-xl bg-amber-50 px-4 py-3 text-sm text-amber-800 ring-1 ring-amber-200">
            Kunne ikke laste statistikk: {statsError}
          </div>
        ) : null}

        <div className="mt-6 grid grid-cols-1 gap-6 xl:grid-cols-12">
          <section className="xl:col-span-8 space-y-6">
            <div className="rounded-3xl border border-zinc-200 bg-white p-5 shadow-sm">
              <div className="flex flex-wrap items-end justify-between gap-3">
                <div>
                  <h2 className="text-xl font-black text-zinc-900">Rollesenter</h2>
                  <p className="mt-1 text-sm text-zinc-600">Legg til ledere, gjør personer til admin, og hold styr på rollefordelingen.</p>
                </div>
                <div className="rounded-xl bg-zinc-900 px-3 py-2 text-xs font-semibold text-white">
                  Ledere: {leaders.length} · Admin: {admins.length}
                </div>
              </div>

              <div className="mt-5 grid gap-5 lg:grid-cols-2">
                <form onSubmit={onCreateLeader} className="rounded-2xl border border-zinc-200 bg-zinc-50 p-4">
                  <h3 className="text-sm font-black uppercase tracking-wide text-zinc-800">Opprett / oppdater leder</h3>
                  <div className="mt-3 grid gap-3 sm:grid-cols-2">
                    <Input label="Fornavn" value={firstName} onChange={setFirstName} placeholder="Fornavn" />
                    <Input label="Etternavn" value={lastName} onChange={setLastName} placeholder="Etternavn" />
                    <Input label="E-post" value={email} onChange={setEmail} placeholder="navn@domene.no" className="sm:col-span-2" required />
                    <Input label="Telefon" value={phone} onChange={setPhone} placeholder="+47 ..." />
                    <Input label="Avatar URL" value={avatarUrl} onChange={setAvatarUrl} placeholder="https://..." />
                  </div>

                  <div className="mt-3 flex items-center justify-between gap-3">
                    <label className="inline-flex items-center gap-2 text-sm font-semibold text-zinc-800">
                      <input
                        type="checkbox"
                        className="h-4 w-4 rounded border-zinc-300 text-red-600"
                        checked={createAsAdmin}
                        onChange={(e) => setCreateAsAdmin(e.target.checked)}
                      />
                      Gi admin-rolle også
                    </label>

                    <button
                      type="submit"
                      disabled={createBusy}
                      className="rounded-xl bg-black px-4 py-2 text-sm font-semibold text-white transition hover:bg-zinc-800 disabled:opacity-60"
                    >
                      {createBusy ? "Lagrer..." : "Lagre rolle"}
                    </button>
                  </div>
                </form>

                <div className="rounded-2xl border border-zinc-200 bg-white p-4">
                  <div className="flex items-center justify-between gap-3">
                    <h3 className="text-sm font-black uppercase tracking-wide text-zinc-800">Folk & roller</h3>
                    <div className="text-xs font-semibold text-zinc-600">{filteredMembers.length} vist</div>
                  </div>
                  <input
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    placeholder="Søk på navn, e-post eller rolle"
                    className="mt-3 w-full rounded-xl border border-zinc-300 bg-white px-3 py-2 text-sm outline-none ring-red-600 focus:ring-2"
                  />

                  <div className="mt-3 max-h-[360px] space-y-2 overflow-y-auto pr-1">
                    {membersLoading ? (
                      <div className="rounded-xl border border-zinc-200 bg-zinc-50 px-3 py-2 text-sm text-zinc-700">Laster medlemmer...</div>
                    ) : membersError ? (
                      <div className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{membersError}</div>
                    ) : filteredMembers.length === 0 ? (
                      <div className="rounded-xl border border-zinc-200 bg-zinc-50 px-3 py-2 text-sm text-zinc-700">Ingen treff.</div>
                    ) : (
                      filteredMembers.slice(0, 120).map((member) => {
                        const busy = rowBusyId === member.id;
                        const isLeader = member.roles.includes("leader");
                        const isAdmin = member.roles.includes("admin");
                        return (
                          <div key={member.id} className="rounded-xl border border-zinc-200 bg-zinc-50 px-3 py-3">
                            <div className="flex items-start justify-between gap-3">
                              <div className="min-w-0">
                                <div className="truncate text-sm font-bold text-zinc-900">{fullName(member)}</div>
                                <div className="truncate text-xs text-zinc-600">{member.email || "Ingen e-post"}</div>
                                <div className="mt-1 text-[11px] font-semibold uppercase tracking-wide text-zinc-500">
                                  {member.roles.length ? member.roles.join(" · ") : "member"}
                                </div>
                              </div>

                              <div className="flex shrink-0 items-center gap-2">
                                <button
                                  onClick={() => void promoteExisting(member, false)}
                                  disabled={busy || isLeader}
                                  className="rounded-lg bg-white px-2.5 py-1.5 text-xs font-semibold text-zinc-900 ring-1 ring-zinc-300 hover:bg-zinc-100 disabled:opacity-50"
                                >
                                  {isLeader ? "Leder" : "Gjør leder"}
                                </button>
                                <button
                                  onClick={() => void promoteExisting(member, true)}
                                  disabled={busy || isAdmin}
                                  className="rounded-lg bg-zinc-900 px-2.5 py-1.5 text-xs font-semibold text-white hover:bg-black disabled:opacity-50"
                                >
                                  {isAdmin ? "Admin" : "Gjør admin"}
                                </button>
                              </div>
                            </div>
                          </div>
                        );
                      })
                    )}
                  </div>
                </div>
              </div>
            </div>

            <div className="rounded-3xl border border-zinc-200 bg-white p-5 shadow-sm">
              <div className="flex flex-wrap items-end justify-between gap-3">
                <div>
                  <h2 className="text-xl font-black text-zinc-900">Push-senter</h2>
                  <p className="mt-1 text-sm text-zinc-600">Send varsler til medlemmer, publikum eller begge målgrupper.</p>
                </div>
                <button
                  onClick={() => void runRemindersNow()}
                  disabled={reminderBusy}
                  className="rounded-xl bg-white px-4 py-2 text-sm font-semibold text-zinc-900 ring-1 ring-zinc-300 hover:bg-zinc-100 disabled:opacity-60"
                >
                  {reminderBusy ? "Kjører påminnelser..." : "Kjør øvingspåminnelser nå"}
                </button>
              </div>

              <form onSubmit={sendBroadcast} className="mt-4 grid gap-3">
                <div className="grid gap-3 sm:grid-cols-2">
                  <div>
                    <label className="mb-1 block text-xs font-bold uppercase tracking-wide text-zinc-700">Målgruppe</label>
                    <select
                      value={pushTarget}
                      onChange={(e) => setPushTarget(e.target.value as PushTarget)}
                      className="w-full rounded-xl border border-zinc-300 bg-white px-3 py-2 text-sm outline-none ring-red-600 focus:ring-2"
                    >
                      <option value="all">Alle (medlemmer + publikum)</option>
                      <option value="members">Kun medlemmer</option>
                      <option value="audience">Kun publikum</option>
                    </select>
                  </div>
                  <Input label="Deep link (valgfritt)" value={pushDeepLink} onChange={setPushDeepLink} placeholder="folliesapp://offers" />
                </div>

                <Input label="Tittel" value={pushTitle} onChange={setPushTitle} placeholder="Ny forestilling: Billetter ute nå" required />

                <div>
                  <label className="mb-1 block text-xs font-bold uppercase tracking-wide text-zinc-700">Melding</label>
                  <textarea
                    value={pushMessage}
                    onChange={(e) => setPushMessage(e.target.value)}
                    placeholder="Billetter er tilgjengelig i appen nå."
                    className="h-28 w-full rounded-xl border border-zinc-300 bg-white px-3 py-2 text-sm outline-none ring-red-600 focus:ring-2"
                    maxLength={280}
                  />
                </div>

                <div>
                  <button
                    type="submit"
                    disabled={pushBusy}
                    className="rounded-xl bg-red-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-red-700 disabled:opacity-60"
                  >
                    {pushBusy ? "Sender push..." : "Send push-varsel"}
                  </button>
                </div>
              </form>
            </div>
          </section>

          <aside className="xl:col-span-4 space-y-6">
            <div className="rounded-3xl border border-zinc-200 bg-white p-5 shadow-sm">
              <h2 className="text-sm font-black uppercase tracking-wide text-zinc-800">Admin-verktøy</h2>
              <div className="mt-3 grid gap-2">
                {toolLinks.map((item) => (
                  <Link
                    key={item.href}
                    href={item.href}
                    className="rounded-xl border border-zinc-200 bg-zinc-50 px-3 py-3 transition hover:bg-zinc-100"
                  >
                    <div className="text-sm font-bold text-zinc-900">{item.title}</div>
                    <div className="mt-1 text-xs text-zinc-600">{item.desc}</div>
                  </Link>
                ))}
              </div>
            </div>

            <div className="rounded-3xl border border-zinc-200 bg-white p-5 shadow-sm">
              <h2 className="text-sm font-black uppercase tracking-wide text-zinc-800">Nøkkeloversikt</h2>
              <ul className="mt-3 space-y-2 text-sm text-zinc-700">
                <KeyItem label="Påmeldinger" value={stats.enrollmentsTotal} />
                <KeyItem label="Aktive medlemspush" value={stats.memberPushActive} />
                <KeyItem label="Aktive publikumspush" value={stats.audiencePushActive} />
                <KeyItem label="Samtaler" value={stats.conversationsTotal} />
              </ul>
            </div>

            <div className="rounded-3xl border border-zinc-200 bg-white p-5 shadow-sm">
              <h2 className="text-sm font-black uppercase tracking-wide text-zinc-800">Teamfordeling</h2>
              <div className="mt-4 space-y-3">
                <ProgressRow
                  label="Ledere"
                  value={stats.leadersTotal}
                  total={Math.max(stats.membersTotal, 1)}
                  tone="bg-red-600"
                />
                <ProgressRow
                  label="Admin"
                  value={stats.adminsTotal}
                  total={Math.max(stats.membersTotal, 1)}
                  tone="bg-black"
                />
                <ProgressRow
                  label="Nye medlemmer (7d)"
                  value={stats.membersAdded7d}
                  total={Math.max(stats.membersTotal, 1)}
                  tone="bg-zinc-500"
                />
              </div>
            </div>
          </aside>
        </div>
      </div>
    </div>
  );
}

function StatCard({
  title,
  value,
  hint,
  loading,
}: {
  title: string;
  value: number;
  hint: string;
  loading: boolean;
}) {
  return (
    <div className="rounded-2xl border border-zinc-200 bg-white px-4 py-4 shadow-sm">
      <div className="text-[11px] font-bold uppercase tracking-wide text-zinc-500">{title}</div>
      <div className="mt-1 text-2xl font-black text-zinc-900">{loading ? "..." : value}</div>
      <div className="mt-1 text-xs text-zinc-600">{hint}</div>
    </div>
  );
}

function Input({
  label,
  value,
  onChange,
  placeholder,
  className,
  required,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
  className?: string;
  required?: boolean;
}) {
  return (
    <div className={className || ""}>
      <label className="mb-1 block text-xs font-bold uppercase tracking-wide text-zinc-700">{label}</label>
      <input
        value={value}
        required={required}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="w-full rounded-xl border border-zinc-300 bg-white px-3 py-2 text-sm outline-none ring-red-600 focus:ring-2"
      />
    </div>
  );
}

function KeyItem({ label, value }: { label: string; value: number }) {
  return (
    <li className="flex items-center justify-between rounded-xl border border-zinc-200 bg-zinc-50 px-3 py-2">
      <span className="font-semibold text-zinc-700">{label}</span>
      <span className="font-black text-zinc-900">{value}</span>
    </li>
  );
}

function ProgressRow({
  label,
  value,
  total,
  tone,
}: {
  label: string;
  value: number;
  total: number;
  tone: string;
}) {
  const pct = Math.max(0, Math.min(100, Math.round((value / total) * 100)));

  return (
    <div>
      <div className="mb-1 flex items-center justify-between text-xs font-semibold text-zinc-700">
        <span>{label}</span>
        <span>{pct}%</span>
      </div>
      <div className="h-2.5 rounded-full bg-zinc-200">
        <div className={`h-2.5 rounded-full ${tone}`} style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}
