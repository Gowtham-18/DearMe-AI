# DearMe AI Monorepo

AI-powered journaling companion with a Next.js web app, FastAPI NLP service, and Supabase persistence.

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
2) In the Supabase SQL editor, run `docs/db/schema.sql`.
3) Then run `docs/db/schema-phase2.sql` to enable analysis + pgvector tables.
4) Then run `docs/db/schema-phase3.sql` to enable journaling chat sessions.
5) Then run `docs/db/schema-phase4.sql` to store profile preferences.
5) Copy environment variables into `apps/web/.env.local`:
```
NEXT_PUBLIC_SUPABASE_URL=...
NEXT_PUBLIC_SUPABASE_ANON_KEY=...
NEXT_PUBLIC_NLP_URL=http://localhost:8000
NLP_SERVICE_URL=http://localhost:8000
OPENAI_API_KEY=...
OPENAI_MODEL=gpt-4o-mini
OPENAI_MAX_TOKENS=240
OPENAI_TEMPERATURE=0.2
```

Security note: Phase 1 uses the anon key from the browser (demo-only). Do not enable RLS until
proper authentication or server-side access is implemented.

## Env Var Setup
- Copy `.env.example` to `.env.local` in `apps/web` and root if needed.
- Copy `services/nlp/.env.example` to `services/nlp/.env` for local overrides.
- Optional NLP overrides: `EMBEDDING_MODEL_NAME`, `SENTIMENT_MODEL_NAME`, `LOG_LEVEL`.
- Optional web overrides: `OPENAI_MODEL`, `OPENAI_MAX_TOKENS`, `OPENAI_TEMPERATURE`.
- Never commit real secrets or user data.

## Deployment
### Web (Vercel)
- Root Directory: `apps/web`
- Install command: `pnpm install`
- Build command: `pnpm build`
- Env vars: `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `NEXT_PUBLIC_NLP_URL`, `NLP_SERVICE_URL`
- If Enhanced Language Mode is enabled, add `OPENAI_API_KEY` and (optionally) `OPENAI_MODEL`

### NLP (Render)
- Root directory: `services/nlp`
- Build command: `pip install -r requirements.txt`
- Start command: `uvicorn app.main:app --host 0.0.0.0 --port $PORT`
- Runtime: `services/nlp/runtime.txt`
- Env vars: `CORS_ORIGINS` (e.g. `https://your-vercel-domain`) and any optional overrides

## Security Notes
- Do not log private journal text on the server or client.
- Render content as plain text to avoid XSS.
- Use strict .env handling and avoid committing secrets.
- Anonymous identity is stored on this device. Clearing browser data resets it.
- Phase 2 still runs without auth; plan to add Supabase Auth + RLS + server-side write proxy next.
- Enhanced Language Mode (if enabled) uses a server-only OpenAI key to rewrite wording only.
