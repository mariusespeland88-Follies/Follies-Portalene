create table if not exists public.member_push_tokens (
  id uuid primary key default gen_random_uuid(),
  member_id uuid not null references public.members(id) on delete cascade,
  expo_push_token text not null,
  platform text null,
  device_id text null,
  app_version text null,
  locale text null,
  is_active boolean not null default true,
  last_seen_at timestamptz not null default timezone('utc', now()),
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create unique index if not exists member_push_tokens_member_token_uq
  on public.member_push_tokens(member_id, expo_push_token);

create index if not exists member_push_tokens_member_idx
  on public.member_push_tokens(member_id);

create index if not exists member_push_tokens_active_idx
  on public.member_push_tokens(is_active);

create or replace function public.set_timestamp_member_push_tokens()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = timezone('utc', now());
  return new;
end;
$$;

drop trigger if exists set_timestamp_member_push_tokens on public.member_push_tokens;
create trigger set_timestamp_member_push_tokens
before update on public.member_push_tokens
for each row
execute procedure public.set_timestamp_member_push_tokens();

alter table public.member_push_tokens enable row level security;

drop policy if exists "Member push tokens owner read" on public.member_push_tokens;
create policy "Member push tokens owner read"
  on public.member_push_tokens
  for select
  using (
    exists (
      select 1
      from public.members m
      where m.id = member_push_tokens.member_id
        and m.user_id = auth.uid()
    )
  );

drop policy if exists "Member push tokens owner write" on public.member_push_tokens;
create policy "Member push tokens owner write"
  on public.member_push_tokens
  for all
  using (
    exists (
      select 1
      from public.members m
      where m.id = member_push_tokens.member_id
        and m.user_id = auth.uid()
    )
  )
  with check (
    exists (
      select 1
      from public.members m
      where m.id = member_push_tokens.member_id
        and m.user_id = auth.uid()
    )
  );
