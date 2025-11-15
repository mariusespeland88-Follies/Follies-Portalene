-- Add core module flags to activities

alter table public.activities
  add column if not exists has_participants boolean not null default true,
  add column if not exists has_leaders boolean not null default true,
  add column if not exists has_sessions boolean not null default true,
  add column if not exists has_files boolean not null default true,
  add column if not exists has_messages boolean not null default true;
