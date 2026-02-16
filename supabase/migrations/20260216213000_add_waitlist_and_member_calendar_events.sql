create extension if not exists "pgcrypto";

create table if not exists public.activity_waitlist (
  id uuid primary key default gen_random_uuid(),
  activity_id uuid not null references public.activities(id) on delete cascade,
  member_id uuid not null references public.members(id) on delete cascade,
  note text,
  priority integer not null default 0,
  created_by_member_id uuid references public.members(id) on delete set null,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  unique (activity_id, member_id)
);

create index if not exists activity_waitlist_activity_id_idx
  on public.activity_waitlist(activity_id, created_at asc);

create index if not exists activity_waitlist_member_id_idx
  on public.activity_waitlist(member_id);

drop trigger if exists set_timestamp_activity_waitlist on public.activity_waitlist;
create trigger set_timestamp_activity_waitlist
before update on public.activity_waitlist
for each row execute function public.set_updated_at();

alter table public.activity_waitlist enable row level security;

create table if not exists public.member_calendar_events (
  id uuid primary key default gen_random_uuid(),
  member_id uuid not null references public.members(id) on delete cascade,
  title text not null,
  start_at timestamptz not null,
  end_at timestamptz not null,
  note text,
  created_by_member_id uuid references public.members(id) on delete set null,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  constraint member_calendar_events_time_check check (end_at >= start_at)
);

create index if not exists member_calendar_events_member_id_start_idx
  on public.member_calendar_events(member_id, start_at asc);

create index if not exists member_calendar_events_start_idx
  on public.member_calendar_events(start_at asc);

drop trigger if exists set_timestamp_member_calendar_events on public.member_calendar_events;
create trigger set_timestamp_member_calendar_events
before update on public.member_calendar_events
for each row execute function public.set_updated_at();

alter table public.member_calendar_events enable row level security;
