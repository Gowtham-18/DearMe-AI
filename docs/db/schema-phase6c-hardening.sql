-- DearMe AI Phase 6c: hardening from the Supabase security advisor (run after phase 6b).
-- Safe to re-run. Changes permissions only; no data is touched.

-- 1. Internal tables are only used by the SECURITY DEFINER functions from phase 6a
--    (claim_legacy_data, check_rate_limit). No role needs direct access, and signed-out
--    visitors shouldn't even see their names in the API / GraphQL schema.
revoke all on table public.app_settings, public.legacy_claims, public.rate_limits from anon, authenticated;

-- 2. Pin the trigger function's search_path so it can't be redirected to another schema.
alter function public.set_updated_at() set search_path = public;
