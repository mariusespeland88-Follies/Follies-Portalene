// PATH: app/(protected)/sessions/[id]/page.tsx
"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { createClientComponentClient } from "@/lib/supabase/browser";

type AnyObj = Record<string, any>;

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

function bytesToNice(n?: number | null) {
  const v = Number(n ?? 0);
  if (!Number.isFinite(v) || v <= 0) return "—";
  const units = ["B", "KB", "MB", "GB"];
  let i = 0;
  let val = v;
  while (val >= 1024 && i < units.length - 1) {
    val /= 1024;
    i++;
  }
  return `${val.toFixed(i === 0 ? 0 : 1)} ${units[i]}`;
}

function filenameFromPath(path?: string | null) {
  const p = String(path ?? "");
  const parts = p.split("/").filter(Boolean);
  return parts[parts.length - 1] || p || "fil";
}

export default function SessionPage() {
  const params = useParams();
  const router = useRouter();
  const supabase = useMemo(() => createClientComponentClient(), []);

  const sessionId = useMemo(() => {
    const raw = Array.isArray((params as any)?.id)
      ? (params as any).id[0]
      : (params as any)?.id;
    return raw ? String(raw) : "";
  }, [params]);

  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  const [session, setSession] = useState<any>(null);
  const [targetIds, setTargetIds] = useState<string[]>([]);
  const [targetMembers, setTargetMembers] = useState<any[]>([]);
  const [leaders, setLeaders] = useState<any[]>([]);
  const [participants, setParticipants] = useState<any[]>([]);

  // Nytt: Økt-deltakere (B) + filer
  const [myMemberId, setMyMemberId] = useState<string | null>(null);
  const [isLeader, setIsLeader] = useState(false);

  const [spLoading, setSpLoading] = useState(false);
  const [spErr, setSpErr] = useState<string | null>(null);
  const [sessionPeople, setSessionPeople] = useState<
    { member_id: string; name: string; email?: string | null; status?: string | null }[]
  >([]);

  const [filesLoading, setFilesLoading] = useState(false);
  const [filesErr, setFilesErr] = useState<string | null>(null);
  const [files, setFiles] = useState<
    {
      id: string;
      name: string;
      storage_path: string;
      mime_type?: string | null;
      size_bytes?: number | null;
      created_at?: string | null;
    }[]
  >([]);

  const [uploading, setUploading] = useState(false);

  // UI: “legg til personer”
  const [pickerOpen, setPickerOpen] = useState(false);
  const [pickerQ, setPickerQ] = useState("");
  const [picked, setPicked] = useState<Record<string, boolean>>({});
  const [busyAction, setBusyAction] = useState<string | null>(null);

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

  const resolveMyMemberIdAndLeader = async (activityId: string) => {
    try {
      const { data: u } = await supabase.auth.getUser();
      const email = u?.user?.email ?? null;
      if (!email) {
        setMyMemberId(null);
        setIsLeader(false);
        return;
      }

      const { data: m, error: mErr } = await supabase
        .from("members")
        .select("id")
        .ilike("email", email)
        .maybeSingle();

      if (mErr || !m?.id) {
        setMyMemberId(null);
        setIsLeader(false);
        return;
      }

      const mid = String(m.id);
      setMyMemberId(mid);

      const { data: enr, error: eErr } = await supabase
        .from("enrollments")
        .select("role")
        .eq("activity_id", activityId)
        .eq("member_id", mid)
        .maybeSingle();

      if (eErr) {
        setIsLeader(false);
        return;
      }

      setIsLeader(String((enr as any)?.role ?? "").toLowerCase() === "leader");
    } catch {
      setMyMemberId(null);
      setIsLeader(false);
    }
  };

  const loadSessionParticipants = async () => {
    if (!sessionId) return;
    setSpLoading(true);
    setSpErr(null);
    try {
      // Hent session_participants
      const { data: sp, error: spE } = await supabase
        .from("session_participants")
        .select("member_id, status, created_at")
        .eq("session_id", sessionId);

      if (spE) throw spE;

      const ids = Array.from(
        new Set((sp || []).map((r: any) => String(r?.member_id)).filter(Boolean))
      );

      if (ids.length === 0) {
        setSessionPeople([]);
        return;
      }

      // Hent members for navn/e-post
      const { data: ms, error: mE } = await supabase
        .from("members")
        .select("id, first_name, last_name, email")
        .in("id", ids);

      if (mE) throw mE;

      const memberMap = new Map<string, AnyObj>();
      for (const m of ms || []) memberMap.set(String((m as any).id), m as any);

      const joined = (sp || [])
        .map((r: any) => {
          const mid = String(r?.member_id ?? "");
          const m = memberMap.get(mid);
          const name =
            `${m?.first_name ?? ""} ${m?.last_name ?? ""}`.trim() ||
            (m?.email ? String(m.email) : "") ||
            "Uten navn";
          return {
            member_id: mid,
            name,
            email: m?.email ?? null,
            status: r?.status ?? null,
          };
        })
        .sort((a, b) => a.name.localeCompare(b.name, "nb"));

      setSessionPeople(joined);
    } catch (e: any) {
      setSpErr(String(e?.message ?? e));
    } finally {
      setSpLoading(false);
    }
  };

  const loadSessionFiles = async () => {
    if (!sessionId) return;
    setFilesLoading(true);
    setFilesErr(null);
    try {
      const { data, error } = await supabase
        .from("session_files")
        .select("id, name, storage_path, mime_type, size_bytes, created_at")
        .eq("session_id", sessionId)
        .order("created_at", { ascending: false });

      if (error) throw error;
      setFiles((data || []) as any);
    } catch (e: any) {
      setFilesErr(String(e?.message ?? e));
    } finally {
      setFilesLoading(false);
    }
  };

  useEffect(() => {
    void refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionId]);

  // Når session er lastet → finn hvem jeg er + leader + last inn participants/files
  useEffect(() => {
    if (!session?.activity_id) return;
    (async () => {
      await resolveMyMemberIdAndLeader(String(session.activity_id));
      await Promise.all([loadSessionParticipants(), loadSessionFiles()]);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session?.activity_id, sessionId]);

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

      router.push(`/activities/${encodeURIComponent(S(session.activity_id))}`);
    } catch (e: any) {
      alert(`Kunne ikke slette: ${String(e?.message ?? e)}`);
    }
  };

  const onCopyFromActivity = async () => {
    if (!isLeader) {
      alert("Kun ledere kan kopiere målgruppe til økta.");
      return;
    }
    if (!session?.activity_id) return;

    setBusyAction("copy");
    try {
      // Hent enrollments for aktiviteten (alle roller)
      const { data: enr, error: eErr } = await supabase
        .from("enrollments")
        .select("member_id")
        .eq("activity_id", String(session.activity_id));

      if (eErr) throw eErr;

      const ids = Array.from(
        new Set((enr || []).map((r: any) => String(r?.member_id)).filter(Boolean))
      );
      if (ids.length === 0) {
        alert("Fant ingen påmeldte i aktiviteten.");
        return;
      }

      // Insert (on conflict do nothing) håndteres av unique(session_id, member_id)
      const rows = ids.map((member_id) => ({
        session_id: sessionId,
        member_id,
        status: "invited",
      }));

      const { error: insErr } = await supabase
        .from("session_participants")
        .insert(rows);

      // Hvis noen allerede finnes → insert kan feile på conflict i noen setup.
      // Da gjør vi en fallback per person (robust).
      if (insErr) {
        // fallback: insert én-og-én og ignorer conflict-ish feil
        for (const r of rows) {
          // eslint-disable-next-line no-await-in-loop
          const { error } = await supabase.from("session_participants").insert(r);
          // ignorer typiske "duplicate key" meldinger
          if (error && !String(error.message || "").toLowerCase().includes("duplicate")) {
            throw error;
          }
        }
      }

      await loadSessionParticipants();
    } catch (e: any) {
      alert(`Kunne ikke kopiere fra aktivitet: ${String(e?.message ?? e)}`);
    } finally {
      setBusyAction(null);
    }
  };

  const onRemoveFromSession = async (memberId: string) => {
    if (!isLeader) {
      alert("Kun ledere kan fjerne personer fra økta.");
      return;
    }
    setBusyAction(`rm:${memberId}`);
    try {
      const { error } = await supabase
        .from("session_participants")
        .delete()
        .eq("session_id", sessionId)
        .eq("member_id", memberId);

      if (error) throw error;
      await loadSessionParticipants();
    } catch (e: any) {
      alert(`Kunne ikke fjerne: ${String(e?.message ?? e)}`);
    } finally {
      setBusyAction(null);
    }
  };

  const openPicker = () => {
    if (!isLeader) {
      alert("Kun ledere kan legge til personer på økta.");
      return;
    }
    setPicked({});
    setPickerQ("");
    setPickerOpen(true);
  };

  const activityRoster = useMemo(() => {
    // Bruk de listene du allerede får fra /api/sessions/get (navn finnes)
    const all = [...(leaders || []), ...(participants || [])];
    const map = new Map<string, any>();
    for (const m of all) {
      const id = S(m?.id);
      if (!id) continue;
      const name = S(m?.name) || S(m?.email) || "Uten navn";
      map.set(id, { id, name, email: m?.email ?? null });
    }
    return Array.from(map.values()).sort((a, b) =>
      String(a?.name ?? "").localeCompare(String(b?.name ?? ""), "nb")
    );
  }, [leaders, participants]);

  const rosterFiltered = useMemo(() => {
    const q = pickerQ.trim().toLowerCase();
    if (!q) return activityRoster;
    return activityRoster.filter((m) => String(m?.name ?? "").toLowerCase().includes(q));
  }, [activityRoster, pickerQ]);

  const alreadyInSession = useMemo(() => {
    const set = new Set(sessionPeople.map((p) => p.member_id));
    return set;
  }, [sessionPeople]);

  const onAddPicked = async () => {
    if (!isLeader) return;
    const ids = Object.entries(picked)
      .filter(([_, v]) => !!v)
      .map(([k]) => k);

    const toAdd = ids.filter((id) => !alreadyInSession.has(id));
    if (toAdd.length === 0) {
      setPickerOpen(false);
      return;
    }

    setBusyAction("add");
    try {
      // insert én og én for robusthet
      for (const mid of toAdd) {
        // eslint-disable-next-line no-await-in-loop
        const { error } = await supabase.from("session_participants").insert({
          session_id: sessionId,
          member_id: mid,
          status: "invited",
        });
        if (error && !String(error.message || "").toLowerCase().includes("duplicate")) {
          throw error;
        }
      }
      await loadSessionParticipants();
      setPickerOpen(false);
    } catch (e: any) {
      alert(`Kunne ikke legge til: ${String(e?.message ?? e)}`);
    } finally {
      setBusyAction(null);
    }
  };

  const onUploadFile = async (file: File) => {
    if (!isLeader) {
      alert("Kun ledere kan laste opp filer.");
      return;
    }
    if (!file) return;

    setUploading(true);
    setFilesErr(null);

    try {
      const safeName = file.name.replace(/[^\w.\-() ]+/g, "_");
      const unique = crypto.randomUUID();
      const path = `sessions/${sessionId}/${unique}-${safeName}`;

      const { error: upErr } = await supabase.storage
        .from("session-files")
        .upload(path, file, {
          upsert: false,
          contentType: file.type || undefined,
          cacheControl: "3600",
        });

      if (upErr) throw upErr;

      const { error: dbErr } = await supabase.from("session_files").insert({
        session_id: sessionId,
        uploader_member_id: myMemberId,
        name: file.name || filenameFromPath(path),
        storage_path: path,
        mime_type: file.type || null,
        size_bytes: file.size || null,
      });

      if (dbErr) throw dbErr;

      await loadSessionFiles();
    } catch (e: any) {
      setFilesErr(String(e?.message ?? e));
    } finally {
      setUploading(false);
    }
  };

  const onDownloadFile = async (storagePath: string) => {
    try {
      // Signed URL funker både private/public
      const { data, error } = await supabase.storage
        .from("session-files")
        .createSignedUrl(storagePath, 60 * 30);

      if (error) throw error;
      const url = data?.signedUrl;
      if (!url) throw new Error("Kunne ikke lage nedlastingslenke.");

      window.open(url, "_blank", "noopener,noreferrer");
    } catch (e: any) {
      alert(`Kunne ikke laste ned: ${String(e?.message ?? e)}`);
    }
  };

  const onDeleteFile = async (fileRow: { id: string; storage_path: string; name: string }) => {
    if (!isLeader) {
      alert("Kun ledere kan slette filer.");
      return;
    }
    if (!confirm(`Slette fila "${fileRow.name}"?`)) return;

    setBusyAction(`delFile:${fileRow.id}`);
    try {
      const { error: stErr } = await supabase.storage
        .from("session-files")
        .remove([fileRow.storage_path]);

      // Ikke stopp om storage allerede er borte – men kast hvis det er “ekte” feil
      if (stErr && !String(stErr.message || "").toLowerCase().includes("not found")) {
        throw stErr;
      }

      const { error: dbErr } = await supabase
        .from("session_files")
        .delete()
        .eq("id", fileRow.id);

      if (dbErr) throw dbErr;

      await loadSessionFiles();
    } catch (e: any) {
      alert(`Kunne ikke slette fil: ${String(e?.message ?? e)}`);
    } finally {
      setBusyAction(null);
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
  const subtitle = `${fmtNb(session.start_at)}${endTime ? ` – ${endTime}` : ""}${
    session.location ? ` · Sted: ${session.location}` : ""
  }`;

  const targetCount = targetIds.length;
  const targetLabel = targetCount === 0 ? "Alle påmeldte (standard)" : `${targetCount} valgt`;

  return (
    <div className="mx-auto max-w-3xl px-4 py-8">
      {/* Picker modal */}
      {pickerOpen ? (
        <div className="fixed inset-0 z-[80] bg-black/60 p-4">
          <div className="mx-auto mt-10 w-full max-w-2xl overflow-hidden rounded-2xl bg-white shadow-xl">
            <div className="flex items-center justify-between border-b border-neutral-200 px-4 py-3">
              <div className="font-semibold text-neutral-900">Legg til personer på økta</div>
              <button
                type="button"
                onClick={() => setPickerOpen(false)}
                className="rounded-lg px-3 py-1.5 text-sm font-semibold ring-1 ring-neutral-300 hover:bg-neutral-50"
              >
                Lukk
              </button>
            </div>

            <div className="p-4 space-y-3">
              <input
                value={pickerQ}
                onChange={(e) => setPickerQ(e.target.value)}
                placeholder="Søk navn…"
                className="w-full rounded-lg border border-neutral-300 bg-white px-3 py-2 text-sm text-neutral-900 placeholder:text-neutral-500 focus:outline-none focus:ring-2 focus:ring-red-600"
              />

              <div className="max-h-[50vh] overflow-auto rounded-xl border border-neutral-200">
                {rosterFiltered.length === 0 ? (
                  <div className="p-4 text-sm text-neutral-600">Ingen funnet.</div>
                ) : (
                  <ul className="divide-y divide-neutral-200">
                    {rosterFiltered.map((m) => {
                      const id = S(m.id);
                      const name = S(m.name) || "Uten navn";
                      const disabled = alreadyInSession.has(id);
                      const checked = !!picked[id];

                      return (
                        <li key={id} className="flex items-center justify-between gap-3 p-3">
                          <div className="min-w-0">
                            <div className="truncate text-sm font-medium text-neutral-900">{name}</div>
                            {m.email ? (
                              <div className="truncate text-xs text-neutral-600">{S(m.email)}</div>
                            ) : null}
                            {disabled ? (
                              <div className="text-xs text-green-700 mt-1">Allerede på økta</div>
                            ) : null}
                          </div>
                          <div>
                            <input
                              type="checkbox"
                              disabled={disabled}
                              checked={disabled ? true : checked}
                              onChange={() =>
                                setPicked((p) => ({ ...p, [id]: disabled ? true : !checked }))
                              }
                              className="h-4 w-4"
                            />
                          </div>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </div>

              <div className="flex flex-wrap items-center justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setPickerOpen(false)}
                  className="rounded-lg bg-white px-4 py-2 text-sm font-semibold text-neutral-900 ring-1 ring-neutral-300 hover:bg-neutral-100"
                >
                  Avbryt
                </button>
                <button
                  type="button"
                  onClick={onAddPicked}
                  disabled={busyAction === "add"}
                  className="rounded-lg bg-red-600 px-4 py-2 text-sm font-semibold text-white hover:bg-red-700 disabled:opacity-60"
                >
                  {busyAction === "add" ? "Legger til…" : "Legg til valgte"}
                </button>
              </div>
            </div>
          </div>
        </div>
      ) : null}

      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight text-black">{session.title}</h1>
          <p className="mt-1 text-sm text-neutral-600">{subtitle}</p>
          <p className="mt-2 text-xs text-neutral-500">
            {isLeader ? "Du er leder på denne aktiviteten." : "Du er ikke leder på denne aktiviteten."}
          </p>
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
        {/* Notat */}
        <div>
          <div className="text-sm font-semibold text-neutral-900">Notat</div>
          {session.note ? (
            <p className="mt-2 whitespace-pre-wrap text-sm text-neutral-700">{session.note}</p>
          ) : (
            <p className="mt-2 text-sm text-neutral-500">Ingen notat.</p>
          )}
        </div>

        {/* Målgruppe (eksisterende) */}
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

        {/* NYTT: Hvem er på økta (B) */}
        <div className="rounded-xl border border-neutral-200 bg-white p-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <div className="text-sm font-semibold text-neutral-900">Hvem er på økta</div>
              <div className="text-xs text-neutral-500">
                Denne lista brukes i appen (og kan være mindre enn “alle på aktiviteten”).
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={loadSessionParticipants}
                disabled={spLoading}
                className="rounded-lg bg-white px-3 py-1.5 text-sm font-semibold text-neutral-900 ring-1 ring-neutral-300 hover:bg-neutral-100 disabled:opacity-60"
              >
                {spLoading ? "Oppdaterer…" : "Oppdater"}
              </button>

              <button
                type="button"
                onClick={onCopyFromActivity}
                disabled={!isLeader || busyAction === "copy"}
                className="rounded-lg bg-black px-3 py-1.5 text-sm font-semibold text-white hover:bg-neutral-800 disabled:opacity-60"
                title={!isLeader ? "Kun ledere kan kopiere" : "Legg alle påmeldte fra aktiviteten inn på økta"}
              >
                {busyAction === "copy" ? "Kopierer…" : "Kopier fra aktivitet"}
              </button>

              <button
                type="button"
                onClick={openPicker}
                disabled={!isLeader}
                className="rounded-lg bg-red-600 px-3 py-1.5 text-sm font-semibold text-white hover:bg-red-700 disabled:opacity-60"
                title={!isLeader ? "Kun ledere kan legge til" : "Legg til personer på økta"}
              >
                Legg til
              </button>
            </div>
          </div>

          {spErr ? (
            <div className="mt-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
              {spErr}
            </div>
          ) : null}

          {spLoading ? (
            <div className="mt-3 text-sm text-neutral-600">Laster…</div>
          ) : sessionPeople.length === 0 ? (
            <div className="mt-3 text-sm text-neutral-600">Ingen lagt til på denne økta enda.</div>
          ) : (
            <ul className="mt-3 divide-y divide-neutral-200">
              {sessionPeople.map((p) => (
                <li key={p.member_id} className="flex items-center justify-between gap-3 py-2">
                  <div className="min-w-0">
                    <div className="truncate text-sm font-semibold text-neutral-900">{p.name}</div>
                    <div className="truncate text-xs text-neutral-600">
                      {p.email ? p.email : "—"}
                      {p.status ? ` · ${p.status}` : ""}
                    </div>
                  </div>

                  {isLeader ? (
                    <button
                      type="button"
                      onClick={() => onRemoveFromSession(p.member_id)}
                      disabled={busyAction === `rm:${p.member_id}`}
                      className="rounded-lg bg-white px-3 py-1.5 text-sm font-semibold text-red-700 ring-1 ring-red-200 hover:bg-red-50 disabled:opacity-60"
                      title="Fjern fra økta"
                    >
                      {busyAction === `rm:${p.member_id}` ? "Fjerner…" : "Fjern"}
                    </button>
                  ) : null}
                </li>
              ))}
            </ul>
          )}
        </div>

        {/* Ledere + Deltakere (eksisterende oversikt fra aktivitet) */}
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="rounded-xl border border-neutral-200 bg-white p-4">
            <div className="text-sm font-semibold text-neutral-900">Ledere (aktivitet)</div>
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
            <div className="text-sm font-semibold text-neutral-900">Deltakere (aktivitet)</div>
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

        {/* NYTT: Filer */}
        <div className="rounded-xl border border-neutral-200 bg-white p-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <div className="text-sm font-semibold text-neutral-900">Filer</div>
              <div className="text-xs text-neutral-500">Last opp manus, monolog, sang, PDF osv. (nedlastbart i mobil)</div>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={loadSessionFiles}
                disabled={filesLoading}
                className="rounded-lg bg-white px-3 py-1.5 text-sm font-semibold text-neutral-900 ring-1 ring-neutral-300 hover:bg-neutral-100 disabled:opacity-60"
              >
                {filesLoading ? "Oppdaterer…" : "Oppdater"}
              </button>

              {isLeader ? (
                <label className="inline-flex cursor-pointer items-center gap-2 rounded-lg bg-red-600 px-3 py-1.5 text-sm font-semibold text-white hover:bg-red-700">
                  <span>{uploading ? "Laster opp…" : "Last opp"}</span>
                  <input
                    type="file"
                    className="hidden"
                    disabled={uploading}
                    onChange={(e) => {
                      const f = e.target.files?.[0];
                      if (f) void onUploadFile(f);
                      e.currentTarget.value = "";
                    }}
                  />
                </label>
              ) : null}
            </div>
          </div>

          {filesErr ? (
            <div className="mt-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
              {filesErr}
            </div>
          ) : null}

          {filesLoading ? (
            <div className="mt-3 text-sm text-neutral-600">Laster…</div>
          ) : files.length === 0 ? (
            <div className="mt-3 text-sm text-neutral-600">Ingen filer lastet opp enda.</div>
          ) : (
            <ul className="mt-3 divide-y divide-neutral-200">
              {files.map((f) => (
                <li key={f.id} className="flex items-center justify-between gap-3 py-2">
                  <div className="min-w-0">
                    <div className="truncate text-sm font-semibold text-neutral-900">{f.name || filenameFromPath(f.storage_path)}</div>
                    <div className="truncate text-xs text-neutral-600">
                      {bytesToNice(f.size_bytes)}{f.created_at ? ` · ${fmtNb(String(f.created_at))}` : ""}
                    </div>
                  </div>

                  <div className="flex flex-wrap items-center gap-2">
                    <button
                      type="button"
                      onClick={() => void onDownloadFile(f.storage_path)}
                      className="rounded-lg bg-white px-3 py-1.5 text-sm font-semibold text-neutral-900 ring-1 ring-neutral-300 hover:bg-neutral-100"
                    >
                      Last ned
                    </button>

                    {isLeader ? (
                      <button
                        type="button"
                        onClick={() => void onDeleteFile({ id: f.id, storage_path: f.storage_path, name: f.name })}
                        disabled={busyAction === `delFile:${f.id}`}
                        className="rounded-lg bg-white px-3 py-1.5 text-sm font-semibold text-red-700 ring-1 ring-red-200 hover:bg-red-50 disabled:opacity-60"
                      >
                        {busyAction === `delFile:${f.id}` ? "Sletter…" : "Slett"}
                      </button>
                    ) : null}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="text-xs text-neutral-500">
          Økt-ID: <span className="font-mono">{S(session.id)}</span>
        </div>
      </div>
    </div>
  );
}
