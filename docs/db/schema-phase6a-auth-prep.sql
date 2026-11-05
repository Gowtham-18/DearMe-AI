-- DearMe AI Phase 6a: auth preparation (additive, safe to run while the old app is live)
-- Run BEFORE deploying the web app that uses Supabase anonymous sign-in.
-- Then deploy, then run schema-phase6b-rls.sql.

-- 1. Per-session entries and session settings -------------------------------------------

alter table if exists journal_sessions
  add column if not exists mood text,
  add column if not exists time_budget integer check (time_budget is null or time_budget in (3, 5, 7, 10));

alter table if exists entries
  add column if not exists session_id uuid references journal_sessions(id) on delete set null;

create unique index if not exists entries_session_unique on entries (session_id) where session_id is not null;
create index if not exists journal_turns_user_idx on journal_turns (user_id);
create index if not exists journal_sessions_user_idx on journal_sessions (user_id);
create index if not exists themes_user_idx on themes (user_id);
create index if not exists weekly_reflections_user_idx on weekly_reflections (user_id);

-- 2. Private helper tables (no client access; used only by SECURITY DEFINER functions) -----

create table if not exists app_settings (
  key text primary key,
  value text not null
);
alter table app_settings enable row level security;

insert into app_settings (key, value)
values ('legacy_claim_deadline', (now() + interval '60 days')::text)
on conflict (key) do nothing;

create table if not exists legacy_claims (
  legacy_id text primary key,
  claimed_by uuid not null,
  claimed_at timestamptz not null default now()
);
alter table legacy_claims enable row level security;

create table if not exists rate_limits (
  user_id uuid not null,
  bucket text not null,
  window_start timestamptz not null default now(),
  count integer not null default 0,
  primary key (user_id, bucket)
);
alter table rate_limits enable row level security;

-- 3. Move data from a pre-auth localStorage id to the signed-in (anonymous) user ----------
-- A legacy id is a random UUID that only ever lived in that browser's localStorage.
-- Guards: caller must be signed in; ids belonging to real auth users can never be claimed;
-- each legacy id can be claimed once; claims close at app_settings.legacy_claim_deadline.

create or replace function public.claim_legacy_data(p_legacy_id text)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid text := auth.uid()::text;
  v_total integer := 0;
  v_rows integer;
  v_deadline timestamptz;
begin
  if v_uid is null then
    raise exception 'not authenticated' using errcode = '28000';
  end if;
  if p_legacy_id is null or length(p_legacy_id) < 8 or p_legacy_id = v_uid then
    return 0;
  end if;

  select value::timestamptz into v_deadline from app_settings where key = 'legacy_claim_deadline';
  if v_deadline is not null and now() > v_deadline then
    return 0;
  end if;
  if exists (select 1 from auth.users where id::text = p_legacy_id) then
    return 0;
  end if;
  if exists (select 1 from legacy_claims where legacy_id = p_legacy_id) then
    return 0;
  end if;

  insert into legacy_claims (legacy_id, claimed_by) values (p_legacy_id, auth.uid());

  if not exists (select 1 from profiles where user_id = v_uid) then
    update profiles set user_id = v_uid where user_id = p_legacy_id;
  end if;

  update entries set user_id = v_uid where user_id = p_legacy_id;
  get diagnostics v_rows = row_count; v_total := v_total + v_rows;
  update journal_sessions set user_id = v_uid where user_id = p_legacy_id;
  get diagnostics v_rows = row_count; v_total := v_total + v_rows;
  update journal_turns set user_id = v_uid where user_id = p_legacy_id;
  update entry_analysis set user_id = v_uid where user_id = p_legacy_id;
  update journal_embeddings set user_id = v_uid where user_id = p_legacy_id;
  update themes set user_id = v_uid where user_id = p_legacy_id;
  update theme_membership set user_id = v_uid where user_id = p_legacy_id;
  update weekly_reflections set user_id = v_uid where user_id = p_legacy_id;

  return v_total;
end;
$$;

-- 4. Atomic theme replacement (was: delete-all then insert from the API, non-transactional) ---

create or replace function public.replace_user_themes(p_themes jsonb)
returns integer
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_uid text := auth.uid()::text;
  v_theme jsonb;
  v_theme_id uuid;
  v_count integer := 0;
begin
  if v_uid is null then
    raise exception 'not authenticated' using errcode = '28000';
  end if;

  delete from theme_membership where user_id = v_uid;
  delete from themes where user_id = v_uid;

  for v_theme in select value from jsonb_array_elements(coalesce(p_themes, '[]'::jsonb)) loop
    v_theme_id := coalesce((v_theme->>'id')::uuid, gen_random_uuid());
    insert into themes (id, user_id, label, keywords, strength)
    values (
      v_theme_id,
      v_uid,
      left(coalesce(v_theme->>'label', 'Unlabeled theme'), 120),
      coalesce(v_theme->'keywords', '[]'::jsonb),
      coalesce((v_theme->>'strength')::real, 0)
    );

    insert into theme_membership (user_id, theme_id, entry_id, score)
    select v_uid, v_theme_id, (member->>'entry_id')::uuid, coalesce((member->>'score')::real, 0)
    from jsonb_array_elements(coalesce(v_theme->'members', '[]'::jsonb)) as member
    where exists (
      select 1 from entries e where e.id = (member->>'entry_id')::uuid and e.user_id = v_uid
    );

    v_count := v_count + 1;
  end loop;

  return v_count;
end;
$$;

-- 5. Atomic "delete my data" -------------------------------------------------------------

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

-- 6. Per-user fixed-window rate limit, shared across all serverless instances --------------

create or replace function public.check_rate_limit(p_bucket text, p_limit integer, p_window_seconds integer)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_limit integer := greatest(1, least(p_limit, 10000));
  v_window interval := make_interval(secs => greatest(1, least(p_window_seconds, 86400)));
  v_count integer;
begin
  if v_uid is null then
    return false;
  end if;

  insert into rate_limits as rl (user_id, bucket, window_start, count)
  values (v_uid, left(p_bucket, 40), now(), 1)
  on conflict (user_id, bucket) do update
    set count = case when rl.window_start < now() - v_window then 1 else rl.count + 1 end,
        window_start = case when rl.window_start < now() - v_window then now() else rl.window_start end
  returning count into v_count;

  return v_count <= v_limit;
end;
$$;

-- 7. Function privileges: signed-in users only -------------------------------------------

revoke all on function public.claim_legacy_data(text) from public, anon;
revoke all on function public.replace_user_themes(jsonb) from public, anon;
revoke all on function public.delete_my_data(boolean) from public, anon;
revoke all on function public.check_rate_limit(text, integer, integer) from public, anon;
grant execute on function public.claim_legacy_data(text) to authenticated;
grant execute on function public.replace_user_themes(jsonb) to authenticated;
grant execute on function public.delete_my_data(boolean) to authenticated;
grant execute on function public.check_rate_limit(text, integer, integer) to authenticated;
