-- InspoVault — Row Level Security for the `entries` table
-- Run this once in Supabase → SQL Editor. Without RLS, ANY signed-up
-- user can read/modify/delete every row via the anon key.

-- 1) Turn RLS on
alter table public.entries enable row level security;

-- 2) Drop old policies if re-running
drop policy if exists "entries_select_own" on public.entries;
drop policy if exists "entries_insert_own" on public.entries;
drop policy if exists "entries_update_own" on public.entries;
drop policy if exists "entries_delete_own" on public.entries;

-- 3) Users can only touch their own rows
create policy "entries_select_own" on public.entries
  for select using (auth.uid() = user_id);

create policy "entries_insert_own" on public.entries
  for insert with check (auth.uid() = user_id);

create policy "entries_update_own" on public.entries
  for update using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "entries_delete_own" on public.entries
  for delete using (auth.uid() = user_id);

-- 4) Optional: lock down open signups (only you use this app).
--    In Supabase Dashboard → Authentication → Providers → Email:
--    turn OFF "Allow new users to sign up" after your account exists.
