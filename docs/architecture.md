# Architecture Notes

## Monorepo Structure
- apps/web: Next.js UI (App Router)
- services/nlp: FastAPI service (skeleton)
- packages/shared: shared types and Zod schemas

## Data Flow (Phase 1)
- UI uses mock data only.
- Anonymous `user_id` generated and stored in localStorage.
- No authentication in this phase.

## Future Integration
- Web app will call NLP service for sentiment/themes.
- Shared package will define request/response contracts.
