-- ─────────────────────────────────────────────────────────────────────────────
-- Migration: add extracted_repos column for YouTube repo extraction feature
-- Run this in: Supabase Dashboard → SQL Editor → New Query
-- ─────────────────────────────────────────────────────────────────────────────

alter table entries
  add column if not exists extracted_repos jsonb default '[]'::jsonb;
