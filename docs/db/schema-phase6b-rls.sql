-- DearMe AI Phase 6b: Row Level Security (run AFTER the auth-enabled web app is deployed)
-- From here on, every row is visible only to the signed-in user whose id matches user_id.
-- The anon (signed-out) role gets no table access at all.

do $$
declare
  t text;
begin
  foreach t in array array[
    'profiles', 'entries', 'entry_analysis', 'journal_embeddings', 'themes',
    'theme_membership', 'weekly_reflections', 'journal_sessions', 'journal_turns'
  ] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists "own rows" on public.%I', t);
    execute format(
      'create policy "own rows" on public.%I for all to authenticated '
      'using (user_id = (select auth.uid())::text) '
      'with check (user_id = (select auth.uid())::text)',
      t
    );
    execute format('revoke all on table public.%I from anon', t);
  end loop;
end
$$;

-- Vector search: callers can only ever search their own embeddings.
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
  order by embedding <=> query_embedding
  limit least(greatest(match_count, 1), 20);
$$;

revoke all on function public.match_journal_entries(text, vector, int) from public, anon;
grant execute on function public.match_journal_entries(text, vector, int) to authenticated;

-- To close legacy (pre-auth) data claims early:
--   update app_settings set value = now()::text where key = 'legacy_claim_deadline';
