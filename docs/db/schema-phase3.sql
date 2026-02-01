-- Supabase schema additions for DearMe AI (Phase 3)
-- Run this after schema-phase2.sql.

create extension if not exists "pgcrypto";

create table if not exists journal_sessions (
  id uuid primary key default gen_random_uuid(),
  user_id text not null,
  entry_date date not null,
  selected_prompt_id text not null,
  selected_prompt_text text not null,
  status text not null default 'ACTIVE' check (status in ('ACTIVE', 'COMPLETED')),
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create unique index if not exists journal_sessions_unique_active
  on journal_sessions (user_id, entry_date, status);

create table if not exists journal_turns (
  id uuid primary key default gen_random_uuid(),
  session_id uuid references journal_sessions(id) on delete cascade,
  user_id text not null,
  role text not null,
  content text not null,
  created_at timestamptz default now()
);

create index if not exists journal_turns_session_created_idx
  on journal_turns (session_id, created_at);

create or replace function set_updated_at() returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

create trigger journal_sessions_set_updated_at
before update on journal_sessions
for each row execute function set_updated_at();
