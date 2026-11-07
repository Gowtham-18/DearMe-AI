# Privacy, Data Safety and Security Assessment

_Assessed 2026-11-05 against the live pilot (Vercel web app, Render NLP service, Supabase database). Supersedes the baseline in [threat-model.md](threat-model.md). This is an engineering review, not legal advice._

## Verdict

**Sound for a small, invite-only pilot. Not yet ready for a public launch.**

- Each person's data is walled off from everyone else's at the database level. This is enforced and tested.
- Secrets stay on the server. Journal text is never logged, and AI replies are off unless the person opts in.
- The main gaps are about trust and durability, not leaks:
  - journal text is readable by anyone with database-admin access
  - ~~anonymous accounts can be lost for good~~ (resolved in phase 8: real accounts)
  - there's no abuse protection on sign-up
  - crisis resources are US-only

## What is stored, where

| Data | Where | Notes |
|---|---|---|
| Journal entries, chat turns, mood, time budget | Supabase Postgres (`entries`, `journal_sessions`, `journal_turns`) | Plain text in the database; the disk is encrypted at rest by Supabase/AWS |
| Analysis: tone score, key phrases, safety flags | `entry_analysis` | Derived from the text |
| Embeddings (384-dim vectors of each entry) | `journal_embeddings` (pgvector) | Used for "related past entries". Not readable as text, but derived from it |
| Themes ("Work", "Health") | `themes`, `theme_membership` | |
| Weekly summaries | `weekly_reflections` | |
| Remembered facts: names + relation ("Priya, sister"), dated plans ("job interview, 20 Nov") | `memory_facts` | Owner-only RLS. Shown in Settings, where each can be forgotten or memory turned off. Removed with its source entry and by "Delete data" |
| Profile: name, age, occupation, preferences | `profiles` | Includes the AI-replies consent flag |
| Session token | Browser `localStorage` (`dearme-auth`) | Supabase session (PKCE sign-in) |
| Login: email, username, password hash, linked Google identity | Supabase Auth (`auth.users`, `auth.identities`), `profiles.username` | Passwords are bcrypt hashes kept by Supabase Auth; the app never sees or stores them |
| Rate-limit counters, legacy-claim records | `rate_limits`, `legacy_claims` | Internal |

**Where the text travels.**

- Browser → Vercel API routes → Render NLP service (`dearme-nlp`), for analysis, prompts and replies.
- Every hop uses HTTPS.
- Vercel → Render carries a shared internal token.
- The NLP service runs its own ONNX models in-process. No journal text goes to any third-party AI unless the person has opted in to AI replies **and** an API key is configured. Today no key is configured, so nothing is sent anywhere else (see "AI replies" below).

## What is already in place

1. **Row-level security (RLS) on all 12 tables.**
   - The 9 user-data tables each have one `own rows` policy: `user_id = auth.uid()`.
   - The 3 internal tables have RLS turned on with no policies, so they're unreadable through the API.
2. **Cross-user isolation is tested in CI.** `scripts/test-migrations.mjs` runs every migration on a real Postgres (PGlite), then checks four things:
   - user B can't read, write, delete or vector-search user A's rows
   - signed-out callers can't read journals
   - signed-in callers can't read the internal tables
   - `delete_my_data` removes everything
3. **Only two SECURITY DEFINER functions**, `check_rate_limit` and `claim_legacy_data`.
   - Both pin `search_path=public`.
   - Both act only on the caller's own `auth.uid()`.
   - `delete_my_data`, `match_journal_entries` and `replace_user_themes` run as the caller (SECURITY INVOKER), so RLS still applies to them.
4. **User ID always comes from the verified token**, never from the request body. The API body schemas have no `user_id` field, so anything sent there is dropped.
5. **NLP service is locked.** Its POST endpoints need `x-internal-token`, and `/health` is the only open route.
6. **Server logs carry no journal text.** The NLP service logs only IDs and text lengths (`text_len=...`).
7. **Security headers on every page:**
   - CSP (`default-src 'self'`, `connect-src` limited to Supabase and the NLP service)
   - `X-Frame-Options: DENY`
   - `Referrer-Policy: strict-origin-when-cross-origin`
   - `Permissions-Policy` (camera, microphone and location off)
   - HSTS with preload
8. **Per-user rate limits** on analyze (30/h), chat (40 per 10 min), prompts (60 per 10 min) and weekly (20/h).
9. **The person controls their data.** Settings has "Export my data" (a JSON download) and "Delete my data" (with or without the profile).
10. **AI replies are opt-in.** They're off by default. Turning them on the first time goes through a consent dialog that explains what's sent. There's also a server-side kill switch (`ENABLE_ENHANCED_LANGUAGE`) and daily budgets.
11. **Safety.** Crisis language is detected in both prompts and chat. Support resources appear without ever blocking writing, and AI output is filtered for advice, diagnosis and medical language.

## Findings and recommendations

Ranked by impact for a journaling product.

### High

**H1. Anonymous accounts can be lost permanently.** _Resolved (phase 8)._
- People now sign in with Google or email + password (email confirmed by a one-time code), on any device. Existing guests are sent to sign-up and upgraded in place, so their journal comes with them.
- Remaining: once existing guests have upgraded, turn off anonymous sign-ins and clean up abandoned guest users.

_Original finding:_
- The only key to a person's journal is the session in that one browser's `localStorage`.
- Clearing site data, switching browsers or devices, or private browsing means the journal is gone for good, with no recovery.
- The rows stay in the database, unreachable, forever.

_Recommendation:_
- Offer an optional "Keep my journal safe" upgrade: link an email (magic link) or a passkey to the anonymous user with Supabase `updateUser` / `linkIdentity`. The user ID stays the same, so no data moves.
- Until then, say clearly in Settings that the journal lives in this browser, and nudge people towards "Export my data".
- Schedule a cleanup of anonymous users (and their data) after, say, 180 days of inactivity, and tell people about it.

**H2. Journal text is readable by anyone with admin access to the database.**
- Supabase encrypts the disk, but the text is plain inside Postgres.
- So the project owner, anyone holding the `service_role` key or database password, and Supabase operators (under their own policies) can read entries.
- For a mental-health-adjacent product, this is the biggest trust question.

_Recommendation, cheapest first:_
- Keep the `service_role` key out of the app entirely; it's already unused.
- Rotate the database password, and limit who has dashboard access (turn on 2FA).
- State honestly in the privacy notice who can access the data.
- Later, consider column encryption with Supabase Vault/pgsodium and a key the app server holds.

Full end-to-end encryption, where only the user holds the key, would rule out server-side analysis, prompts and memory. It's a product decision, not just an engineering one.

### Medium

**M1. No abuse protection on anonymous sign-up.** _Mostly resolved (2026-11-07): the API refuses guest tokens and phase 9 blocks guest writes in the database. Remaining step: turn off anonymous sign-ins in the dashboard._
- Rate limits are per user, and anyone can mint unlimited anonymous users. A script could therefore get past the limits and fill the database or keep the NLP service busy.
- _Recommendation:_ turn on Supabase Auth CAPTCHA (Cloudflare Turnstile is free) for anonymous sign-ins, and check the per-IP limit on anonymous sign-ins in Auth → Rate Limits.

**M2. Session token in `localStorage`, plus CSP `script-src 'unsafe-inline'`.**
- Any XSS bug could read the token.
- React escapes content, and there's no raw-HTML rendering of journal text, so the exposure is low. But the CSP isn't a strong second line of defence while inline scripts are allowed.
- _Recommendation:_ move to a nonce-based CSP (Next.js middleware sets a per-request nonce) and drop `'unsafe-inline'` from `script-src`.

**M3. Crisis resources are US-centric.**
- Both the web app and the NLP service show 988 (US) plus findahelpline.com.
- For users in India this should lead with Tele-MANAS **14416** / 1-800-891-4416 and KIRAN 1800-599-0019.
- _Recommendation:_ pick resources by browser locale or time zone. Keep findahelpline.com as the fallback.

**M4. Deleting your data doesn't delete the account.** _Resolved (phase 8): `delete_my_account()` removes every row and the caller's `auth.users` record; Account → Delete account calls it._
- `delete_my_data(p_include_profile => true)` removes every row, but the anonymous `auth.users` record stays (it holds no journal content).
- _Recommendation:_ add a server route that uses the service key **server-side only** to delete the auth user after the data is gone. Or include it in the H1 inactivity cleanup.

**M5. Data residency is not documented.**
- Render's default region is Oregon (US). Confirm the Supabase project's region in the dashboard.
- Under India's DPDP Act 2023 and the GDPR, sending data abroad is allowed with notice, but the privacy notice should name the providers (Vercel, Render, Supabase, and the LLM provider if turned on) and their regions.

### Low

**L1. Leftover table grants.**
- `anon` and `authenticated` still hold SELECT on `app_settings`, `legacy_claims` and `rate_limits`.
- RLS with no policies means no rows come back, but the tables still show up in the GraphQL schema.
- _Fix:_ `revoke all on app_settings, legacy_claims, rate_limits from anon, authenticated;` (the SECURITY DEFINER functions keep working).
- _Status:_ already written and tested in `docs/db/schema-phase6c-hardening.sql`. Checked on 2026-11-05: production still had full grants, so 6c had not been applied there. Run it in the Supabase SQL editor.

**L2. `set_updated_at` has a mutable `search_path`.** _Fix:_ `alter function public.set_updated_at() set search_path = public;` Also in `schema-phase6c-hardening.sql`, and not yet applied on production (2026-11-05).

**L3. `vector` extension is in the `public` schema.** Cosmetic. Moving it to an `extensions` schema is optional, and it's risky on a live database.

**L4. Unused OpenAI variables on Vercel.**
- The web app never reads `OPENAI_*`; only the NLP service would.
- If one of them holds a real key, it's a live secret with no purpose.
- _Fix:_ delete them from the Vercel project (Settings → Environment Variables).

**L5. Backups.** The Supabase free plan has no point-in-time recovery. Before launch, either upgrade (daily backups plus PITR) or run a scheduled `pg_dump` to private storage.

**L6. No access audit trail.** Nothing records who read what. That's acceptable for the pilot; revisit with the H2 work.

**L7. Advisor notes that are expected.**
- "Anonymous access policies" on the user tables is by design: anonymous users are real, signed-in, isolated users.
- "Leaked password protection" doesn't apply, because there are no passwords.

## Accounts (phase 8)

- **Passwords:** handled only by Supabase Auth (bcrypt hashes). Rules: 8–72 bytes, a letter and a number, not a common password, not containing the email or username. Changing a password may require a code (reauthentication nonce).
- **Email ownership:** sign-up, email change and password reset are all confirmed with a one-time code sent to the email.
- **Input handling:** Zod validation on every form, Unicode normalisation and removal of control/zero-width/bidi characters, usernames limited to `^[a-z0-9_]{3,20}$` with a database check constraint and unique index. No SQL is built from strings anywhere; all access is through Supabase's parameterised API under RLS.
- **No account enumeration:** log-in and reset messages are the same whether or not the email exists. `username_available()` returns only true/false and exposes no profile data.
- **Redirects:** PKCE flow; the callback only follows same-site paths.
- **Sessions:** "Log out on all devices" revokes every refresh token.
- **Deletion:** `delete_my_account()` (security definer, caller-only) removes all of the caller's rows and their login.
- **Not changed:** journal text is still plain text inside Postgres (H2). Signing in doesn't change who can read the database.

## AI replies (OpenAI or compatible)

- **Status today: off.**
  - The NLP service on Render has no `OPENAI_API_KEY`, so `llm_available()` is false.
  - Every reply comes from the built-in engine (life areas, question ladder, past-entry memory). No text leaves our own services.
- **When it's on**, it calls any OpenAI-compatible API (`OPENAI_BASE_URL`, `OPENAI_MODEL`, default `gpt-4o-mini`). Four conditions must all hold:
  1. the person turned on "AI replies" **and** accepted the consent dialog
  2. `ENABLE_ENHANCED_LANGUAGE=true` on the server
  3. a key is set
  4. the daily budget isn't spent (80 per user, 3,000 in total)
- **What is sent:**
  - the starting prompt and mood
  - the first name, on the first reply only
  - the last 8 turns of this conversation, each cut to 600 characters
  - the current message
  - the engine's analysis (life area, feeling, stage)
  - up to 2 snippets of related past entries
- **Guardrails on what comes back:**
  - JSON-only output
  - exactly one question, with length limits
  - filters that block diagnosis, therapy or medication talk and "you should"
  - any failure falls back to the built-in reply
- **Provider data use:** OpenAI's API doesn't train on API data by default, and keeps it up to 30 days for abuse monitoring. Groq and others have their own terms. Name the provider in the privacy notice before turning this on.

## End-to-end security review (2026-11-07)

Covered:
- source review of the web app, API routes, NLP service and all SQL
- dependency audits (`pnpm audit`, `pip-audit`)
- a secret scan of the full git history
- live, non-destructive tests against production, using two throwaway accounts that were deleted afterwards

**Passed (93 live checks):**
- **Isolation:** one user can't read, edit, delete, plant or re-own another user's rows. This holds through the API routes and through Supabase directly.
- **Privileged functions:** every SECURITY DEFINER function checks the caller. Signed-out visitors can't reach any table or function. Internal tables (`rate_limits`, `app_settings`, `legacy_claims`) are closed even to signed-in users.
- **API tokens:** routes refuse missing, garbage, forged and anon-key tokens.
- **NLP service:**
  - refuses every POST without the internal token
  - `/docs` and `/openapi.json` are hidden
  - no CORS access from other sites
  - logs contain only ids and lengths
- **Passwords:** the server enforces the password rules (not just the browser). Log-in errors don't reveal accounts.
- **Headers:** HSTS (preload), frame blocking and nosniff are set.
- **Secrets:** no secrets in git history, and the service key isn't used anywhere.
- **SQL injection:** SQL-looking input is rejected or treated as text, and Supabase's gateway blocks obvious injection strings.

**Found and fixed:**

| Severity | Finding | Fix |
|---|---|---|
| Critical | Next.js 16.1.6 had published critical advisories (remote code execution in image optimisation / `use cache`, several denial-of-service and SSRF issues); 56 advisories across production dependencies | Next.js 16.4.5, Zod 4.6.7, patched transitive versions via `pnpm.overrides`: production audit now clean |
| High | NLP service on Starlette 0.40 (via FastAPI 0.115) and python-dotenv 1.0.1 with known advisories | FastAPI 0.162.2, Starlette 1.10.0, Pydantic 2.14.3, Uvicorn 0.54.0, python-dotenv 1.2.4; startup moved to a lifespan handler |
| Medium | Open redirect: `/auth/callback?next=/%09/evil.com` sent signed-in users to another site (browsers drop the tab and read `//evil.com`) | `safeNextPath()` parses with `URL` and only allows the same origin; unit-tested against 10 bypass forms |
| Medium | Anonymous sign-ins still on: anyone could mint unlimited guests, each with fresh rate limits, and use the NLP-backed API or fill the database | API routes refuse guest tokens (403); phase 9 blocks guest inserts/updates in RLS; turn off anonymous sign-ins in the dashboard |
| Medium | No size limits on browser-written text (a 1 MB entry was accepted) | Phase 9 check constraints: entries 100k chars, chat turns 8k, prompts 1k, JSON columns capped |
| Low | A row could reference another user's session/entry id (e.g. a chat turn on someone else's session). Invisible to the owner, but it could block their analysis row for that entry. It also needed an unguessable UUID | Phase 9 restrictive "parent is mine" policies on `journal_turns`, `entry_analysis`, `journal_embeddings`, `theme_membership` |
| Low | Reserved usernames (e.g. `admin`) could be set by writing to `profiles` directly | `is_reserved_username()` check constraint; the sign-up form uses the same list |
| Low | Rate limiter failed open if its check errored | Fails closed |
| Low | `X-Powered-By: Next.js` header | Removed |

**Still open:**
- **H2:** journal text is readable by database admins.
- **M2:** CSP still allows inline scripts; a nonce-based CSP needs per-request rendering.
- **M3:** crisis resources are US-centric.
- **M5:** data residency notice.
- **L5:** backups.
- **Dev tooling:** one moderate dev-only advisory (`minimatch` 10 via eslint).

## Action checklist

| # | Action | Effort | Who |
|---|---|---|---|
| 1 | Delete unused `OPENAI_*` variables from Vercel (L4) | 2 min | Owner (dashboard) |
| 2 | Turn on 2FA for the Supabase, Vercel, Render and GitHub accounts; review who has access (H2) | 10 min | Owner |
| 3 | Enable Turnstile CAPTCHA for anonymous sign-in (M1) | 30 min | Dev + dashboard |
| 4 | Revoke leftover grants and pin `set_updated_at` (L1, L2): apply `schema-phase6c-hardening.sql` on production | 2 min | Owner (SQL editor) |
| 5 | Locale-aware crisis resources, including India helplines (M3) | 1–2 h | Dev |
| 6 | ~~"Keep my journal safe" email or passkey linking (H1)~~ Done: real accounts (phase 8) | — | — |
| 7 | Privacy notice: providers, regions, retention, who can access, AI opt-in (M5, H2) | 0.5 day | Owner + dev |
| 8 | Nonce-based CSP (M2) | 2–3 h | Dev |
| 9 | ~~Delete the auth user (M4)~~ Done (phase 8). Still open: clean up abandoned guest users | 1 h | Dev |
| 10 | Backups beyond the free plan (L5) | — | Owner, before launch |
