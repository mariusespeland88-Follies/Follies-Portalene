-- Follies Supabase Safe Cleanup Plan
-- Date: 2026-02-16
-- Project: icwinldvjgafdswuxlhf
--
-- IMPORTANT:
-- 1) Run this in a staging copy first.
-- 2) Take backup/snapshot before production run.
-- 3) This plan is NON-DESTRUCTIVE (no DROP statements).

begin;

-- ---------------------------------------------------------------------------
-- 0) Snapshot counts (before)
-- ---------------------------------------------------------------------------
select 'activity' as table_name, count(*) as rows from public.activity
union all
select 'activities', count(*) from public.activities
union all
select 'member', count(*) from public.member
union all
select 'members', count(*) from public.members
union all
select 'enrollment', count(*) from public.enrollment
union all
select 'enrollments', count(*) from public.enrollments;

-- ---------------------------------------------------------------------------
-- 1) Backfill activity -> activities (only missing IDs)
-- ---------------------------------------------------------------------------
insert into public.activities (
  id,
  name,
  title,
  type,
  archived,
  created_at,
  updated_at,
  event_date,
  has_guests,
  has_attendance,
  has_volunteers,
  has_tasks,
  tab_config
)
select
  a.id,
  a.name,
  a.name as title,
  'offer' as type,
  coalesce(a.archived, false),
  a.created_at,
  now() as updated_at,
  null::date as event_date,
  false as has_guests,
  false as has_attendance,
  false as has_volunteers,
  false as has_tasks,
  null::jsonb as tab_config
from public.activity a
left join public.activities n on n.id = a.id
where n.id is null;

-- ---------------------------------------------------------------------------
-- 2) Backfill member -> members (only missing IDs)
-- ---------------------------------------------------------------------------
insert into public.members (
  id,
  first_name,
  last_name,
  email,
  phone,
  address,
  postal_code,
  city,
  dob,
  start_year,
  guardian_name,
  guardian_phone,
  allergies,
  medical_info,
  internal_notes,
  avatar_url,
  archived,
  created_at,
  updated_at
)
select
  m.id,
  m.first_name,
  m.last_name,
  m.email,
  m.phone,
  m.address,
  m.postal_code,
  m.city,
  m.birth_date as dob,
  m.start_year,
  m.guardian_name,
  m.guardian_phone,
  m.allergies,
  m.medical_info,
  coalesce(m.notes, m.notes_public) as internal_notes,
  m.photo_url as avatar_url,
  coalesce(m.archived, false),
  coalesce(m.created_at, now()) as created_at,
  now() as updated_at
from public.member m
left join public.members n on n.id = m.id
where n.id is null;

-- ---------------------------------------------------------------------------
-- 3) Backfill enrollment -> enrollments (dedupe on member/activity)
-- ---------------------------------------------------------------------------
insert into public.enrollments (
  activity_id,
  member_id,
  role,
  created_at,
  updated_at
)
select distinct
  e.activity_id,
  e.member_id,
  'participant'::text as role,
  e.created_at,
  now() as updated_at
from public.enrollment e
where exists (select 1 from public.activities a where a.id = e.activity_id)
  and exists (select 1 from public.members m where m.id = e.member_id)
on conflict (member_id, activity_id) do nothing;

-- ---------------------------------------------------------------------------
-- 4) Integrity checks (after)
-- ---------------------------------------------------------------------------
-- Legacy records missing in canonical tables (should trend to 0)
select count(*) as missing_activities
from public.activity a
left join public.activities n on n.id = a.id
where n.id is null;

select count(*) as missing_members
from public.member m
left join public.members n on n.id = m.id
where n.id is null;

select count(*) as missing_enrollments
from public.enrollment e
left join public.enrollments n
  on n.member_id = e.member_id
 and n.activity_id = e.activity_id
where n.id is null;

-- Orphan checks in canonical table
select count(*) as orphan_enrollments
from public.enrollments e
left join public.members m on m.id = e.member_id
left join public.activities a on a.id = e.activity_id
where m.id is null or a.id is null;

-- ---------------------------------------------------------------------------
-- 5) Optional: inspect legacy import residue
-- ---------------------------------------------------------------------------
select count(*) as import_julaften_2025_rows
from public.import_julaften_2025;

commit;

-- ---------------------------------------------------------------------------
-- MANUAL NEXT STEPS (NOT EXECUTED HERE)
-- ---------------------------------------------------------------------------
-- 1) Keep legacy tables read-only for one release window.
-- 2) Verify portal + app behavior only against canonical tables.
-- 3) Only after manual signoff and backup:
--    - archive/export legacy tables
--    - drop legacy tables (activity/member/enrollment) in a separate script.
