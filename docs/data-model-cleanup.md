# Follies Data Model Cleanup (Safe Path)

## Goal
Use one canonical schema for portal + mobile, without deleting legacy tables first.

Canonical tables:
- `activities`
- `activity_details`
- `members`
- `member_roles`
- `enrollments`
- `activity_sessions`
- `activity_session_targets`
- `session_files`
- `conversations`
- `conversation_participants`
- `conversation_messages`
- `conversation_attachments`

## Current status (important)
The database currently has both old and new table sets:
- Old: `activity`, `member`, `enrollment`
- New: `activities`, `members`, `enrollments`

This is why data and behavior can look inconsistent.

## What has been done in code now
Legacy API routes have been moved to canonical tables:
- `/api/activities` -> `activities`
- `/api/activity-participants` -> `enrollments` + `members`
- `/api/members/[id]` -> `enrollments`
- `/api/members/[id]/avatar` -> `members`
- `/api/members/[id]/history` -> `enrollments` + `activities`

Sensitive service-role routes are now protected by API auth guards.

## Next safe migration steps (no destructive actions yet)
1. Freeze writes to legacy tables in app code (done for routes above).
2. Run one-time data backfill from old -> new for anything missing.
3. Validate counts and sample rows:
   - `activity` vs `activities`
   - `member` vs `members`
   - `enrollment` vs `enrollments`
4. Keep old tables read-only for one release window.
5. Remove legacy code paths.
6. Archive/drop old tables only after manual approval and backup.

## Verification checklist
- Portal creates/updates activities in `activities`.
- Member enrollment changes go to `enrollments`.
- Member avatar updates write to `members.avatar_url`.
- History endpoint reads from `enrollments` + `activities`.
- Mobile app reads same canonical tables.

