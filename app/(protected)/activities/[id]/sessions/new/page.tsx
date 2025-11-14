// SNAPSHOT: 2025-08-31 – Follies Ansattportal
// Fiks: “Ny økt” blandet ledere/deltakere i manuell målgruppe.
// Løsning: Bruk SAMME kilde som ellers i appen → getLeaders/getParticipants (DB-first).
//          Robuste LS-fallbacks beholdt. Ingen designendring (kun logikk).

"use client";

import { useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { createClientComponentClient } from "@/lib/supabase/browser";
import { getLeaders, getParticipants } from "@/lib/enrollmentsClient"; // ← samme som aktivitets-sidene

type AnyObj = Record<string, any>;

const SESS_LS = "follies.activitySessions.v1";
const CAL_LS  = "follies.calendar.v1";
const MEM_LS  = "follies.members.v1";
const ACT_V1  = "follies.activities.v1";
const ACT_FB  = "follies.activities";
const ENR_V1  = "follies.enrollments.v1";
const PERMS_LS= "follies.perms.v1";

const INPUT =
  "w-full rounded-lg border border-neutral-300 bg-white px-3 py-2 text-sm text-neutral-900 " +
  "placeholder:text-neutral-500 focus:outline-none focus:ring-2 focus:ring-red-600";
const TEXTAREA = INPUT;

const safeJSON = <T,>(s: string | null): T | null => { try { return s ? (JSON.parse(s) as T) : null; } catch { return null; } };
const S = (v:any)=>String(v ?? "");

/* ------------------------------ Helpers ------------------------------ */
function loadActivityName(aid: string): string {
  const v1 = safeJSON<any[]>(localStorage.getItem(ACT_V1)) ?? [];
  const old= safeJSON<any[]>(localStorage.getItem(ACT_FB)) ?? [];
  const all= [...old, ...v1];
  const hit= all.find(a => S(a?.id ?? a?.uuid ?? a?._id) === S(aid));
  return hit ? (hit.name || hit.title || hit.navn || "Aktivitet") : "Aktivitet";
}
function uniqById(list: AnyObj[]): AnyObj[] {
  const map = new Map<string, AnyObj>();
  for (const m of list) {
    const id = S(m?.id ?? m?.uuid ?? m?.memberId ?? m?._id);
    if (id) map.set(id, m);
  }
  return Array.from(map.values());
}
function membersIndex(): Record<string, AnyObj> {
  const ms = safeJSON<any[]>(localStorage.getItem(MEM_LS)) ?? [];
  const idx: Record<string, AnyObj> = {};
  for (const m of ms) idx[S(m?.id ?? m?.uuid ?? m?.memberId ?? m?._id)] = m;
  return idx;
}
function extractIds(maybe: any): string[] {
  const out: string[] = [];
  if (!maybe) return out;
  const push = (v:any) => { const s=S(v); if (s) out.push(s); };
  if (Array.isArray(maybe)) {
    for (const it of maybe) {
      if (typeof it === "string" || typeof it === "number") push(it);
      else if (it && typeof it === "object") push(it.id ?? it.uuid ?? it.memberId ?? it._id ?? it.email ?? it.epost ?? it.mail);
    }
  } else if (typeof maybe === "object") {
    push(maybe.id ?? maybe.uuid ?? maybe.memberId ?? maybe._id);
  }
  return out.filter(Boolean);
}
function leaderIdsFromPerms(activityId: string): Set<string> {
  const raw = safeJSON<any>(localStorage.getItem(PERMS_LS)) ?? null;
  const wanted = new Set<string>();
  if (!raw || typeof raw !== "object") return wanted;
  const isLeader = (val:any) => ["admin","edit","leder","leader"].includes(String(val ?? "").toLowerCase());

  if (raw.perOffer && typeof raw.perOffer === "object") {
    const map = raw.perOffer[S(activityId)];
    if (map && typeof map === "object") {
      for (const [uid, lvl] of Object.entries<any>(map)) {
        const level = (lvl as any)?.level ?? lvl;
        if (isLeader(level)) wanted.add(S(uid));
      }
    }
  }
  if (raw.byUser && typeof raw.byUser === "object") {
    for (const [uid, amap] of Object.entries<any>(raw.byUser)) {
      const level = (amap as any)[S(activityId)];
      const v = (level as any)?.level ?? level;
      if (isLeader(v)) wanted.add(S(uid));
    }
  }
  const arr: any[] = Array.isArray(raw) ? raw : Array.isArray(raw?.entries) ? raw.entries : [];
  for (const r of arr) {
    const aid = S(r?.activityId ?? r?.offerId ?? r?.resourceId ?? r?.id ?? "");
    if (aid !== S(activityId)) continue;
    const uid = S(r?.memberId ?? r?.userId ?? r?.uid ?? r?.ownerId ?? r?.who ?? "");
    const lvl = r?.perm ?? r?.role ?? r?.level ?? r?.access ?? r?.type ?? "";
    if (uid && isLeader(lvl)) wanted.add(uid);
  }
  return wanted;
}

/** ROBUST SPLITT for LS når DB ikke svarer – array|map + akt.felter + perms */
function lsSplitRoles(activityId: string): { leaders: AnyObj[]; participants: AnyObj[] } {
  const idx = membersIndex();
  let leaderIds = new Set<string>();
  let partIds   = new Set<string>();

  // enrollments – array
  const enrRaw = safeJSON<any>(localStorage.getItem(ENR_V1));
  if (Array.isArray(enrRaw)) {
    for (const r of enrRaw) {
      if (S(r?.activity_id) !== S(activityId)) continue;
      const mid = S(r?.member_id);
      const role = String(r?.role ?? "").toLowerCase();
      if (!mid) continue;
      if (role === "leader" || role === "leder") leaderIds.add(mid);
      else partIds.add(mid);
    }
  } else if (enrRaw && typeof enrRaw === "object") {
    // enrollments – map pr aktivitet
    const bucket = enrRaw[S(activityId)];
    if (bucket && typeof bucket === "object") {
      for (const id of extractIds(bucket.leaders ?? bucket.ledere))      leaderIds.add(S(id));
      for (const id of extractIds(bucket.participants ?? bucket.deltakere ?? bucket.deltagere)) partIds.add(S(id));
    }
  }

  // aktivitetens egne felter (norske alias) hvis vi fortsatt mangler
  if (leaderIds.size === 0 && partIds.size === 0) {
    const v1  = safeJSON<any[]>(localStorage.getItem(ACT_V1)) ?? [];
    const old = safeJSON<any[]>(localStorage.getItem(ACT_FB)) ?? [];
    const all = [...old, ...v1];
    const hit = all.find(a => S(a?.id ?? a?.uuid ?? a?._id) === S(activityId));
    if (hit && typeof hit === "object") {
      const l = extractIds(hit.leaders ?? hit.ledere);
      const p = extractIds(hit.participants ?? hit.deltakere ?? hit.deltagere ?? hit.paameldte ?? hit["påmeldte"] ?? hit.members);
      for (const id of l) leaderIds.add(S(id));
      for (const id of p) partIds.add(S(id));
    }
  }

  // perms kan gjøre noen til leder selv uten enrollment
  for (const id of leaderIdsFromPerms(activityId)) leaderIds.add(id);

  // leder vinner over deltaker
  for (const id of leaderIds) if (partIds.has(id)) partIds.delete(id);

  const leaders = Array.from(leaderIds).map(id => idx[id]).filter(Boolean);
  const participants = Array.from(partIds).map(id => idx[id]).filter(Boolean);
  return { leaders: uniqById(leaders), participants: uniqById(participants) };
}

/* ------------------------------- Side ------------------------------- */
export default function NewSessionPage() {
  const { id: activityId } = useParams() as { id: string };
  const router = useRouter();
  const supabase = createClientComponentClient();

  // Meta
  const [activityName, setActivityName] = useState<string>("Aktivitet");
  const [leaders, setLeaders] = useState<AnyObj[]>([]);
  const [participants, setParticipants] = useState<AnyObj[]>([]);
  const [loading, setLoading] = useState(true);

  // Skjema
  const [title, setTitle] = useState("");
  const [date, setDate] = useState<string>("");
  const [time, setTime] = useState<string>("");
  const [duration, setDuration] = useState<number>(90);
  const [location, setLocation] = useState<string>("");
  const [note, setNote] = useState<string>("");

  const [aud, setAud] = useState<"all" | "custom">("all");

  // separate selection-maps (hver liste for seg)
  const [selLeaders, setSelLeaders] = useState<Record<string, boolean>>({});
  const [selParts, setSelParts]     = useState<Record<string, boolean>>({});

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        setLoading(true);
        setActivityName(loadActivityName(S(activityId)));

        // 1) DB-first – BRUK SAMME FUNKSJONER SOM ANDRE SIDER
        try {
          const [L, P] = await Promise.all([
            getLeaders(String(activityId)),      // ← samme kilde som aktivitets-sidene
            getParticipants(String(activityId)),
          ]);
          const leadersClean = uniqById(L || []);
          const leaderSet    = new Set(leadersClean.map(m => S(m?.id)));
          const partsClean   = uniqById((P || []).filter((p:any) => !leaderSet.has(S(p?.id))));

          setLeaders(leadersClean);
          setParticipants(partsClean);
        } catch {
          // 2) LS-fallback – robust
          const ls = lsSplitRoles(String(activityId));
          setLeaders(ls.leaders);
          setParticipants(ls.participants);
        }

        setSelLeaders({});
        setSelParts({});
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => { alive = false; };
  }, [activityId]);

  // "Alle" = union av rene lister
  const allTargetIds = useMemo(() => {
    const L = leaders.map(m => S(m.id));
    const P = participants.map(m => S(m.id));
    return Array.from(new Set([...L, ...P]));
  }, [leaders, participants]);

  const onSave = () => {
    if (!title || !date || !time) { alert("Fyll ut tittel, dato og tid."); return; }
    const start = new Date(`${date}T${time}:00`);
    const end   = new Date(start.getTime() + duration * 60000);

    let targets: string[] = [];
    if (aud === "all") {
      targets = allTargetIds;
      if (targets.length === 0) { alert("Ingen målgruppe funnet."); return; }
    } else {
      const chosenLeaders = leaders.map(m => S(m.id)).filter(id => !!selLeaders[id]);
      const chosenParts   = participants.map(m => S(m.id)).filter(id => !!selParts[id]);
      targets = Array.from(new Set([...chosenLeaders, ...chosenParts]));
      if (targets.length === 0) { alert("Velg minst én mottaker."); return; }
    }

    // 1) sessions LS
    const sess = {
      id: crypto.randomUUID(),
      activity_id: S(activityId),
      title,
      start: start.toISOString(),
      end: end.toISOString(),
      location: location || null,
      note: note || null,
      targets,
    };
    const map = safeJSON<Record<string, any[]>>(localStorage.getItem(SESS_LS)) ?? {};
    map[S(activityId)] = [sess, ...(map[S(activityId)] ?? [])];
    localStorage.setItem(SESS_LS, JSON.stringify(map));

    // 2) kalender LS (med session_id for klikk i kalenderen)
    const cal = safeJSON<any[]>(localStorage.getItem(CAL_LS)) ?? [];
    for (const mid of targets) {
      cal.unshift({
        id: crypto.randomUUID(),
        member_id: S(mid),
        title: `${activityName}: ${title}`,
        start: start.toISOString(),
        end: end.toISOString(),
        source: "session",
        activity_id: S(activityId),
        session_id: sess.id,
      });
    }
    localStorage.setItem(CAL_LS, JSON.stringify(cal));

    router.push(`/sessions/${encodeURIComponent(sess.id)}`);
  };

  if (loading) return <main className="mx-auto max-w-6xl px-4 py-8 text-neutral-900">Laster…</main>;

  return (
    <main className="mx-auto max-w-6xl px-4 py-8 text-neutral-900 space-y-6">
      {/* HERO */}
      <div className="rounded-2xl ring-1 ring-black/10 bg-gradient-to-r from-black via-red-800 to-red-600 text-white p-5">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-semibold">Ny økt – {activityName}</h1>
            <p className="text-white/90 text-sm">Fyll inn tid, sted, plan og målgruppe.</p>
          </div>
          <Link
            href={`/activities/${encodeURIComponent(S(activityId))}`}
            className="rounded-md bg-white px-3 py-1.5 text-sm font-semibold text-neutral-900 hover:bg-neutral-100 ring-1 ring-white/40"
          >
            Tilbake
          </Link>
        </div>
      </div>

      {/* Tid / sted / plan */}
      <section className="rounded-2xl bg-white p-6 shadow-sm ring-1 ring-neutral-200">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <label className="block">
            <div className="mb-1 text-sm font-medium text-neutral-900">Tittel <span className="text-red-600">*</span></div>
            <input value={title} onChange={(e)=>setTitle(e.target.value)} className={INPUT} placeholder="Øving – Scene 3" />
          </label>
          <label className="block">
            <div className="mb-1 text-sm font-medium text-neutral-900">Sted</div>
            <input value={location} onChange={(e)=>setLocation(e.target.value)} className={INPUT} placeholder="Hovedsal / Ute / …" />
          </label>
          <label className="block">
            <div className="mb-1 text-sm font-medium text-neutral-900">Dato <span className="text-red-600">*</span></div>
            <input type="date" value={date} onChange={(e)=>setDate(e.target.value)} className={INPUT} />
          </label>
          <label className="block">
            <div className="mb-1 text-sm font-medium text-neutral-900">Tid <span className="text-red-600">*</span></div>
            <input type="time" value={time} onChange={(e)=>setTime(e.target.value)} className={INPUT} />
          </label>
          <label className="block">
            <div className="mb-1 text-sm font-medium text-neutral-900">Varighet (minutter)</div>
            <input type="number" min={15} max={480} value={duration} onChange={(e)=>setDuration(Number(e.target.value))} className={INPUT} />
          </label>

          <label className="block md:col-span-2">
            <div className="mb-1 text-sm font-medium text-neutral-900">Beskrivelse / plan</div>
            <textarea rows={5} value={note} onChange={(e)=>setNote(e.target.value)} className={TEXTAREA} placeholder={`Hva skjer i økten?\n– Oppmøte kl …\n– Øver: side 5–6\n– Etterpå: …\n– Husk: …`} />
          </label>
        </div>
      </section>

      {/* Målgruppe */}
      <section className="rounded-2xl bg-white p-6 shadowsm ring-1 ring-neutral-200">
        <div className="text-sm font-semibold text-neutral-900 mb-2">Målgruppe</div>
        <div className="flex flex-wrap gap-4 text-neutral-900">
          <label className="inline-flex items-center gap-2">
            <input type="radio" checked={aud==="all"} onChange={()=>setAud("all")} />
            <span>Alle (ledere + deltakere)</span>
          </label>
          <label className="inline-flex items-center gap-2">
            <input type="radio" checked={aud==="custom"} onChange={()=>setAud("custom")} />
            <span>Velg manuelt</span>
          </label>
        </div>

        {aud==="custom" && (
          <div className="mt-4 grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Ledere */}
            <div className="rounded-xl border border-neutral-200 p-3">
              <div className="font-semibold mb-2 text-neutral-900">
                Ledere <span className="text-xs text-neutral-600">({leaders.length})</span>
              </div>
              {leaders.length === 0 ? (
                <div className="text-sm text-neutral-600">Ingen funnet.</div>
              ) : (
                <ul className="space-y-1">
                  {leaders.map((p) => {
                    const pid = S(p?.id);
                    const name = `${p.first_name || ""} ${p.last_name || ""}`.trim() || "Uten navn";
                    return (
                      <li key={pid} className="flex items-center gap-2">
                        <input type="checkbox" checked={!!selLeaders[pid]} onChange={() => setSelLeaders(s => ({ ...s, [pid]: !s[pid] }))} />
                        <span className="text-sm text-neutral-900">{name}</span>
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>

            {/* Deltakere */}
            <div className="rounded-xl border border-neutral-200 p-3 max-h-64 overflow-auto pr-1">
              <div className="font-semibold mb-2 text-neutral-900">
                Deltakere <span className="text-xs text-neutral-600">({participants.length})</span>
              </div>
              {participants.length === 0 ? (
                <div className="text-sm text-neutral-600">Ingen funnet.</div>
              ) : (
                <ul className="space-y-1">
                  {participants.map((p) => {
                    const pid = S(p?.id);
                    const name = `${p.first_name || ""} ${p.last_name || ""}`.trim() || "Uten navn";
                    return (
                      <li key={pid} className="flex items-center gap-2">
                        <input type="checkbox" checked={!!selParts[pid]} onChange={() => setSelParts(s => ({ ...s, [pid]: !s[pid] }))} />
                        <span className="text-sm text-neutral-900">{name}</span>
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
          </div>
        )}
      </section>

      {/* Handlinger */}
      <div className="flex items-center gap-2">
        <button onClick={onSave} className="rounded-lg bg-red-600 px-4 py-2 text-sm font-semibold text-white hover:bg-red-700">
          Lagre økt
        </button>
        <Link href={`/activities/${encodeURIComponent(S(activityId))}`} className="rounded-lg bg-white px-4 py-2 text-sm font-semibold text-neutral-900 ring-1 ring-neutral-300 hover:bg-neutral-100">
          Avbryt
        </Link>
      </div>
    </main>
  );
}
