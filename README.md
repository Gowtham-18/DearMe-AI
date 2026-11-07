# DearMe AI Monorepo

AI-powered journaling companion with a Next.js web app, FastAPI NLP service, and Supabase persistence.

---

# DearMe AI – System Design & Architecture Documentation

## 1. Overview

DearMe AI is a privacy-first, AI-powered journaling and self-reflection web application designed to help users build emotional awareness, identify behavioral patterns, and track mental well-being over time.

The system is intentionally architected with security, scalability, and modularity as first-class concerns, enabling:

- Safe handling of sensitive user-generated content
- Optional AI augmentation with strict guardrails
- Incremental scaling from MVP to production-grade deployment
- Future migration toward self-hosted AI models for data sovereignty

Presentation / Video submission Link (Loom) : https://www.loom.com/share/8f82ead3ceab4e45a47688b1ff367281
Please check the complete working app here : https://dear-me-ai-webapp.vercel.app/ (It worked now, not during the demo)

## 2. Design Goals & Principles

### 2.1 Core Design Goals

1. Privacy by Design
   - Journals may contain highly sensitive personal data
   - No unnecessary data retention or model training on user content
   - Explicit AI toggle with transparent behavior

2. Security-First Architecture
   - Zero-trust assumptions between services
   - Strong isolation between frontend, backend, and AI services
   - Rate limiting and abuse prevention at multiple layers

3. Scalability & Fault Isolation
   - Horizontally scalable stateless services
   - Async processing for AI workloads
   - Graceful degradation when AI services are unavailable

4. Explainability & Trust
   - Deterministic, non-LLM fallbacks
   - Evidence-backed insights rather than opaque AI outputs
   - Clear UI signals when AI is involved

5. Extensibility
   - Modular pipelines for NLP, embeddings, and analytics
   - Easy replacement of third-party APIs with self-hosted models

## 3. High-Level System Architecture

### 3.1 Architecture Style

- Client–Server with Microservice Separation
- Event-driven AI processing
- Stateless application services
- Database-backed persistence layer

Primary Components

- Web Client (Next.js)
- API & Application Layer
- AI/NLP Microservice
- Persistent Storage
- Observability & Security Controls

## 4. Technology Stack

### 4.1 Frontend Layer

Framework & UI

- Next.js (App Router)
- TypeScript
- Tailwind CSS
- shadcn/ui

Why

- Server Components for reduced client attack surface
- Type safety for large-scale maintainability
- Consistent UI primitives with accessibility baked in

Security Considerations

- Browser database access is limited to the signed-in user's own rows (Supabase Auth + Row Level Security)
- CSP headers enforced at deployment
- Sanitized rendering of user-generated content

### 4.2 Backend & API Layer

Runtime

- Node.js (Edge + Server Functions)
- RESTful APIs with structured JSON contracts

Responsibilities

- Journal lifecycle management
- Session handling
- Feature gating (AI vs non-AI mode)
- Rate limiting enforcement
- Request validation and schema enforcement

Design Choices

- Stateless APIs enable horizontal scaling
- Strict request schemas reduce injection risk
- Explicit separation of AI-triggering endpoints

### 4.3 Database & Storage Layer

Primary Database

- PostgreSQL (Supabase)

Extensions

- pgvector (future-ready for embeddings)

Stored Data

- Journal entries
- Mood signals
- Sentiment scores
- Metadata (timestamps, anonymized user_id)

Why PostgreSQL

- Strong transactional guarantees
- Mature security model
- Native JSON + vector support

Security Controls

- Row Level Security (RLS)
- Least-privilege service roles
- Encrypted at rest

### 4.4 AI / NLP Microservice

Runtime

- Python
- FastAPI

Deployed Separately

- Enables fault isolation
- Independent scaling
- Easier model replacement

NLP Capabilities

| Function             | Model / Technique                  |
| -------------------- | ---------------------------------- |
| Embeddings           | all-MiniLM-L6-v2 (ONNX Runtime)    |
| Emotion + sentiment  | DistilRoBERTa emotion (ONNX int8) + VADER |
| Keyword Extraction   | KeyBERT-style MMR on the embeddings |
| Fallback Keywords    | YAKE                               |
| Clustering (small n) | KMeans                             |
| Clustering (large n) | HDBSCAN                            |

Why Hybrid NLP

- Avoids single-model dependency
- Deterministic fallbacks improve reliability
- Predictable performance for security-sensitive environments

LLM Usage

- Optional
- Explicit user-controlled toggle
- Strict output schema validation
- Refusal rules for unsafe prompts

## 5. Caching Strategy

### 5.1 Client-Side Caching

- SWR-style data fetching
- Optimistic UI updates
- Short-lived cache for insights dashboards

### 5.2 Server-Side Caching

- Derived analytics cached per journal batch
- Idempotent AI results stored to prevent re-computation

Benefits

- Reduced AI costs
- Lower latency
- Protection against replay abuse

## 6. Rate Limiting & Abuse Prevention

### 6.1 Rate Limiting Layers

| Layer      | Mechanism                                                          | Status  |
| ---------- | ------------------------------------------------------------------ | ------- |
| Edge       | IP-based throttling                                                | Planned |
| API        | Per-user fixed-window limits in Postgres (`check_rate_limit`)      | Built   |
| AI Service | Shared-secret access, per-user + global daily OpenAI call budgets | Built   |

Why Multi-Layer

- Defense in depth
- Prevents AI endpoint exhaustion
- Protects against automated scraping

## 7. Scalability Considerations

### 7.1 Horizontal Scaling

- Stateless API servers
- Independent AI service scaling
- Database connection pooling

### 7.2 Async Processing

- AI tasks processed out-of-band
- UI remains responsive
- Failure does not block journaling

## 8. Observability & Monitoring

Metrics

- Request latency
- AI error rates
- Journal creation throughput

Logging

- Structured logs
- No raw journal text in logs
- Trace IDs across services

Alerts

- AI service degradation
- Rate limit anomalies
- Database saturation

## 9. Security Considerations

- Zero-trust service boundaries
- No training on user data
- Explicit AI involvement indicators
- Input sanitization and schema validation
- No cross-tenant data access
- Strict environment variable isolation
- Preparedness for SOC2-style audits

## 10. Future Enhancements

### 10.1 Authentication & Identity

- OAuth (Google, Apple)
- Optional anonymous-to-auth migration
- Device-based trust signals

### 10.2 Self-Hosted AI Models

- On-prem or VPC-deployed LLMs
- Fine-tuned journaling-specific models
- Full data sovereignty
- No third-party inference leakage

### 10.3 Advanced Analytics

- Long-term habit correlation
- Personalized reflection prompts
- Explainable trend insights

### 10.4 Enterprise-Grade Deployment

- Kubernetes-based orchestration
- mTLS between services
- Secrets management via vaults
- Multi-region failover

## 11. Conclusion

DearMe AI is designed not merely as a journaling application, but as a secure, explainable, and scalable AI-assisted system that respects user privacy while enabling meaningful insights.

The architecture reflects modern secure system design principles aligned with Palo Alto Networks’ expectations:

- Defense in depth
- Transparent AI usage
- Modular, auditable components
- Production-ready scalability

---

## Overview
- apps/web: Next.js (App Router, TypeScript) UI
- services/nlp: FastAPI service (local NLP pipeline)
- packages/shared: shared types and Zod schemas
- docs: architecture notes, threat model, and database schema
- Weekly reflection uses a Monday-Sunday week range (local browser time).

## Tech Stack
- Next.js + React + TypeScript
- Tailwind CSS + shadcn/ui
- Supabase (Postgres)
- FastAPI + Pydantic

## Local Development
### Prereqs
- Node.js 20+
- pnpm 10+
- Python 3.11+

### Web app
```
cd apps/web
pnpm install
pnpm dev
```

### NLP service
```
cd services/nlp
python -m venv .venv
.\.venv\Scripts\activate
pip install -r requirements.txt
uvicorn app.main:app --reload
```

### NLP tests
```
cd services/nlp
pip install -r requirements-dev.txt
pytest
```

Web runs at http://localhost:3000
NLP runs at http://localhost:8000

### Run everything from root
```
pnpm dev
```

## Supabase Setup
1) Create a Supabase project.
2) In the SQL editor, run in order: `docs/db/schema.sql`, `schema-phase2.sql` (analysis + pgvector),
   `schema-phase3.sql` (chat sessions), `schema-phase4.sql` (preferences), `schema-phase5.sql`
   (multiple sessions per day), `schema-phase6a-auth-prep.sql`, `schema-phase6b-rls.sql`,
   `schema-phase6c-hardening.sql`, `schema-phase7-memory.sql` (remembered people and plans), then
   `schema-phase8-accounts.sql` (usernames and account deletion), then `schema-phase9-hardening.sql`
   (size limits, reserved names, cross-user reference checks, no guest writes).
3) Authentication: set up sign-in as described in **Accounts and sign-in (Phase 8)** below.
4) Copy environment variables into `apps/web/.env.local`:
```
NEXT_PUBLIC_SUPABASE_URL=...
NEXT_PUBLIC_SUPABASE_ANON_KEY=...
NLP_SERVICE_URL=http://localhost:8000
NLP_INTERNAL_TOKEN=            # same value as the NLP service; empty is fine locally
```

Verify the migrations and RLS policies locally (no Supabase needed):
```
npm install --prefix /tmp/pg @electric-sql/pglite@0.2.17
node scripts/test-migrations.mjs . /tmp/pg
```

## Upgrading an existing deployment to authenticated access (Phase 6)
Order matters, so the live app keeps working at every step:
1) Supabase: enable **Anonymous sign-ins** (step 3 above).
2) Supabase SQL editor: run `docs/db/schema-phase6a-auth-prep.sql` (additive only).
3) Generate a secret (e.g. `openssl rand -hex 32`) and set it as `NLP_INTERNAL_TOKEN` on **both** Render and
   Vercel. On Render also set the build command from `render.yaml`.
4) Deploy the NLP service, then the web app.
5) Supabase SQL editor: run `docs/db/schema-phase6b-rls.sql`. From now on each user can only reach their own rows.

Existing users keep their journals: on their next visit the app signs them in anonymously and moves rows
saved under their old browser id to the new account (`claim_legacy_data`). Claims close 60 days after
step 2; to close them earlier, run
`update app_settings set value = now()::text where key = 'legacy_claim_deadline';`.

## Remembered people and plans (Phase 7)
After each entry is analysed, the NLP service picks out people ("my sister Priya") and dated plans
("my interview is on Friday") with plain rules, and the web app stores them in `memory_facts` (owner-only
rows). Prompts then follow up ("How did your interview go? You mentioned it was yesterday.") and chat
replies can recall them ("You've mentioned your sister Priya before."). People can review, forget, or turn
this off in Settings. To enable it on an existing deployment, run `docs/db/schema-phase7-memory.sql` in the
Supabase SQL editor. Until then the app simply works without memories.

## Accounts and sign-in (Phase 8)
People sign up with **Google**, or with **email + username + password** confirmed by a one-time code sent
to their email. First-time visitors see five welcome slides (`/welcome`) before sign-up or log-in. The
top-right avatar opens the account menu (Account, Privacy & Safety, Log out); `/account` holds the
profile, sign-in methods, password change, "log out on all devices" and account deletion.

- Passwords are handled only by Supabase Auth, which stores bcrypt hashes. The app never stores or logs them.
- Inputs are validated with Zod on every form (`apps/web/lib/auth-validation.ts`): email format, username
  `^[a-z0-9_]{3,20}$` (reserved names blocked), passwords of 8–72 bytes with a letter and a number, not a
  common password and not containing the email or username. Text is Unicode-normalised and stripped of
  control, zero-width and direction-override characters. All database access goes through Supabase's
  parameterised API and RLS, so there is no SQL string building to inject into.
- Error messages don't reveal whether an email has an account.
- Sign-in uses the PKCE flow; `/auth/callback` only redirects to same-site paths.
- Guests from the anonymous-account era are sent to sign-up; their journal stays with them because the
  account is upgraded in place (same user id).

Supabase dashboard setup:
1) SQL editor: run `docs/db/schema-phase8-accounts.sql` **before** deploying the web app.
2) Authentication -> Sign In / Providers: enable **Email** with **Confirm email** on, set the minimum
   password length to 8 (letters and digits); enable **Google** (client id and secret from Google Cloud).
   Turn on **Allow manual linking** so guests and existing users can connect Google.
3) Authentication -> Emails -> Templates: make **Confirm signup**, **Change email address**,
   **Reset password** and **Reauthentication** show the code with `{{ .Token }}`.
4) Authentication -> Emails -> SMTP: set up a custom SMTP provider (for example Resend). The built-in
   sender only reaches project team members and is heavily rate-limited.
5) Authentication -> URL Configuration: Site URL = your Vercel URL; add `https://<your-app>/auth/callback`
   and `http://localhost:3000/**` to Redirect URLs.
6) Once existing guests have upgraded, anonymous sign-ins can be turned off.

## Env Var Setup
- Copy `apps/web/.env.example` to `apps/web/.env.local`, and `services/nlp/.env.example` to `services/nlp/.env`.
- `NLP_INTERNAL_TOKEN` must match on web and NLP. When it is set, the NLP service rejects any POST without it.
- Sentiment: `SENTIMENT_SOURCE=emotion` (default; derived from the emotion model) or `vader`.
- Memory: `NLP_LOW_MEMORY=true` skips the emotion model (lexicon emotion + VADER), saving about 100 MB.
- Enhanced wording: `ENABLE_ENHANCED_LANGUAGE`, `OPENAI_API_KEY`, `OPENAI_MODEL`, `OPENAI_TIMEOUT_S`,
  `OPENAI_DAILY_LIMIT_PER_USER`, `OPENAI_DAILY_LIMIT`. It only runs for users who opt in under Settings.
- Request limits: `MAX_TEXT_LENGTH`, `MAX_ANALYZE_CHARS`, `MAX_ENTRIES_PER_REQUEST`, `MAX_THEME_ENTRIES`.
- Never commit real secrets or user data.

## Deployment
### Web (Vercel)
- Root Directory: `apps/web`
- Install command: `pnpm install`
- Build command: `pnpm build`
- Env vars: `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `NLP_SERVICE_URL`, `NLP_INTERNAL_TOKEN`

### NLP (Render)
- Root directory: `services/nlp`
- Build command (also downloads the pinned models, so a new instance starts in seconds):
  `pip install --upgrade pip && pip install --only-binary=:all: -r requirements.txt && python -m app.fetch_models`
- Start command: `uvicorn app.main:app --host 0.0.0.0 --port $PORT --workers 1`
- Health check path: `/health` (also reports which models loaded)
- Runtime: `services/nlp/runtime.txt`
- Env vars: `NLP_INTERNAL_TOKEN`, `CORS_ORIGINS`, `SENTIMENT_SOURCE`, `NLP_LOW_MEMORY`, `NLP_THREADS`,
  `MALLOC_ARENA_MAX=2`, `LOG_LEVEL`, `ENABLE_ENHANCED_LANGUAGE`, `OPENAI_API_KEY` (and the other `OPENAI_*` settings above)
- Memory: the models run on ONNX Runtime (no torch). Measured locally: ~360 MB idle, ~430 MB peak on
  6,000-character entries, so the free 512 MB instance fits. Inference runs one request at a time to keep
  that peak flat. The port opens immediately and models load in the background; `/health` shows when they are ready.

## Security Notes
- Every user is a Supabase Auth user (Google or email + password). Row Level Security limits every table to
  `user_id = auth.uid()`; the signed-out `anon` role has no table access.
- API routes take the user id from the verified access token, never from the request body.
- The NLP service accepts POSTs only with the shared `X-Internal-Token`; it has no database access.
- Journal text is never logged (only ids and lengths).
- Passwords are stored only as bcrypt hashes by Supabase Auth. "Delete account" removes every row and the
  login itself (`delete_my_account`). Settings offers a JSON export.
- Enhanced wording sends the latest message and up to two related past snippets to OpenAI, only for users
  who opted in, and only re-words the deterministic reply (overlap + policy checks).
