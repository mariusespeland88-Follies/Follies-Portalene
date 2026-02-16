# Supabase Audit (2026-02-16)

## Scope
- Project ref: `icwinldvjgafdswuxlhf`
- Sources:
  - `supabase gen types typescript --project-id icwinldvjgafdswuxlhf --schema public`
  - Current portal + mobile code usage

## Main Findings
1. Legacy + canonical tables exist in parallel:
- `activity` and `activities`
- `member` and `members`
- `enrollment` and `enrollments`

2. Most active code is now on canonical tables:
- Portal API primarily uses `activities`, `members`, `enrollments`.
- Mobile app uses `activities`, `members`, `enrollments`, `activity_sessions`, `conversation_*`.

3. Leftover/one-off table exists:
- `import_julaften_2025` (likely migration/import residue).

4. Content model overlap to be aware of:
- `activity_details` and `public_content` both represent public-facing content layers.

## Actions Applied In This Round
- Locked remaining open portal endpoints (`members/*`, `messages/my`) with role-based API auth.
- Updated one protected portal page from legacy `member` -> `members`.
- Mobile messenger now has safe fallback for portal API base URL:
  - defaults to `https://follies-portalene.vercel.app` when `EXPO_PUBLIC_PORTAL_URL` is missing.
- Mobile messenger attachment upload payload aligned with portal route requirements:
  - now sends `conversation_id` and `message_id`.
- Mobile member lookup made case-insensitive (`ilike`).

## Recommended Safe Cleanup Order
1. Keep canonical tables as source of truth:
- `activities`, `members`, `enrollments`

2. Freeze legacy writes completely:
- no app writes to `activity`, `member`, `enrollment`

3. Validate data parity before any destructive step:
- row counts + sampled rows between legacy/canonical

4. Archive plan for legacy tables:
- backup first
- read-only window
- manual approval before drop

5. Review and decide on overlap:
- keep one public content strategy (`activity_details` vs `public_content`)

6. Review `import_julaften_2025`:
- keep only if still used for reporting/history

## SQL Plan
- Non-destructive SQL runbook:
  - `docs/supabase-safe-cleanup-plan.sql`

## Notes
- This round is non-destructive: no table drops, no destructive SQL.
- Goal is stability between portal and mobile first, cleanup second.
