-- DearMe AI Phase 10: journal lock (optional end-to-end encryption), run after phase 9.
-- Safe to re-run.
--
-- With journal lock on, the browser encrypts what a person writes before saving it. Encrypted values
-- are text that starts with 'enc:v1:'. The database never sees the passphrase or the key: it stores the
-- journal key only wrapped (encrypted) by the passphrase and by a recovery code, and can't unwrap either.
--
-- This migration:
--   1. adds journal_keys (one row per person who turned journal lock on),
--   2. lets embeddings be stored encrypted (embedding_enc) instead of as a searchable vector,
--   3. makes room for encrypted values in the size limits (ciphertext is longer than the text),
--   4. stops remember_facts / replace_user_themes from truncating encrypted values,
--   5. makes delete_my_data and delete_my_account remove the wrapped key as well.

-- 1. Wrapped journal keys ----------------------------------------------------------------------

create table if not exists public.journal_keys (
  user_id text primary key default (auth.uid())::text,
  version integer not null default 1 check (version = 1),
  kdf_iterations integer not null check (kdf_iterations between 100000 and 10000000),
  passphrase_salt text not null check (char_length(passphrase_salt) between 16 and 64),
  passphrase_wrapped text not null check (char_length(passphrase_wrapped) between 32 and 256),
  recovery_salt text not null check (char_length(recovery_salt) between 16 and 64),
  recovery_wrapped text not null check (char_length(recovery_wrapped) between 32 and 256),
  key_check text not null check (key_check like 'enc:v1:%' and char_length(key_check) <= 256),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

drop trigger if exists journal_keys_set_updated_at on public.journal_keys;
create trigger journal_keys_set_updated_at
before update on public.journal_keys
for each row execute function set_updated_at();

alter table public.journal_keys enable row level security;
drop policy if exists "own rows" on public.journal_keys;
create policy "own rows" on public.journal_keys for all to authenticated
  using (user_id = (select auth.uid())::text)
  with check (user_id = (select auth.uid())::text);
drop policy if exists "no guest inserts" on public.journal_keys;
create policy "no guest inserts" on public.journal_keys as restrictive for insert to authenticated
  with check (coalesce(((select auth.jwt()) ->> 'is_anonymous')::boolean, false) = false);
drop policy if exists "no guest updates" on public.journal_keys;
create policy "no guest updates" on public.journal_keys as restrictive for update to authenticated
  using (true)
  with check (coalesce(((select auth.jwt()) ->> 'is_anonymous')::boolean, false) = false);
revoke all on table public.journal_keys from anon;

-- 2. Encrypted embeddings ----------------------------------------------------------------------
--    A locked journal stores its "fingerprints" encrypted, and similar entries are found in the
--    browser after decrypting them. The vector column stays for everyone else.

alter table public.journal_embeddings add column if not exists embedding_enc text null;
alter table public.journal_embeddings alter column embedding drop not null;
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'journal_embeddings_one_form') then
    alter table public.journal_embeddings add constraint journal_embeddings_one_form
      check ((embedding is not null) <> (embedding_enc is not null)
             and (embedding_enc is null or (embedding_enc like 'enc:v1:%' and char_length(embedding_enc) <= 20000)))
      not valid;
  end if;
end
$$;

create or replace function public.match_journal_entries(
  target_user_id text,
  query_embedding vector(384),
  match_count int
)
returns table (entry_id uuid, similarity real)
language sql
stable
security invoker
set search_path = public
as $$
  select entry_id, (1 - (embedding <=> query_embedding))::real as similarity
  from journal_embeddings
  where user_id = (select auth.uid())::text
    and target_user_id = (select auth.uid())::text
    and embedding is not null
  order by embedding <=> query_embedding
  limit least(greatest(match_count, 1), 20);
$$;

revoke all on function public.match_journal_entries(text, vector, int) from public, anon;
grant execute on function public.match_journal_entries(text, vector, int) to authenticated;

-- 3. Size limits that allow for encryption -----------------------------------------------------
--    Plain text keeps its phase 9 limit. An encrypted value is longer (4/3 for base64, up to 4 bytes
--    per character, plus 35 characters of overhead), so it gets its own, larger limit.

create or replace function public.is_sealed(p_value text)
returns boolean
language sql
immutable
set search_path = public
as $$ select p_value like 'enc:v1:%' $$;

do $$
begin
  alter table public.entries drop constraint if exists entries_content_size;
  alter table public.entries add constraint entries_content_size
    check (char_length(content) <= 100000 or (public.is_sealed(content) and char_length(content) <= 540000)) not valid;

  alter table public.journal_turns drop constraint if exists journal_turns_content_size;
  alter table public.journal_turns add constraint journal_turns_content_size
    check (char_length(content) <= 8000 or (public.is_sealed(content) and char_length(content) <= 44000)) not valid;

  alter table public.journal_sessions drop constraint if exists journal_sessions_text_size;
  alter table public.journal_sessions add constraint journal_sessions_text_size
    check ((char_length(selected_prompt_text) <= 1000
            or (public.is_sealed(selected_prompt_text) and char_length(selected_prompt_text) <= 6000))
           and char_length(selected_prompt_id) <= 200
           and (mood is null or char_length(mood) <= 40)) not valid;

  alter table public.themes drop constraint if exists themes_text_size;
  alter table public.themes add constraint themes_text_size
    check ((char_length(label) <= 120 or (public.is_sealed(label) and char_length(label) <= 800))
           and pg_column_size(keywords) <= 16000) not valid;

  -- memory_facts had inline checks (label 1..80, detail <= 80).
  alter table public.memory_facts drop constraint if exists memory_facts_label_check;
  alter table public.memory_facts drop constraint if exists memory_facts_label_size;
  alter table public.memory_facts add constraint memory_facts_label_size
    check (char_length(label) between 1 and 80 or (public.is_sealed(label) and char_length(label) <= 600)) not valid;
  alter table public.memory_facts drop constraint if exists memory_facts_detail_check;
  alter table public.memory_facts drop constraint if exists memory_facts_detail_size;
  alter table public.memory_facts add constraint memory_facts_detail_size
    check (detail is null or char_length(detail) <= 80 or (public.is_sealed(detail) and char_length(detail) <= 600)) not valid;
end
$$;

-- 4. Don't cut encrypted values short -----------------------------------------------------------
--    Same as phase 7 / 6a, except an encrypted label or detail is stored whole (truncating it would
--    make it impossible to decrypt). Locked journals send fact keys as 'h:' + an HMAC, never as text.

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
  if p_entry_id is not null and not exists (select 1 from entries where id = p_entry_id) then
    return 0;
  end if;

  insert into memory_facts as m (user_id, kind, fact_key, label, detail, event_date, source_entry_id, first_seen, last_seen)
  select distinct on (lower(left(f->>'key', 160)))
    v_uid,
    f->>'kind',
    lower(left(f->>'key', 160)),
    case when public.is_sealed(f->>'label') then f->>'label' else left(f->>'label', 80) end,
    case when public.is_sealed(f->>'detail') then f->>'detail'
         else nullif(left(coalesce(f->>'detail', ''), 80), '') end,
    nullif(f->>'event_date', '')::date,
    p_entry_id,
    coalesce(nullif(f->>'seen_on', '')::date, current_date),
    coalesce(nullif(f->>'seen_on', '')::date, current_date)
  from (select value as f from jsonb_array_elements(p_facts) limit 20) items
  where f->>'kind' in ('person', 'event') and coalesce(f->>'key', '') <> '' and coalesce(f->>'label', '') <> ''
  on conflict (user_id, fact_key) do update set
    mention_count = m.mention_count + case when m.source_entry_id is not distinct from excluded.source_entry_id then 0 else 1 end,
    detail = coalesce(excluded.detail, m.detail),
    label = case when public.is_sealed(excluded.label) then excluded.label else m.label end,
    source_entry_id = excluded.source_entry_id,
    last_seen = greatest(m.last_seen, excluded.last_seen);

  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

revoke all on function public.remember_facts(uuid, jsonb) from public, anon;
grant execute on function public.remember_facts(uuid, jsonb) to authenticated;

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
  v_label text;
  v_count integer := 0;
begin
  if v_uid is null then
    raise exception 'not authenticated' using errcode = '28000';
  end if;

  delete from theme_membership where user_id = v_uid;
  delete from themes where user_id = v_uid;

  for v_theme in select value from jsonb_array_elements(coalesce(p_themes, '[]'::jsonb)) loop
    v_theme_id := coalesce((v_theme->>'id')::uuid, gen_random_uuid());
    v_label := coalesce(v_theme->>'label', 'Unlabeled theme');
    insert into themes (id, user_id, label, keywords, strength)
    values (
      v_theme_id,
      v_uid,
      case when public.is_sealed(v_label) then v_label else left(v_label, 120) end,
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

revoke all on function public.replace_user_themes(jsonb) from public, anon;
grant execute on function public.replace_user_themes(jsonb) to authenticated;

-- 5. Deleting data also deletes the wrapped key ------------------------------------------------
--    "Delete my data" keeps the profile (and journal lock) when asked to; deleting everything or the
--    account removes the key too.

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
    delete from journal_keys where user_id = v_uid;
    delete from profiles where user_id = v_uid;
  end if;
end;
$$;

revoke all on function public.delete_my_data(boolean) from public, anon;
grant execute on function public.delete_my_data(boolean) to authenticated;

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
  delete from journal_keys where user_id = v_text;
  delete from profiles where user_id = v_text;
  delete from auth.users where id = v_uid;
end;
$$;

revoke all on function public.delete_my_account() from public, anon;
grant execute on function public.delete_my_account() to authenticated;
