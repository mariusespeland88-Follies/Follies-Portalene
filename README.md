# Follies Ansatteportal (MVP)

Next.js 14 + Supabase starter for Follies' interne portal.

## Kom i gang
1) Kopier `.env.example` til `.env.local` og fyll inn Supabase-verdier.
2) Kjør SQL-skjemaet fra systemplanen i Supabase SQL editor.
3) Installer og start:
```bash
npm install
npm run dev
```
Åpne http://localhost:3000

## Struktur
- `app/` – App Router med sider og API-endepunkter
- `lib/supabase/` – klienter for klient og server (admin)
- `components/` – enkle UI-komponenter
- `app/api/` – route handlers (MVP: members, programs, enrollments, attendance)

## Auth
Bruker Supabase Auth (magic link). Sider under `/dashboard` krever innlogging.
