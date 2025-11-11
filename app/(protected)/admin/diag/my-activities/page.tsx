"use client";

import * as React from "react";
import { createClientComponentClient } from "@supabase/auth-helpers-nextjs";
import Link from "next/link";

type AnyObj = Record<string, any>;

const MEMBERS_KEY = "follies.members.v1";
const MEMBERS_FB = "follies.members";
const ACT_KEY = "follies.activities.v1";
const PERMS_KEY = "follies.perms.v1";

const parseJSON = <T,>(raw: string | null, fb: T): T => {
  try { return raw ? (JSON.parse(raw) as T) : fb; } catch { return fb; }
};
const readLS = (k: string) => (typeof window === "undefined" ? null : window.localStorage.getItem(k));
const writeLS = (k: string, v: any) => { if (typeof window !== "undefined") window.localStorage.setItem(k, JSON.stringify(v)); };
const toStr = (v: any) => (v == null ? "" : String(v));

function pick(o: AnyObj, keys: string[], fb: any = "") {
  for (const k of keys) if (o && o[k] !== undefined) return o[k];
  return fb;
}
function fullName(m: AnyObj) {
  const fn = pick(m, ["first_name", "fornavn"], "");
  const ln = pick(m, ["last_name", "etternavn"], "");
  const full = pick(m, ["full_name", "name", "navn"], "");
  return (full || `${fn} ${ln}`.trim()) || "";
}
function memberEmail(m: AnyObj) { return pick(m, ["email","epost","mail"], ""); }
function activityId(a: AnyObj) { return toStr(a?.id ?? a?.uuid ?? a?._id); }
function isUserInActivity(a: AnyObj, me: { id?: string; email?: string }) {
  const raw = pick(a, ["participants", "deltakere", "members", "enrollments", "registrations", "påmeldte", "paameldte"], []);
  const email = (me.email || "").trim().toLowerCase();
  const myId = (me.id || "").trim();
  if (!Array.isArray(raw)) return false;
  for (const item of raw) {
    if (typeof item === "string" || typeof item === "number") { if (myId && toStr(item) === myId) return true; }
    else if (item && typeof item === "object") {
      const mid = toStr(item?.memberId ?? item?.id ?? item?.uuid ?? item?._id);
      const mem = toStr(item?.email ?? item?.epost ?? item?.mail).trim().toLowerCase();
      if (myId && mid && mid === myId) return true;
      if (email && mem && mem === email) return true;
    }
  }
  return false;
}
function leaderActivityIdsFromPerms(perms: AnyObj, myId: string): string[] {
  const out = new Set<string>();
  const isLeader = (val: any) => {
    const s = String(val ?? "").toLowerCase();
    return s === "admin" || s === "edit" || s === "leder" || s === "leader";
  };
  if (perms?.perOffer && typeof perms.perOffer === "object") {
    for (const [aid, map] of Object.entries<any>(perms.perOffer)) {
      if (map && typeof map === "object") {
        const lvl = map[myId]?.level ?? map[myId];
        if (isLeader(lvl)) out.add(String(aid));
      }
    }
  }
  if (perms?.byUser && typeof perms.byUser === "object") {
    const amap = perms.byUser[myId];
    if (amap && typeof amap === "object") {
      for (const [aid, lvl] of Object.entries<any>(amap)) {
        const lv = (lvl as any)?.level ?? lvl;
        if (isLeader(lv)) out.add(aid);
      }
    }
  }
  const arr: any[] = Array.isArray(perms?.entries) ? perms.entries : Array.isArray(perms) ? perms : [];
  for (const r of arr) {
    const uid = toStr(r?.memberId ?? r?.userId ?? r?.uid ?? r?.ownerId ?? r?.who ?? "");
    const aid = toStr(r?.activityId ?? r?.offerId ?? r?.resourceId ?? r?.id ?? "");
    const lv = r?.perm ?? r?.role ?? r?.level ?? r?.access ?? r?.type ?? "";
    if (uid && aid && uid === myId && isLeader(lv)) out.add(aid);
  }
  return Array.from(out);
}

export default function MyActivitiesDiagPage() {
  const supabase = createClientComponentClient();

  const [email, setEmail] = React.useState<string>("");
  const [displayName, setDisplayName] = React.useState<string>("");
  const [candidates, setCandidates] = React.useState<string[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [data, setData] = React.useState<any>(null);

  // Fix-panel state
  const [fixIds, setFixIds] = React.useState<string>("");

  const reloadDiag = async (force?: { email?: string; displayName?: string; candidates?: string[] }) => {
    const qs = new URLSearchParams();
    qs.set("email", (force?.email ?? email).trim());
    qs.set("displayName", (force?.displayName ?? displayName).trim());
    const cand = (force?.candidates ?? candidates).filter(Boolean);
    if (cand.length) qs.set("candidates", cand.join(","));
    const res = await fetch(`/api/dashboard/diag/my-activities?${qs.toString()}`);
    const j = await res.json();
    setData(j);
  };

  React.useEffect(() => {
    (async () => {
      setLoading(true);
      // identity from LS + session
      const members = parseJSON<AnyObj[]>(readLS(MEMBERS_KEY), []);
      const fb = parseJSON<AnyObj[]>(readLS(MEMBERS_FB), []);
      const allMembers = [...fb, ...members];
      const acts = parseJSON<AnyObj[]>(readLS(ACT_KEY), []);
      const perms = parseJSON<AnyObj>(readLS(PERMS_KEY), {});
      const session = await supabase.auth.getSession();
      const sessEmail = session.data.session?.user?.email || "";
      const lsEmail =
        parseJSON<string | null>(readLS("follies.currentEmail"), null) ||
        parseJSON<string | null>(readLS("follies.session.email"), null) ||
        "";
      const finalEmail = (sessEmail || lsEmail || "").trim();

      const currentId = parseJSON<string | null>(readLS("follies.currentMemberId"), null) || "";
      const meLS = currentId
        ? allMembers.find((m) => toStr(m?.id ?? m?.uuid ?? m?._id ?? m?.memberId) === currentId)
        : allMembers.find((m) => memberEmail(m)?.toLowerCase() === finalEmail.toLowerCase());

      const dn = meLS ? fullName(meLS) : "";
      setEmail(finalEmail);
      setDisplayName(dn);

      const myIdLS = currentId || "";
      const partIds = new Set(
        acts.filter((a) => isUserInActivity(a, { id: myIdLS, email: finalEmail })).map((a) => activityId(a))
      );
      const leaderIds = myIdLS ? new Set(leaderActivityIdsFromPerms(perms, myIdLS)) : new Set<string>();
      const cand = Array.from(new Set<string>([...partIds, ...leaderIds])).filter(Boolean);
      setCandidates(cand);

      await reloadDiag({ email: finalEmail, displayName: dn, candidates: cand });
      setLoading(false);
    })();
  }, [supabase]);

  // FIX: opprett/koble medlem
  const ensureMember = async () => {
    const res = await fetch("/api/dashboard/ensure-member", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, displayName, candidateActivityIds: candidates }),
    });
    const j = await res.json();
    if (j?.memberId) {
      writeLS("follies.currentMemberId", j.memberId);
      await reloadDiag();
      alert(`Koblet/laget memberId: ${j.memberId}`);
    } else {
      alert(j?.error || "Kunne ikke opprette/koble medlem.");
    }
  };

  // FIX: sett meg som LEADER for oppgitte IDs
  const makeLeader = async () => {
    const ids = fixIds
      .split(/[,\s]+/)
      .map((s) => s.trim())
      .filter(Boolean);
    if (!ids.length) {
      alert("Skriv inn minst én aktivitet-ID (komma- eller linje-separert).");
      return;
    }
    const res = await fetch("/api/dashboard/sync-enrollments", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, activityIds: ids, role: "leader" }),
    });
    const j = await res.json();
    if (res.ok && j?.ok) {
      await reloadDiag();
      alert(`Oppdatert påmeldinger: ${j.created || 0} nye, ${j.updated || 0} endret.`);
    } else {
      alert(j?.error || "Kunne ikke oppdatere påmeldinger.");
    }
  };

  return (
    <main className="mx-auto max-w-6xl px-4 py-8 text-neutral-900">
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-2xl font-bold">Diagnostikk: Mine aktiviteter</h1>
        <Link href="/admin" className="rounded-lg bg-white px-3 py-1.5 text-sm font-semibold text-neutral-900 ring-1 ring-neutral-300 hover:bg-neutral-100">
          Tilbake til admin
        </Link>
      </div>

      {/* Fix-panelet */}
      <section className="mb-6 rounded-2xl bg-white p-5 shadow-sm ring-1 ring-black/5">
        <h2 className="text-lg font-semibold">Fix nå</h2>
        <div className="mt-3 grid gap-4 md:grid-cols-2">
          <div>
            <div className="text-sm text-neutral-600">Innlogget e-post</div>
            <div className="font-mono text-sm">{email || "—"}</div>
          </div>
          <div>
            <div className="text-sm text-neutral-600">Navn</div>
            <div className="font-mono text-sm">{displayName || "—"}</div>
          </div>
          <div className="md:col-span-2">
            <button
              onClick={ensureMember}
              className="rounded-lg bg-black px-3.5 py-2 text-sm font-semibold text-white hover:bg-neutral-800"
            >
              Opprett / koble medlem for denne e-posten
            </button>
          </div>
          <div className="md:col-span-2">
            <label className="block text-sm text-neutral-700 mb-1">Aktivitet-IDer (komma/linje-separert) – gjør meg til leder</label>
            <textarea
              rows={3}
              value={fixIds}
              onChange={(e) => setFixIds(e.target.value)}
              placeholder="f.eks. e50c6b81-4243-4041-886f-3aeb1924a161, 62052a7d-a0f2-4afe-ab16-6a59b17ed608"
              className="w-full rounded-lg border border-neutral-300 bg-white px-3 py-2 text-sm"
            />
            <div className="mt-2">
              <button
                onClick={makeLeader}
                className="rounded-lg bg-red-600 px-3.5 py-2 text-sm font-semibold text-white hover:bg-red-700"
              >
                Gjør meg til leder
              </button>
            </div>
          </div>
        </div>
      </section>

      {/* Inndata */}
      <section className="rounded-2xl bg-white p-5 shadow-sm ring-1 ring-black/5">
        <h2 className="text-lg font-semibold">Inndata</h2>
        <div className="mt-3 grid gap-3 md:grid-cols-2">
          <div>
            <div className="text-sm text-neutral-600">E-post</div>
            <div className="font-mono text-sm">{email || "—"}</div>
          </div>
          <div>
            <div className="text-sm text-neutral-600">Navn (fra LS)</div>
            <div className="font-mono text-sm">{displayName || "—"}</div>
          </div>
          <div className="md:col-span-2">
            <div className="text-sm text-neutral-600">Kandidat-aktiviteter (LS: participants + leder-perms)</div>
            {candidates.length ? (
              <div className="mt-1 flex flex-wrap gap-2">
                {candidates.map((id) => (
                  <span key={id} className="rounded-full bg-neutral-100 px-2 py-0.5 text-xs ring-1 ring-neutral-200 font-mono">
                    {id}
                  </span>
                ))}
              </div>
            ) : (
              <div className="font-mono text-sm">—</div>
            )}
          </div>
        </div>
      </section>

      {/* Resultat */}
      <section className="mt-6 rounded-2xl bg-white p-5 shadow-sm ring-1 ring-black/5">
        <h2 className="text-lg font-semibold">Resultat</h2>
        {loading ? (
          <div className="mt-3">Laster…</div>
        ) : !data ? (
          <div className="mt-3 text-red-700">Ingen data.</div>
        ) : (
          <>
            <div className="mt-3 grid gap-3 md:grid-cols-3">
              <div>
                <div className="text-sm text-neutral-600">Member via e-post</div>
                <div className="font-mono text-sm">{data?.memberByEmail?.id || "—"}</div>
              </div>
              <div>
                <div className="text-sm text-neutral-600">Member via navn (antall)</div>
                <div className="font-mono text-sm">{Array.isArray(data?.membersByName) ? data.membersByName.length : 0}</div>
              </div>
              <div>
                <div className="text-sm text-neutral-600">Member via enrollments (kandidater)</div>
                <div className="font-mono text-sm">{data?.memberFromEnrollments?.member_id || "—"}</div>
              </div>
              <div>
                <div className="text-sm text-neutral-600">Valgt memberId</div>
                <div className="font-mono text-sm">{data?.chosenMemberId || "—"}</div>
              </div>
              <div>
                <div className="text-sm text-neutral-600">Enrollments (antall)</div>
                <div className="font-mono text-sm">{Array.isArray(data?.enrollments) ? data.enrollments.length : 0}</div>
              </div>
              <div>
                <div className="text-sm text-neutral-600">Aktiviteter (antall)</div>
                <div className="font-mono text-sm">{Array.isArray(data?.activities) ? data.activities.length : 0}</div>
              </div>
            </div>

            {/* Aktiviteter */}
            <div className="mt-6">
              <h3 className="text-sm font-semibold">Aktiviteter</h3>
              {Array.isArray(data?.activities) && data.activities.length ? (
                <ul className="mt-2 divide-y">
                  {data.activities.map((a: any) => (
                    <li key={a.id} className="py-2 flex items-center justify-between">
                      <div>
                        <div className="font-medium">{a.name}</div>
                        <div className="text-xs text-neutral-600">ID: <span className="font-mono">{a.id}</span> · Type: {a.type || "—"} {a.archived ? "· Arkivert" : ""}</div>
                      </div>
                      <Link
                        href={`/activities/${encodeURIComponent(String(a.id))}`}
                        className="rounded-lg bg-white px-3 py-1.5 text-sm font-semibold text-neutral-900 ring-1 ring-neutral-300 hover:bg-neutral-100"
                      >
                        Åpne
                      </Link>
                    </li>
                  ))}
                </ul>
              ) : (
                <div className="mt-1 text-sm text-neutral-700">Ingen aktiviteter returnert.</div>
              )}
            </div>

            {/* Enrollments rå */}
            <div className="mt-6">
              <h3 className="text-sm font-semibold">Enrollments (rå)</h3>
              {Array.isArray(data?.enrollments) && data.enrollments.length ? (
                <pre className="mt-2 overflow-auto rounded-lg bg-neutral-50 p-3 text-xs ring-1 ring-neutral-200">
{JSON.stringify(data.enrollments, null, 2)}
                </pre>
              ) : (
                <div className="mt-1 text-sm text-neutral-700">Ingen enrollments funnet for valgt member.</div>
              )}
            </div>

            {/* Notater */}
            {Array.isArray(data?.notes) && data.notes.length ? (
              <div className="mt-6">
                <h3 className="text-sm font-semibold text-red-700">Notater</h3>
                <ul className="mt-2 list-disc pl-5 text-sm text-neutral-800">
                  {data.notes.map((n: string, i: number) => (
                    <li key={i}>{n}</li>
                  ))}
                </ul>
              </div>
            ) : null}

            {/* Rådata */}
            <details className="mt-6">
              <summary className="cursor-pointer text-sm font-semibold">Vis rådata</summary>
              <pre className="mt-2 overflow-auto rounded-lg bg-neutral-50 p-3 text-xs ring-1 ring-neutral-200">
{JSON.stringify(data, null, 2)}
              </pre>
            </details>
          </>
        )}
      </section>
    </main>
  );
}
