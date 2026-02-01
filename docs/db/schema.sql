-- Supabase schema for DearMe AI (Phase 1)
-- Run this in the Supabase SQL editor.

create extension if not exists "pgcrypto";

create table if not exists profiles (
  user_id text primary key,
  name text not null check (char_length(name) between 2 and 30),
  age integer not null check (age between 13 and 120),
  occupation text null check (occupation is null or char_length(occupation) <= 60),
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create table if not exists entries (
  id uuid primary key default gen_random_uuid(),
  user_id text not null,
  entry_date date not null,
  mood text null,
  time_budget integer not null check (time_budget in (3, 5, 7, 10)),
  content text not null,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create unique index if not exists entries_unique_user_date on entries (user_id, entry_date);
create index if not exists entries_user_created_idx on entries (user_id, created_at desc);

-- Optional: keep updated_at fresh
create or replace function set_updated_at() returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

create trigger profiles_set_updated_at
before update on profiles
for each row execute function set_updated_at();

create trigger entries_set_updated_at
before update on entries
for each row execute function set_updated_at();

-- RLS NOTE:
-- Phase 1 uses anon keys from the frontend without auth.
-- Do NOT enable RLS unless you add proper authentication or server-side access.
