-- DearMe AI Phase 7: remembered facts (people and upcoming events), run after phase 6c.
-- Safe to re-run. Adds one table and one function, and teaches delete_my_data about the table.
--
-- The NLP service picks out people ("my sister Priya") and dated events ("my exam is on Friday")
-- from each saved entry. They are stored here so prompts and replies can follow up later
-- ("How did your exam go?"). People can see and delete every fact in Settings, or turn this off.

create table if not exists public.memory_facts (
  id uuid primary key default gen_random_uuid(),
  user_id text not null default (auth.uid())::text,
  kind text not null check (kind in ('person', 'event')),
  -- Normalised identity, e.g. 'person:priya', 'person:rel:boss', 'event:job interview:2026-11-20'.
  fact_key text not null check (char_length(fact_key) <= 160),
  label text not null check (char_length(label) between 1 and 80),
  detail text null check (detail is null or char_length(detail) <= 80),
  event_date date null,
  -- The latest entry that mentioned it. Deleting that entry forgets the fact too.
  source_entry_id uuid null references public.entries(id) on delete cascade,
  mention_count integer not null default 1 check (mention_count >= 1),
  first_seen date not null default current_date,
  last_seen date not null default current_date,
  -- The person's local date when they last answered a follow-up about it.
  followed_up_on date null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, fact_key)
);

create index if not exists memory_facts_user_seen_idx on public.memory_facts (user_id, last_seen desc);
create index if not exists memory_facts_source_entry_idx on public.memory_facts (source_entry_id);

drop trigger if exists memory_facts_set_updated_at on public.memory_facts;
create trigger memory_facts_set_updated_at
before update on public.memory_facts
for each row execute function set_updated_at();

alter table public.memory_facts enable row level security;
drop policy if exists "own rows" on public.memory_facts;
create policy "own rows" on public.memory_facts for all to authenticated
  using (user_id = (select auth.uid())::text)
  with check (user_id = (select auth.uid())::text);
revoke all on table public.memory_facts from anon;

-- Upsert the facts found in one entry. Runs as the caller, so RLS still applies.
-- Re-analysing the same entry doesn't inflate mention_count.
create or replace function public.remember_facts(p_entry_id uuid, p_facts jsonb)
returns integer
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_uid text := auth.uid()::text;
  v_count integer;
begin
  if v_uid is null then
    raise exception 'not authenticated' using errcode = '28000';
  end if;
  if p_facts is null or jsonb_typeof(p_facts) <> 'array' then
    return 0;
  end if;
  -- RLS applies here, so this only finds the caller's own entry.
  if p_entry_id is not null and not exists (select 1 from entries where id = p_entry_id) then
    return 0;
  end if;

  insert into memory_facts as m (user_id, kind, fact_key, label, detail, event_date, source_entry_id, first_seen, last_seen)
  select distinct on (lower(left(f->>'key', 160)))
    v_uid,
    f->>'kind',
    lower(left(f->>'key', 160)),
    left(f->>'label', 80),
    nullif(left(coalesce(f->>'detail', ''), 80), ''),
    nullif(f->>'event_date', '')::date,
    p_entry_id,
    coalesce(nullif(f->>'seen_on', '')::date, current_date),
    coalesce(nullif(f->>'seen_on', '')::date, current_date)
  from (select value as f from jsonb_array_elements(p_facts) limit 20) items
  where f->>'kind' in ('person', 'event') and coalesce(f->>'key', '') <> '' and coalesce(f->>'label', '') <> ''
  on conflict (user_id, fact_key) do update set
    mention_count = m.mention_count + case when m.source_entry_id is not distinct from excluded.source_entry_id then 0 else 1 end,
    detail = coalesce(excluded.detail, m.detail),
    source_entry_id = excluded.source_entry_id,
    last_seen = greatest(m.last_seen, excluded.last_seen);

  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

revoke all on function public.remember_facts(uuid, jsonb) from public, anon;
grant execute on function public.remember_facts(uuid, jsonb) to authenticated;

-- delete_my_data now also forgets remembered facts (same signature, so grants are kept).
create or replace function public.delete_my_data(p_include_profile boolean default true)
returns void
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_uid text := auth.uid()::text;
begin
  if v_uid is null then
    raise exception 'not authenticated' using errcode = '28000';
  end if;
  delete from memory_facts where user_id = v_uid;
  delete from journal_turns where user_id = v_uid;
  delete from theme_membership where user_id = v_uid;
  delete from themes where user_id = v_uid;
  delete from weekly_reflections where user_id = v_uid;
  delete from journal_embeddings where user_id = v_uid;
  delete from entry_analysis where user_id = v_uid;
  delete from entries where user_id = v_uid;
  delete from journal_sessions where user_id = v_uid;
  if p_include_profile then
    delete from profiles where user_id = v_uid;
  end if;
end;
$$;
