# DearMe AI

AI-powered journaling companion with a Next.js web app and FastAPI NLP service.

## Overview
- apps/web: Next.js (App Router, TypeScript) UI
- services/nlp: FastAPI NLP service (skeleton)
- packages/shared: shared types and schemas
- docs: architecture notes and threat model

## Tech Stack
- Next.js + React + TypeScript
- Tailwind CSS + shadcn/ui
- next-themes, recharts, lucide-react
- FastAPI + Pydantic

## Local Development
### Prereqs
- Node.js 20+
- pnpm 9+
- Python 3.11+

### Install dependencies
```
pnpm install
```

### NLP service setup
```
python -m venv services/nlp/.venv
services/nlp/.venv/Scripts/activate
pip install -r services/nlp/requirements.txt
```

### Run web + NLP service
```
pnpm dev
```

Web runs at http://localhost:3000
NLP runs at http://localhost:8000

### Run separately
```
pnpm dev:web
pnpm dev:nlp
```

## Env Var Setup
- Copy `.env.example` to `.env.local` in `apps/web` and root if needed.
- Copy `services/nlp/.env.example` to `services/nlp/.env` for local overrides.
- Never commit real secrets or user data.

## Deployment
### Web (Vercel)
- Build command: `pnpm --filter @dearme/web build`
- Output: `.next`

### NLP (Render)
- Start command: `uvicorn services.nlp.main:app --host 0.0.0.0 --port 8000`
- Add environment variables from `.env.example`

## Security Notes
- Do not log private journal text on the server.
- Sanitize and escape all user-provided content before rendering.
- Use strict .env handling and avoid committing secrets.
- Security headers are configured in the web app.
