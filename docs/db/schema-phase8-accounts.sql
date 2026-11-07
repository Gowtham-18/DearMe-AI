-- DearMe AI Phase 8: real accounts (Google or email + password), run after phase 7.
-- Safe to re-run. Passwords are never stored here: Supabase Auth keeps them as bcrypt hashes
-- in auth.users, which this app cannot read.

-- 1. Usernames: lower-case letters, digits and underscores, 3-20 characters, unique.
alter table public.profiles add column if not exists username text;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'profiles_username_format') then
    alter table public.profiles
      add constraint profiles_username_format check (username is null or username ~ '^[a-z0-9_]{3,20}$');
  end if;
end $$;

create unique index if not exists profiles_username_key on public.profiles (username);

-- 2. Availability check for the sign-up form. Returns only true/false (never who owns a name),
--    and also rejects reserved names. Runs as owner so it can see every profile's username.
create or replace function public.username_available(p_username text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(p_username, '') ~ '^[a-z0-9_]{3,20}$'
     and p_username not in ('admin', 'administrator', 'root', 'support', 'help', 'dearme', 'dearme_ai',
                            'system', 'moderator', 'staff', 'official', 'security', 'privacy', 'null', 'undefined')
     and not exists (select 1 from profiles where username = p_username);
$$;

revoke all on function public.username_available(text) from public;
grant execute on function public.username_available(text) to anon, authenticated;

-- 3. Delete my account: every row the app keeps for the caller, then the login itself.
--    SECURITY DEFINER because auth.users isn't writable by app roles; every statement is
--    scoped to auth.uid(), so it can only ever delete the caller.
create or replace function public.delete_my_account()
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_text text := auth.uid()::text;
begin
  if v_uid is null then
    raise exception 'not authenticated' using errcode = '28000';
  end if;
  delete from memory_facts where user_id = v_text;
  delete from journal_turns where user_id = v_text;
  delete from theme_membership where user_id = v_text;
  delete from themes where user_id = v_text;
  delete from weekly_reflections where user_id = v_text;
  delete from journal_embeddings where user_id = v_text;
  delete from entry_analysis where user_id = v_text;
  delete from entries where user_id = v_text;
  delete from journal_sessions where user_id = v_text;
  delete from profiles where user_id = v_text;
  delete from auth.users where id = v_uid;
end;
$$;

revoke all on function public.delete_my_account() from public, anon;
grant execute on function public.delete_my_account() to authenticated;
