-- Add volunteers and tasks modules for activities

create extension if not exists "pgcrypto";

alter table public.activities
  add column if not exists has_volunteers boolean not null default false,
  add column if not exists has_tasks boolean not null default false;

create table if not exists public.activity_volunteers (
  id uuid primary key default gen_random_uuid(),
  activity_id uuid not null references public.activities(id) on delete cascade,
  member_id uuid not null references public.members(id) on delete cascade,
  role text,
  notes text,
  created_at timestamptz not null default now()
);

create table if not exists public.activity_tasks (
  id uuid primary key default gen_random_uuid(),
  activity_id uuid not null references public.activities(id) on delete cascade,
  title text not null,
  description text,
  status text not null default 'todo',
  assigned_member_id uuid references public.members(id) on delete set null,
  due_date date,
  sort_order integer default 0,
  created_by uuid references public.members(id),
  completed_at timestamptz,
  created_at timestamptz not null default now()
);

alter table public.activity_volunteers enable row level security;
alter table public.activity_tasks enable row level security;

create policy if not exists "Activity volunteers visible to authorized staff"
  on public.activity_volunteers
  for select
  using (
    exists (
      select 1
      from public.activity_roles ar
      where ar.activity_id = activity_volunteers.activity_id
        and ar.member_id = auth.uid()
    )
  );

create policy if not exists "Activity volunteers manageable by leaders"
  on public.activity_volunteers
  for all
  using (
    exists (
      select 1
      from public.activity_roles ar
      where ar.activity_id = activity_volunteers.activity_id
        and ar.member_id = auth.uid()
        and ar.role in ('leader','admin')
    )
  )
  with check (
    exists (
      select 1
      from public.activity_roles ar
      where ar.activity_id = activity_volunteers.activity_id
        and ar.member_id = auth.uid()
        and ar.role in ('leader','admin')
    )
  );

create policy if not exists "Activity tasks visible to authorized staff"
  on public.activity_tasks
  for select
  using (
    exists (
      select 1
      from public.activity_roles ar
      where ar.activity_id = activity_tasks.activity_id
        and ar.member_id = auth.uid()
    )
  );

create policy if not exists "Activity tasks manageable by leaders"
  on public.activity_tasks
  for all
  using (
    exists (
      select 1
      from public.activity_roles ar
      where ar.activity_id = activity_tasks.activity_id
        and ar.member_id = auth.uid()
        and ar.role in ('leader','admin')
    )
  )
  with check (
    exists (
      select 1
      from public.activity_roles ar
      where ar.activity_id = activity_tasks.activity_id
        and ar.member_id = auth.uid()
        and ar.role in ('leader','admin')
    )
  );

