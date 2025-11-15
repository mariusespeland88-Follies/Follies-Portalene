"use client";

import { useEffect, useMemo, useState } from "react";

type RawMember = {
  id?: string | number | null;
  first_name?: string | null;
  last_name?: string | null;
  email?: string | null;
  phone?: string | null;
};

export type MemberOption = {
  id: string;
  first_name: string;
  last_name: string;
  email: string;
  phone: string;
};

const LS_MEM_V1 = "follies.members.v1";
const LS_MEM_OLD = "follies.members";

const safeJSON = <T,>(value: string | null): T | null => {
  try {
    return value ? (JSON.parse(value) as T) : null;
  } catch {
    return null;
  }
};

const normalizeMember = (row: RawMember | null | undefined): MemberOption | null => {
  if (!row) return null;
  const id = row.id ?? null;
  if (id === null || id === undefined) return null;
  return {
    id: String(id),
    first_name: row.first_name ? String(row.first_name) : "",
    last_name: row.last_name ? String(row.last_name) : "",
    email: row.email ? String(row.email) : "",
    phone: row.phone ? String(row.phone) : "",
  };
};

const dedupeMembers = (list: MemberOption[]): MemberOption[] => {
  const map = new Map<string, MemberOption>();
  for (const member of list) {
    if (!member.id) continue;
    map.set(member.id, member);
  }
  return Array.from(map.values()).sort((a, b) => {
    const an = `${a.first_name} ${a.last_name}`.trim().toLocaleLowerCase("nb");
    const bn = `${b.first_name} ${b.last_name}`.trim().toLocaleLowerCase("nb");
    return an.localeCompare(bn, "nb");
  });
};

const readMembersFromLocalStorage = (): MemberOption[] => {
  if (typeof window === "undefined") return [];
  const v1 = safeJSON<RawMember[]>(localStorage.getItem(LS_MEM_V1)) ?? [];
  const old = safeJSON<RawMember[]>(localStorage.getItem(LS_MEM_OLD)) ?? [];
  const combined = [...old, ...v1];
  const normalized = combined
    .map((row) => normalizeMember(row))
    .filter((row): row is MemberOption => Boolean(row));
  return dedupeMembers(normalized);
};

async function fetchRemoteMembers(signal?: AbortSignal): Promise<MemberOption[]> {
  const res = await fetch("/api/members/list?limit=500", {
    method: "GET",
    cache: "no-store",
    signal,
  });
  if (!res.ok) {
    const message = await res.text().catch(() => "Kunne ikke hente medlemmer");
    throw new Error(message || "Kunne ikke hente medlemmer");
  }
  const payload = await res.json().catch(() => null);
  if (!payload || !payload.ok || !Array.isArray(payload.members)) {
    return [];
  }
  return dedupeMembers(
    payload.members
      .map((row: RawMember) => normalizeMember(row))
      .filter((row: MemberOption | null): row is MemberOption => Boolean(row))
  );
}

export function useMembersOptions() {
  const [members, setMembers] = useState<MemberOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const localMembers = readMembersFromLocalStorage();
    if (localMembers.length > 0) {
      setMembers(localMembers);
    }

    const controller = new AbortController();
    let cancelled = false;

    (async () => {
      try {
        const remote = await fetchRemoteMembers(controller.signal);
        if (!cancelled && remote.length > 0) {
          setMembers((prev) => dedupeMembers([...prev, ...remote]));
        }
      } catch (err: any) {
        if (!cancelled) {
          setError(err?.message || "Kunne ikke hente medlemmer");
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    })();

    return () => {
      cancelled = true;
      controller.abort();
    };
  }, []);

  const hasMembers = members.length > 0;

  return useMemo(
    () => ({ members, loading: loading && !hasMembers, error }),
    [members, loading, error, hasMembers]
  );
}

export const memberDisplayName = (member?: MemberOption | null) => {
  if (!member) return "";
  const name = `${member.first_name} ${member.last_name}`.trim();
  return name || "Uten navn";
};

export const findMemberById = (
  id: string | null | undefined,
  members: MemberOption[]
): MemberOption | null => {
  if (!id) return null;
  return members.find((member) => member.id === id) ?? null;
};
