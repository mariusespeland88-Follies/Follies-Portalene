// lib/members-api.ts
// Hjelpefil for å snakke med API-endepunktene for Medlemmer – uten å røre UI.
// - POST /api/members/create
// - PATCH /api/members/[id]/update
// Oppdaterer også localStorage-speil ved suksess for å holde eksisterende sider i synk.
//
// Bruk:
//   import { createMemberApi, updateMemberApi, displayNameFrom } from '@/lib/members-api'
//   const member = await createMemberApi({ first_name: 'Marius', last_name: 'Espeland', email: '...' })
//   const member2 = await updateMemberApi(id, { phone: '12345678' })
//
// Ingen designendringer. Denne filen er kun logikk.
//
// Forventede LS-nøkler (skal beholdes iht. kontrakt):
// - PRIMARY: 'follies.members.v1'
// - FALLBACK: 'follies.members'

/** ========= Typer ========= */

export type Member = {
  id: string
  user_id?: string | null

  first_name: string
  last_name: string
  email?: string | null
  phone?: string | null

  guardian_name?: string | null
  guardian_phone?: string | null
  health_notes?: string | null
  internal_notes?: string | null

  created_at?: string
  updated_at?: string
}

export type MemberCreatePayload = {
  user_id?: string | null
  first_name: string
  last_name: string
  email?: string | null
  phone?: string | null
  guardian_name?: string | null
  guardian_phone?: string | null
  health_notes?: string | null
  internal_notes?: string | null
}

export type MemberUpdatePayload = Partial<Omit<MemberCreatePayload, 'user_id'>> & {
  // tom – alle felter valgfrie
}

/** ========= Konstanter ========= */

const LS_PRIMARY = 'follies.members.v1'
const LS_FALLBACK = 'follies.members'

/** ========= Navn & visning ========= */

export function titleCase(input: string | null | undefined): string {
  if (!input) return ''
  const clean = input.trim().replace(/\s+/g, ' ')
  return clean
    .toLowerCase()
    .split(' ')
    .map(w => (w ? w[0].toUpperCase() + w.slice(1) : ''))
    .join(' ')
}

export function stripDigits(input: string | null | undefined): string {
  if (!input) return ''
  return input.replace(/\d+/g, '')
}

export function displayNameFrom(member: Pick<Member, 'first_name' | 'last_name'>): string {
  const first = stripDigits(titleCase(member.first_name))
  const last = stripDigits(titleCase(member.last_name))
  return [first, last].filter(Boolean).join(' ').trim()
}

/** ========= LocalStorage utils ========= */

function readMembersFromLS(): Member[] {
  if (typeof window === 'undefined') return []
  const raw = window.localStorage.getItem(LS_PRIMARY) || window.localStorage.getItem(LS_FALLBACK) || '[]'
  try {
    const arr = JSON.parse(raw)
    return Array.isArray(arr) ? arr : []
  } catch {
    return []
  }
}

function writeMembersToLS(members: Member[]) {
  if (typeof window === 'undefined') return
  try {
    window.localStorage.setItem(LS_PRIMARY, JSON.stringify(members))
  } catch {
    // stilltiende
  }
}

function upsertIntoArray<T extends { id: string }>(arr: T[], item: T): T[] {
  const idx = arr.findIndex(x => x.id === item.id)
  if (idx >= 0) {
    const next = [...arr]
    next[idx] = { ...next[idx], ...item }
    return next
  }
  return [...arr, item]
}

function upsertMemberLS(member: Member) {
  const current = readMembersFromLS()
  const next = upsertIntoArray(current, member)
  writeMembersToLS(next)
}

/** ========= Fetch helpers ========= */

async function jsonFetch<T = any>(input: RequestInfo | URL, init?: RequestInit): Promise<T> {
  const res = await fetch(input, {
    ...init,
    headers: {
      'content-type': 'application/json',
      ...(init?.headers || {}),
    },
  })
  const data = await res.json().catch(() => ({}))
  if (!res.ok) {
    const msg = (data && (data.error || data.message)) || `HTTP ${res.status}`
    throw new Error(typeof msg === 'string' ? msg : 'Ukjent feil')
  }
  return data as T
}

/** ========= Public API ========= */

// Oppretter medlem via server-API. Ved suksess oppdateres LS-speilet og medlem returneres.
export async function createMemberApi(payload: MemberCreatePayload): Promise<Member> {
  // Mild klientvalidering (API gjør også Title Case)
  if (!payload.first_name || !payload.last_name) {
    throw new Error('Fornavn og etternavn er påkrevd')
  }

  const body = {
    ...payload,
    // La API gjøre endelig Title Case – men vi kan trimme her for bedre UX
    first_name: titleCase(payload.first_name),
    last_name: titleCase(payload.last_name),
  }

  const res = await jsonFetch<{ ok: boolean; member: Member }>('/api/members/create', {
    method: 'POST',
    body: JSON.stringify(body),
  })

  if (res?.member) {
    upsertMemberLS(res.member)
    return res.member
  }

  throw new Error('Uventet svar fra server')
}

// Oppdaterer medlem via server-API. Ved suksess oppdateres LS-speilet og medlem returneres.
export async function updateMemberApi(id: string, patch: MemberUpdatePayload): Promise<Member> {
  if (!id) throw new Error('Mangler id')

  const body: MemberUpdatePayload = { ...patch }
  if (body.first_name !== undefined) body.first_name = titleCase(body.first_name || '')
  if (body.last_name !== undefined) body.last_name = titleCase(body.last_name || '')

  const res = await jsonFetch<{ ok: boolean; member: Member }>(`/api/members/${id}/update`, {
    method: 'PATCH',
    body: JSON.stringify(body),
  })

  if (res?.member) {
    upsertMemberLS(res.member)
    return res.member
  }

  throw new Error('Uventet svar fra server')
}

/** ========= Ekstra nyttefunksjoner (valgfritt å bruke) ========= */

// Hent en (sist kjente) medlem fra LS – nyttig for å unngå ekstra nett-kall etter create/update.
export function getMemberFromLS(id: string): Member | undefined {
  if (!id) return undefined
  const all = readMembersFromLS()
  return all.find(m => m.id === id)
}

// Hent hele LS-listen (for listesider med fallback).
export function getAllMembersFromLS(): Member[] {
  return readMembersFromLS()
}
