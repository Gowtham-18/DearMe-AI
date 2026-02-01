# Threat Model (Baseline)

## Assets
- Private journal text
- User profile metadata (name, age, occupation)

## Risks
- Accidental logging of sensitive text
- XSS from unsanitized user input
- Leaked secrets from mismanaged .env files

## Mitigations
- Never log journal text on the server.
- Escape user-provided content before rendering.
- Use strict CSP and security headers.
- Keep `.env` files out of version control.
- Pin dependencies and audit regularly.
