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
| Embeddings           | SentenceTransformers               |
| Sentiment            | Small Transformer + VADER fallback |
| Keyword Extraction   | KeyBERT                            |
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
   (multiple sessions per day), `schema-phase6a-auth-prep.sql`, then `schema-phase6b-rls.sql`.
3) Authentication -> Sign In / Providers -> enable **Anonymous sign-ins**. People get a private account
   on first visit with no sign-up form.
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

## Env Var Setup
- Copy `apps/web/.env.example` to `apps/web/.env.local`, and `services/nlp/.env.example` to `services/nlp/.env`.
- `NLP_INTERNAL_TOKEN` must match on web and NLP. When it is set, the NLP service rejects any POST without it.
- Sentiment: `SENTIMENT_SOURCE=emotion` (default; derived from the emotion model), `transformer`, or `vader`.
- Memory: `NLP_LOW_MEMORY=true` skips the emotion transformer (lexicon emotion + VADER) for small instances.
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
- Build command (installs the CPU-only torch wheel; the default Linux wheel adds ~2 GB of CUDA libraries):
  `pip install --upgrade pip && pip install torch==2.2.2 --index-url https://download.pytorch.org/whl/cpu && pip install --only-binary=:all: -r requirements.txt`
- Start command: `uvicorn app.main:app --host 0.0.0.0 --port $PORT --workers 1`
- Health check path: `/health` (also reports which models loaded)
- Runtime: `services/nlp/runtime.txt`
- Env vars: `NLP_INTERNAL_TOKEN`, `CORS_ORIGINS`, `SENTIMENT_SOURCE`, `NLP_LOW_MEMORY`, `LOG_LEVEL`,
  `ENABLE_ENHANCED_LANGUAGE`, `OPENAI_API_KEY` (and the other `OPENAI_*` settings above)
- Memory: MiniLM + the emotion model need roughly 0.7 GB RAM (measured locally). The free instance has
  512 MB, so use an instance with at least 1 GB, or set `NLP_LOW_MEMORY=true`.

## Security Notes
- Every user is a Supabase Auth user (anonymous by default). Row Level Security limits every table to
  `user_id = auth.uid()`; the signed-out `anon` role has no table access.
- API routes take the user id from the verified access token, never from the request body.
- The NLP service accepts POSTs only with the shared `X-Internal-Token`; it has no database access.
- Journal text is never logged (only ids and lengths).
- Clearing browser data signs the person out of their anonymous account; Settings offers a JSON export.
- Enhanced wording sends the latest message and up to two related past snippets to OpenAI, only for users
  who opted in, and only re-words the deterministic reply (overlap + policy checks).
