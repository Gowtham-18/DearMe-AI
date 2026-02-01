-- DearMe AI Phase 4
-- Adds profile preferences for Enhanced Language Mode

alter table if exists profiles
  add column if not exists preferences jsonb not null default '{}'::jsonb;

