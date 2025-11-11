"use client";

import * as React from "react";
import { useEffect } from "react";
import getSupabaseBrowserClient from "@/lib/supabase/client";

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
function isUUID(s: string): boolean { return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(s); }

function MemberDBSyncInline({ idParam }: { idParam: string }) {
  useEffect(() => {
    let cancelled = false;

    async function run() {
      try {
        const supabase = getSupabaseBrowserClient();

        // Kun forsøk hvis vi faktisk har session (ellers stopper RLS oss)
        const { data: sess } = await supabase.auth.getSession();
        if (!sess.session) return;

        let query = supabase
          .from("members")
          .select("id, first_name, last_name, email, phone, avatar_url, created_at, member_roles ( role )");

        const raw = String(idParam || "");
        if (isUUID(raw)) query = query.eq("id", raw).limit(1);
        else if (raw.includes("@")) query = query.ilike("email", raw).limit(1);
        else query = query.eq("id", raw).limit(1);

        const { data, error } = await query;
        if (error || !data || data.length === 0 || cancelled) return;

        const m = data[0] as any;
        const norm: AnyObj = {
          id: m.id,
          first_name: m.first_name ?? "",
          last_name:  m.last_name  ?? "",
          email:      m.email      ?? "",
          phone:      m.phone      ?? "",
          avatar_url: m.avatar_url ?? "",
          created_at: m.created_at ?? null,
        };
        const roles: string[] = Array.isArray(m.member_roles) ? m.member_roles.map((r: any) => String(r.role)) : [];

        // Merge til LS (DB vinner på felter den har)
        const all = readMembersLS();
        const map = new Map(all.map((x) => [memberId(x), x]));
        const id = memberId(norm);
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
