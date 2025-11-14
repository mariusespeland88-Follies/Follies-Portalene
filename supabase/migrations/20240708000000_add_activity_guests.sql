-- Add guest & attendance support for activities

create extension if not exists "pgcrypto";

alter table public.activities
  add column if not exists has_guests boolean not null default false,
  add column if not exists has_attendance boolean not null default false;

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create table if not exists public.activity_guests (
  id uuid primary key default gen_random_uuid(),
  activity_id uuid not null references public.activities(id) on delete cascade,
  first_name text not null,
  last_name text not null,
  phone text not null,
  email text,
  is_norwegian boolean,
  notes text,
  present boolean not null default false,
  present_marked_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger set_timestamp_activity_guests
before update on public.activity_guests
for each row execute function public.set_updated_at();

create table if not exists public.activity_guest_children (
  id uuid primary key default gen_random_uuid(),
  guest_id uuid not null references public.activity_guests(id) on delete cascade,
  first_name text,
  age integer,
  gender text,
  notes text,
  created_at timestamptz not null default now()
);

alter table public.activity_guests enable row level security;
alter table public.activity_guest_children enable row level security;

-- Replace these policy helpers with project specific logic if needed
create policy if not exists "Activity guests are visible to authorized staff"
  on public.activity_guests
  for select
  using (
    exists (
      select 1
      from public.activity_roles ar
      where ar.activity_id = activity_guests.activity_id
        and ar.member_id = auth.uid()
    )
  );

create policy if not exists "Activity guests manageable by leaders"
  on public.activity_guests
  for all
  using (
    exists (
      select 1
      from public.activity_roles ar
      where ar.activity_id = activity_guests.activity_id
        and ar.member_id = auth.uid()
        and ar.role in ('leader','admin')
    )
  )
  with check (
    exists (
      select 1
      from public.activity_roles ar
      where ar.activity_id = activity_guests.activity_id
        and ar.member_id = auth.uid()
        and ar.role in ('leader','admin')
    )
  );

create policy if not exists "Activity guest children visible to authorized staff"
  on public.activity_guest_children
  for select
  using (
    exists (
      select 1
      from public.activity_guests ag
      join public.activity_roles ar on ar.activity_id = ag.activity_id
      where ag.id = activity_guest_children.guest_id
        and ar.member_id = auth.uid()
    )
  );

create policy if not exists "Activity guest children manageable by leaders"
  on public.activity_guest_children
  for all
  using (
    exists (
      select 1
      from public.activity_guests ag
      join public.activity_roles ar on ar.activity_id = ag.activity_id
      where ag.id = activity_guest_children.guest_id
        and ar.member_id = auth.uid()
        and ar.role in ('leader','admin')
    )
  )
  with check (
    exists (
      select 1
      from public.activity_guests ag
      join public.activity_roles ar on ar.activity_id = ag.activity_id
      where ag.id = activity_guest_children.guest_id
        and ar.member_id = auth.uid()
        and ar.role in ('leader','admin')
    )
  );
