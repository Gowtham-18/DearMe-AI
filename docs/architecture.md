# Architecture Notes

## Monorepo Structure
- apps/web: Next.js UI (App Router)
- services/nlp: FastAPI NLP service (embeddings, emotion/sentiment, keyphrases, themes, reply planner)
- packages/shared: shared types and Zod schemas

## Data Flow (Phase 6)
- Browser signs in with Supabase anonymous auth; the session lives in localStorage.
- Browser reads/writes its own rows directly (profiles, entries, sessions, turns); RLS enforces ownership.
- Next.js API routes (/api/prompts, /api/chat/turn, /api/analyze, /api/weekly-reflection) verify the
  access token, act as that user against Supabase, and call the NLP service with a shared secret.
- The NLP service is stateless and never touches the database.
- packages/shared holds the zod contracts used by the API routes.
