// lib/members.ts
// Hjelpefunksjoner for "Medlemmer":
// - Primær DB-tilgang via Supabase (klient)
// - Myk fallback til localStorage (follies.members.v1 -> fallback: follies.members)
// - Speiling DB -> LS for profilsider og lister
// - Tittelformatering (Title Case) og fjerning av tall i visningsnavn
//
// MERK: Ingen UI-endringer. Bruk disse funksjonene i eksisterende sider:
//  - app/(protected)/members/new/page.tsx    -> createMember()
//  - app/(protected)/members/[id]/edit/page.tsx -> updateMember()
//  - app/(protected)/members/page.tsx        -> getMembersWithFallback()
//  - app/(protected)/members/[id]/page.tsx   -> getMemberByIdWithFallback()
//  - app/(protected)/members/[id]/layout.tsx -> syncMemberFromDBToLS()
//
// Avhengighet: lib/supabase/client.ts (må allerede finnes i prosjektet)

import { createClientComponentClient } from '@supabase/auth-helpers-nextjs'

/** ======== Typer ======== */

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

// Tillat aliaser: id | uuid | _id | memberId
export type AnyId = string | null | undefined
export type MemberUpsert = Partial<Member> & {
  // minst ett id-alias ved update; ikke nødvendig ved create
  id?: string
  uuid?: string
  _id?: string
  memberId?: string

  // navn kan komme i varierende casing; vi normaliserer
  first_name?: string
  last_name?: string
}

/** ======== Konstanter ======== */

const LS_PRIMARY = 'follies.members.v1'
const LS_FALLBACK = 'follies.members'

// Hjelp til å få Supabase-klient som funker i klientkomponenter
function sb() {
  return createClientComponentClient()
}

/** ======== Navn & ID normalisering ======== */

export function titleCase(input: string | null | undefined): string {
  if (!input) return ''
  // Fjern overskudd mellomrom
  const clean = input.trim().replace(/\s+/g, ' ')
  // Title Case pr ord
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

export function resolveIdAlias(obj: { id?: AnyId; uuid?: AnyId; _id?: AnyId; memberId?: AnyId }): string | undefined {
  return (obj.id || obj.uuid || obj._id || obj.memberId || undefined) ?? undefined
}

/** ======== LocalStorage utils ======== */

function readMembersFromLS(): Member[] {
  if (typeof window === 'undefined') return []
  const raw = window.localStorage.getItem(LS_PRIMARY) || window.localStorage.getItem(LS_FALLBACK) || '[]'
  try {
    const arr = JSON.parse(raw)
    if (Array.isArray(arr)) return arr
    return []
  } catch {
    return []
  }
}

function writeMembersToLS(members: Member[]) {
  if (typeof window === 'undefined') return
  try {
    window.localStorage.setItem(LS_PRIMARY, JSON.stringify(members))
  } catch {
    // ignorer skrivefeil til LS
  }
}

function upsertIntoArray<T extends { id?: string }>(arr: T[], item: T & { id: string }): T[] {
  const idx = arr.findIndex(x => (x.id ?? '') === item.id)
  if (idx >= 0) {
    const next = [...arr]
    next[idx] = { ...next[idx], ...item }
    return next
  }
  return [...arr, item]
}

/** ======== DB <-> LS speiling ======== */

// Henter ALLE medlemmer primært fra DB. Ved suksess speiles til LS.
// Ved feil (RLS, nett, etc.) brukes LS-fallback.
export async function getMembersWithFallback(): Promise<Member[]> {
  try {
    const { data, error } = await sb()
      .from('members')
      .select(
        'id, user_id, first_name, last_name, email, phone, guardian_name, guardian_phone, health_notes, internal_notes, created_at, updated_at'
      )
      .order('created_at', { ascending: false })

    if (error) throw error
    if (data && Array.isArray(data)) {
      // Speil til LS (for profilsider og offline)
      writeMembersToLS(data)
      return data
    }
    // Hvis tomt svar, tillat fallback for sikkerhets skyld
    return readMembersFromLS()
  } catch {
    return readMembersFromLS()
  }
}

// Henter ett medlem fra DB, speiler til LS. Faller tilbake til LS hvis DB feiler.
export async function getMemberByIdWithFallback(anyId: AnyId): Promise<Member | undefined> {
  const id = String(anyId ?? '').trim()
  if (!id) return undefined

  try {
    const { data, error } = await sb()
      .from('members')
      .select(
        'id, user_id, first_name, last_name, email, phone, guardian_name, guardian_phone, health_notes, internal_notes, created_at, updated_at'
      )
      .eq('id', id)
      .maybeSingle()

    if (error) throw error
    if (data) {
      // Oppdater LS: oppsert ett medlem
      const current = readMembersFromLS()
      const next = upsertIntoArray(current, data)
      writeMembersToLS(next)
      return data
    }
    // Ikke funnet i DB -> sjekk LS
    const ls = readMembersFromLS()
    return ls.find(m => m.id === id)
  } catch {
    const ls = readMembersFromLS()
    return ls.find(m => m.id === id)
  }
}

// Henter og speiler ett medlem (til bruk i members/[id]/layout.tsx "usynlig synk").
export async function syncMemberFromDBToLS(anyId: AnyId): Promise<void> {
  const m = await getMemberByIdWithFallback(anyId)
  // (Ingen videre handling nødvendig; getMemberByIdWithFallback oppdaterer LS ved suksess)
  void m
}

/** ======== Create / Update (DB-først, så LS) ======== */

function normalizeNameFields(input: MemberUpsert): Pick<Member, 'first_name' | 'last_name'> {
  const first = titleCase(input.first_name ?? '')
  const last = titleCase(input.last_name ?? '')
  return { first_name: first, last_name: last }
}

// Oppretter nytt medlem i DB. Ved suksess speiles inn i LS og returneres.
export async function createMember(input: MemberUpsert): Promise<Member> {
  const names = normalizeNameFields(input)

  const payload: Omit<Member, 'id'> = {
    user_id: input.user_id ?? null,
    first_name: names.first_name,
    last_name: names.last_name,
    email: input.email ?? null,
    phone: input.phone ?? null,
    guardian_name: input.guardian_name ?? null,
    guardian_phone: input.guardian_phone ?? null,
    health_notes: input.health_notes ?? null,
    internal_notes: input.internal_notes ?? null,
  }

  const { data, error } = await sb()
    .from('members')
    .insert(payload)
    .select(
      'id, user_id, first_name, last_name, email, phone, guardian_name, guardian_phone, health_notes, internal_notes, created_at, updated_at'
    )
    .single()

  if (error) throw error

  // Speil til LS
  const current = readMembersFromLS()
  const next = upsertIntoArray(current, data)
  writeMembersToLS(next)

  return data
}

// Oppdaterer et eksisterende medlem i DB. Ved suksess speiles inn i LS og returneres.
export async function updateMember(input: MemberUpsert): Promise<Member> {
  const id = resolveIdAlias(input as any)
  if (!id) {
    throw new Error('updateMember: mangler id/uuid/_id/memberId')
  }

  const names = normalizeNameFields(input)

  const payload: Partial<Member> = {
    first_name: names.first_name,
    last_name: names.last_name,
    email: input.email ?? null,
    phone: input.phone ?? null,
    guardian_name: input.guardian_name ?? null,
    guardian_phone: input.guardian_phone ?? null,
    health_notes: input.health_notes ?? null,
    internal_notes: input.internal_notes ?? null,
  }

  const { data, error } = await sb()
    .from('members')
    .update(payload)
    .eq('id', id)
    .select(
      'id, user_id, first_name, last_name, email, phone, guardian_name, guardian_phone, health_notes, internal_notes, created_at, updated_at'
    )
    .single()

  if (error) throw error

  // Speil til LS
  const current = readMembersFromLS()
  const next = upsertIntoArray(current, data)
  writeMembersToLS(next)

  return data
}

/** ======== Sletting (valgfri – hvis UI har "Arkiv") ======== */

// Hvis du har en "arkiver" i stedet for hard delete, bytt til et "archived_at" felt i DB.
// Her er en hard delete-hjelper hvis det trengs (kall fra eksisterende UI-knapp uten å endre design).
export async function deleteMemberHard(anyId: AnyId): Promise<{ ok: boolean }> {
  const id = String(anyId ?? '').trim()
  if (!id) return { ok: false }

  const { error } = await sb().from('members').delete().eq('id', id)
  if (error) throw error

  // Fjern fra LS
  const current = readMembersFromLS()
  const next = current.filter(m => m.id !== id)
  writeMembersToLS(next)

  return { ok: true }
}

/** ======== Utility for toppmeny-visning av innlogget navn ======== */

// Bruk i AppHeader: hent medlem knyttet til auth.uid() (om du allerede har det i state, bruk det).
export async function getDisplayNameForCurrentUser(): Promise<string> {
  try {
    const client = sb()
    const {
      data: { user },
    } = await client.auth.getUser()

    const uid = user?.id
    if (!uid) return ''

    const { data, error } = await client
      .from('members')
      .select('first_name, last_name')
      .eq('user_id', uid)
      .maybeSingle()

    if (error) throw error
    if (!data) return ''

    return displayNameFrom(data as any)
  } catch {
    // Fallback: finn første i LS som har user_id lik nåværende (hvis det ligger speilet)
    const ls = readMembersFromLS()
    const client = sb()
    const {
      data: { user },
    } = await client.auth.getUser()
    const uid = user?.id
    const match = ls.find(m => m.user_id === uid)
    return match ? displayNameFrom(match) : ''
  }
}
