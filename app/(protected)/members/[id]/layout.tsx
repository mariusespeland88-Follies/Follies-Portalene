"use client";

import * as React from "react";
import { useEffect } from "react";

/**
 * Per-rute layout for /members/[id]
 * - Inneholder en usynlig klient-synk som henter medlem + roller fra Supabase
 *   og speiler til localStorage (så "restored good"-profilen din fortsetter å virke).
 * - Ingen visuelle endringer.
 */

type AnyObj = Record<string, any>;
type Perms = Record<string, { roles?: string[] }>;

const MEM_V1 = "follies.members.v1";
const PERMS  = "follies.perms.v1";

function parseJSON<T>(raw: string | null, fb: T): T { try { return raw ? (JSON.parse(raw) as T) : fb; } catch { return fb; } }
function readLS(key: string) { try { return localStorage.getItem(key); } catch { return null; } }
function writeLS(key: string, v: any) { try { localStorage.setItem(key, JSON.stringify(v)); } catch {} }
function readMembersLS(): AnyObj[] { return parseJSON<AnyObj[]>(readLS(MEM_V1), []); }
function writeMembersLS(list: AnyObj[]) { writeLS(MEM_V1, Array.isArray(list) ? list : []); }
function readPermsLS(): Perms { return parseJSON<Perms>(readLS(PERMS), {}); }
function writePermsLS(p: Perms) { writeLS(PERMS, p || {}); }
function memberId(m: AnyObj): string { return String(m?.id ?? m?.uuid ?? m?._id ?? m?.memberId ?? ""); }

function MemberDBSyncInline({ idParam }: { idParam: string }) {
  useEffect(() => {
    let cancelled = false;

    async function run() {
      try {
        const raw = String(idParam || "");
        if (!raw) return;

        const qs = new URLSearchParams();
        qs.set(raw.includes("@") ? "email" : "id", raw);
        qs.set("limit", "1");

        const res = await fetch(`/api/members/list?${qs.toString()}`, {
          cache: "no-store",
        });
        if (!res.ok || cancelled) return;

        const payload = await res.json().catch(() => ({}));
        const rows = Array.isArray(payload?.members) ? (payload.members as AnyObj[]) : [];
        const m = rows[0];
        if (!m) return;

        const norm: AnyObj = {
          id: m.id,
          first_name: m.first_name ?? "",
          last_name: m.last_name ?? "",
          email: m.email ?? "",
          phone: m.phone ?? "",
          avatar_url: m.avatar_url ?? "",
          created_at: m.created_at ?? null,
        };
        const id = memberId(norm);
        const rolesEntry = id ? payload?.roles?.[id] : null;
        const roles: string[] = Array.isArray(rolesEntry?.roles)
          ? rolesEntry.roles.map((r: any) => String(r))
          : [];

        // Merge til LS (DB vinner på felter den har)
        const all = readMembersLS();
        const map = new Map(all.map((x) => [memberId(x), x]));
        if (!id) return;
        const prev = map.get(id) || {};
        map.set(id, { ...prev, ...norm });
        writeMembersLS(Array.from(map.values()));

        // Roller
        const cur = readPermsLS();
        const next = { ...cur, [id]: { roles } };
        writePermsLS(next);

        // Signal til sider som evt. lytter
        try { window.dispatchEvent(new CustomEvent("follies:member-sync", { detail: { id } })); } catch {}
      } catch {
        // stille – best effort
      }
    }

    run();
    return () => { cancelled = true; };
  }, [idParam]);

  return null;
}

export default function MemberProfileLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: { id: string };
}) {
  return (
    <>
      <MemberDBSyncInline idParam={params.id} />
      {children}
    </>
  );
}
