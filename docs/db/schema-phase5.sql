-- DearMe AI Phase 5
-- Allow multiple journal sessions + entries per day, add session metadata

alter table if exists journal_sessions
  add column if not exists title text,
  add column if not exists completed_at timestamptz;

drop index if exists journal_sessions_unique_active;

drop index if exists entries_unique_user_date;

create index if not exists journal_sessions_user_created_idx
  on journal_sessions (user_id, created_at desc);

