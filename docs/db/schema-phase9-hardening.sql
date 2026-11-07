-- DearMe AI Phase 9: security hardening from the end-to-end review (2026-11-07).
-- Additive and safe to re-run. Constraints are added NOT VALID, so existing rows are left
-- alone and only new or changed rows are checked.

-- 1. Size limits on text written straight from the browser ----------------------------------
--    Before this, one request could store megabytes in a single row.
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'entries_content_size') then
    alter table public.entries add constraint entries_content_size
      check (char_length(content) <= 100000) not valid;
  end if;
  if not exists (select 1 from pg_constraint where conname = 'entries_mood_size') then
    alter table public.entries add constraint entries_mood_size
      check (mood is null or char_length(mood) <= 40) not valid;
  end if;
  if not exists (select 1 from pg_constraint where conname = 'journal_turns_content_size') then
    alter table public.journal_turns add constraint journal_turns_content_size
      check (char_length(content) <= 8000) not valid;
  end if;
  if not exists (select 1 from pg_constraint where conname = 'journal_turns_role_values') then
    alter table public.journal_turns add constraint journal_turns_role_values
      check (role in ('user', 'assistant')) not valid;
  end if;
  if not exists (select 1 from pg_constraint where conname = 'journal_sessions_text_size') then
    alter table public.journal_sessions add constraint journal_sessions_text_size
      check (char_length(selected_prompt_text) <= 1000
             and char_length(selected_prompt_id) <= 200
             and (mood is null or char_length(mood) <= 40)) not valid;
  end if;
  if not exists (select 1 from pg_constraint where conname = 'weekly_reflections_size') then
    alter table public.weekly_reflections add constraint weekly_reflections_size
      check (pg_column_size(reflection) <= 200000) not valid;
  end if;
  if not exists (select 1 from pg_constraint where conname = 'profiles_preferences_size') then
    alter table public.profiles add constraint profiles_preferences_size
      check (pg_column_size(preferences) <= 8000) not valid;
  end if;
  if not exists (select 1 from pg_constraint where conname = 'themes_text_size') then
    alter table public.themes add constraint themes_text_size
      check (char_length(label) <= 120 and pg_column_size(keywords) <= 10000) not valid;
  end if;
end
$$;

-- 2. Reserved usernames enforced by the database, not only by the sign-up form --------------
create or replace function public.is_reserved_username(p_username text)
returns boolean
language sql
immutable
set search_path = public
as $$
  select lower(coalesce(p_username, '')) = any (array[
    'admin', 'administrator', 'root', 'support', 'help', 'dearme', 'dearme_ai', 'official',
    'moderator', 'mod', 'staff', 'system', 'security', 'privacy', 'null', 'undefined',
    'me', 'you', 'account', 'settings', 'login', 'signup', 'api'
  ]);
$$;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'profiles_username_not_reserved') then
    alter table public.profiles add constraint profiles_username_not_reserved
      check (username is null or not public.is_reserved_username(username)) not valid;
  end if;
end
$$;

create or replace function public.username_available(p_username text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select p_username ~ '^[a-z0-9_]{3,20}$'
    and not public.is_reserved_username(p_username)
    and not exists (select 1 from profiles where username = p_username);
$$;

revoke all on function public.username_available(text) from public;
grant execute on function public.username_available(text) to anon, authenticated;

-- 3. Child rows must belong to the caller's own parent row ----------------------------------
--    "own rows" already limits user_id to the caller. These extra (restrictive) policies also
--    stop a row from pointing at someone else's session, entry or theme.
drop policy if exists "parent is mine" on public.journal_turns;
create policy "parent is mine" on public.journal_turns as restrictive for all to authenticated
  using (true)
  with check (exists (select 1 from public.journal_sessions s
                      where s.id = session_id and s.user_id = (select auth.uid())::text));

drop policy if exists "parent is mine" on public.entry_analysis;
create policy "parent is mine" on public.entry_analysis as restrictive for all to authenticated
  using (true)
  with check (exists (select 1 from public.entries e
                      where e.id = entry_id and e.user_id = (select auth.uid())::text));

drop policy if exists "parent is mine" on public.journal_embeddings;
create policy "parent is mine" on public.journal_embeddings as restrictive for all to authenticated
  using (true)
  with check (exists (select 1 from public.entries e
                      where e.id = entry_id and e.user_id = (select auth.uid())::text));

drop policy if exists "parent is mine" on public.theme_membership;
create policy "parent is mine" on public.theme_membership as restrictive for all to authenticated
  using (true)
  with check (
    (entry_id is null or exists (select 1 from public.entries e
                                 where e.id = entry_id and e.user_id = (select auth.uid())::text))
    and (theme_id is null or exists (select 1 from public.themes t
                                     where t.id = theme_id and t.user_id = (select auth.uid())::text))
  );

-- 4. Guest (anonymous) sessions can read and delete their data but not write new data -------
--    Guests are sent to sign-up before they can use the app, so only scripts would write as
--    a guest. Upgraded accounts get is_anonymous = false and are unaffected.
do $$
declare
  t text;
begin
  foreach t in array array[
    'profiles', 'entries', 'entry_analysis', 'journal_embeddings', 'themes', 'theme_membership',
    'weekly_reflections', 'journal_sessions', 'journal_turns', 'memory_facts'
  ] loop
    execute format('drop policy if exists "no guest inserts" on public.%I', t);
    execute format(
      'create policy "no guest inserts" on public.%I as restrictive for insert to authenticated '
      'with check (coalesce(((select auth.jwt()) ->> ''is_anonymous'')::boolean, false) = false)', t);
    execute format('drop policy if exists "no guest updates" on public.%I', t);
    execute format(
      'create policy "no guest updates" on public.%I as restrictive for update to authenticated '
      'using (true) '
      'with check (coalesce(((select auth.jwt()) ->> ''is_anonymous'')::boolean, false) = false)', t);
  end loop;
end
$$;
