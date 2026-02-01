-- Supabase schema additions for DearMe AI (Phase 2)
-- Run this after schema.sql in the Supabase SQL editor.

create extension if not exists "pgcrypto";
create extension if not exists "vector";

create table if not exists entry_analysis (
  entry_id uuid primary key references entries(id) on delete cascade,
  user_id text not null,
  sentiment_label text not null,
  sentiment_score real not null,
  mood_numeric smallint null,
  keyphrases jsonb not null default '[]'::jsonb,
  safety_flags jsonb not null default '{}'::jsonb,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create index if not exists entry_analysis_user_created_idx
  on entry_analysis (user_id, created_at desc);

create table if not exists themes (
  id uuid primary key default gen_random_uuid(),
  user_id text not null,
  label text not null,
  keywords jsonb not null default '[]'::jsonb,
  strength real not null default 0,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create table if not exists theme_membership (
  id uuid primary key default gen_random_uuid(),
  user_id text not null,
  theme_id uuid references themes(id) on delete cascade,
  entry_id uuid references entries(id) on delete cascade,
  score real not null default 0,
  created_at timestamptz default now()
);

create index if not exists theme_membership_user_theme_idx on theme_membership (user_id, theme_id);
create index if not exists theme_membership_user_entry_idx on theme_membership (user_id, entry_id);

create table if not exists weekly_reflections (
  id uuid primary key default gen_random_uuid(),
  user_id text not null,
  week_start date not null,
  week_end date not null,
  reflection jsonb not null,
  created_at timestamptz default now()
);

create unique index if not exists weekly_reflections_unique
  on weekly_reflections (user_id, week_start, week_end);

create table if not exists journal_embeddings (
  id bigserial primary key,
  user_id text not null,
  entry_id uuid not null references entries(id) on delete cascade,
  embedding vector(384) not null,
  created_at timestamptz default now()
);

create index if not exists journal_embeddings_user_idx on journal_embeddings (user_id);
create index if not exists journal_embeddings_hnsw_idx
  on journal_embeddings using hnsw (embedding vector_cosine_ops);

create or replace function match_journal_entries(
  target_user_id text,
  query_embedding vector(384),
  match_count int
)
returns table (entry_id uuid, similarity real)
language sql stable
as $$
  select entry_id, 1 - (embedding <=> query_embedding) as similarity
  from journal_embeddings
  where user_id = target_user_id
  order by embedding <=> query_embedding
  limit match_count;
$$;

-- Optional: keep updated_at fresh for new tables
create or replace function set_updated_at() returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

create trigger entry_analysis_set_updated_at
before update on entry_analysis
for each row execute function set_updated_at();

create trigger themes_set_updated_at
before update on themes
for each row execute function set_updated_at();

-- RLS NOTE:
-- Phase 2 still uses anon keys from the frontend without auth.
-- Do NOT enable RLS unless you add proper authentication or server-side access.
