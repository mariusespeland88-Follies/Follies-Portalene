create table if not exists public.audience_push_tokens (
  id uuid primary key default gen_random_uuid(),
  expo_push_token text not null unique,
  platform text null,
  app_version text null,
  locale text null,
  is_active boolean not null default true,
  last_seen_at timestamptz not null default timezone('utc', now()),
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create or replace function public.set_timestamp_audience_push_tokens()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = timezone('utc', now());
  return new;
end;
$$;

drop trigger if exists set_timestamp_audience_push_tokens on public.audience_push_tokens;
create trigger set_timestamp_audience_push_tokens
before update on public.audience_push_tokens
for each row
execute procedure public.set_timestamp_audience_push_tokens();

alter table public.audience_push_tokens enable row level security;

create table if not exists public.session_push_events (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.activity_sessions(id) on delete cascade,
  member_id uuid not null references public.members(id) on delete cascade,
  kind text not null,
  sent_at timestamptz not null default timezone('utc', now())
);

create unique index if not exists session_push_events_unique_kind
  on public.session_push_events(session_id, member_id, kind);

create index if not exists session_push_events_kind_idx
  on public.session_push_events(kind, sent_at desc);

alter table public.session_push_events enable row level security;
