-- ─────────────────────────────────────────────────────────────────────────────
-- InspoVault — Supabase Schema
-- Run this entire file in: Supabase Dashboard → SQL Editor → New Query
-- ─────────────────────────────────────────────────────────────────────────────

-- entries table
create table if not exists entries (
  id            uuid    default gen_random_uuid() primary key,
  user_id       uuid    references auth.users(id) on delete cascade not null,
  url           text,
  title         text    not null,
  description   text,
  image_url     text,                  -- https:// URL or data: URL for screenshots
  source_type   text    default 'other',
  tags          text[]  default '{}',
  notes         text,
  prompt_text   text,
  prompt_tool   text,
  prompt_type   text    check (prompt_type in ('extracted', 'suggested')),
  stars         integer,
  forks         integer,
  opens         integer default 0,
  created_at    timestamptz default now(),
  updated_at    timestamptz default now()
);

-- Auto-update updated_at
create or replace function update_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

create trigger entries_updated_at
  before update on entries
  for each row execute function update_updated_at();

-- Row Level Security — users only see their own entries
alter table entries enable row level security;

create policy "select own entries"
  on entries for select
  using (auth.uid() = user_id);

create policy "insert own entries"
  on entries for insert
  with check (auth.uid() = user_id);

create policy "update own entries"
  on entries for update
  using (auth.uid() = user_id);

create policy "delete own entries"
  on entries for delete
  using (auth.uid() = user_id);

-- Index for fast user lookups
create index if not exists entries_user_id_idx on entries (user_id);
create index if not exists entries_created_at_idx on entries (created_at desc);
create index if not exists entries_source_type_idx on entries (source_type);
