# 12 — Security & Config

> Multi-tenant posture: this is a **multi-user app with NextAuth authentication**. We implement strict data isolation via database-level `userId` constraints (IDOR protection) and Bring Your Own Key (BYOK) encryption for user-specific API credentials.

## Threat model (lightweight)

Realistic threats:

1. **Insecure Direct Object Reference (IDOR)**. A user attempting to read or modify another user's threads, journal entries, or settings.
2. **API key exfiltration** (provider keys, AI Gateway, user-provided BYOK keys).
3. **Prompt-injection-driven over-spending** (the agent gets stuck in a tool loop).
4. **Supply-chain compromise** (malicious dependency).

Things that are **not** in scope: DDoS, advanced persistent threats.

## Secrets & keys

- Never in the repo, never in client bundle.
- `NEXT_PUBLIC_*` env vars are explicitly safe to expose; everything else is server-only.
- Stored in `.env` (or `.env.local` for local dev) and Vercel Environment Variables.
- `packages/shared/src/env.ts` validates every required var at boot using zod and throws clearly if anything is missing.
- Rotate `NEXTAUTH_SECRET`, `ENCRYPTION_SECRET`, and AI keys whenever you suspect leakage.

## Auth: NextAuth.js

Authentication is handled via NextAuth.js, allowing multiple sign-in providers (Google, GitHub, Credentials).

### Setup

```env
NEXTAUTH_URL=http://localhost:3000
NEXTAUTH_SECRET=<32+ random hex bytes>
ENCRYPTION_SECRET=<32+ random hex bytes>
```

### Flow

1. Visiting any `(app)/*` route hits `middleware.ts`, which checks for a valid NextAuth session.
2. If invalid/missing → redirect to `/auth/login` (via NextAuth).
3. After successful authentication, NextAuth establishes a session cookie.
4. NextAuth persists users and sessions in the database using the Drizzle adapter.
5. In API routes, we retrieve `session.user.id` using `auth()` to scope all subsequent database operations.

### Logout

NextAuth's `signOut()` handles clearing the session cookie and destroying the session record in the database.

## Cron protection

- Light Vercel-poke crons run as `hamafx-light-*.service` units on the VM and `curl` `/api/cron/*` with `Authorization: Bearer ${CRON_SECRET}`. Heavy in-process jobs on the worker authenticate to Postgres + the AI Gateway directly — they never hit the Vercel routes.
- `/api/cron/*` handlers verify the bearer with `withCronAuth(req, fn)` (timing-safe compare). Any other call returns 401.
- The cookie middleware **skips** `/api/cron/*` since cron requests come from the VM without a cookie.

## DB: Row-level Constraints

Because HamaFX-Ai is multi-tenant, all user-specific tables (`chat_threads`, `journal_entries`, `alerts`, `user_settings`) have a `userId` column.

We rely on strict query scoping rather than Postgres RLS (Row Level Security). Every Drizzle query that reads or mutates user data MUST include a `.where(eq(table.userId, session.user.id))` clause. This prevents IDOR vulnerabilities.

To aid in BYOK scenarios, the `user_settings.encryptedKeys` column stores AES-256-GCM encrypted payloads, encrypted at rest using the server's `ENCRYPTION_SECRET`.

## AI cost guardrails

These exist to defend against the "URL is found and abused" failure mode and against runaway agent loops.

1. **Login required** — the only public endpoints are `/api/auth/login` and `/api/cron/*` (cron-secret-protected).
2. **Per-IP login throttle** as above.
3. **Per-call token caps**: `MAX_TOKENS_INPUT`, `MAX_TOKENS_OUTPUT`, hard set in agent config.
4. **Tool-loop iteration cap**: 6 tool calls per user message, then forced summary.
5. **Daily $ ceiling**: a global daily counter in `chat_telemetry` (summed by UTC date in `dailySpendUsd()`). When it crosses `MAX_DAILY_USD` (default $5), `/api/chat` returns a friendly 503 explaining we hit the cap; resets at UTC midnight. Adjust the cap per taste.
6. **Telemetry table** (`chat_telemetry`) records (model, input/output tokens, ms, est-cost) per turn so you can audit later.

## Prompt injection defence

1. **Tools, not prompts**, are the source of truth for prices/news. Numbers can't be hallucinated because the agent must call a tool.
2. The system prompt sets a hard rule: external content (news bodies, article titles) is **data**, not instructions. We wrap any external text with explicit `<external_content>` markers.
3. RAG retrieval is read-only; the agent never edits news rows.
4. Tools that mutate (`set_alert`, `log_journal`) take stable identifiers from the server context, not from the model's free-form output.
5. We never put unsanitised user-supplied URLs into the model context — only structured DTOs.

## Web security

- Strict CSP via `next.config.mjs`: `default-src 'self'` + allow-list for AI Gateway, Supabase, BiQuote SignalR, and any specific provider domains we directly hit from the browser (none currently).
- HSTS on apex.
- `Permissions-Policy: camera=(), microphone=(self)` (mic for voice input), `geolocation=()`.
- `Referrer-Policy: strict-origin-when-cross-origin`.
- Subresource integrity on any third-party script we ever inject.

## CORS

Same-origin only. No third party should call our API. If you ever build a Telegram or Shortcuts integration, mint a tiny dedicated endpoint with its own bearer token rather than opening CORS.

## Dependency hygiene

- `pnpm audit` locally before publishing major updates.
- Optional: enable Dependabot for weekly minor/patch bumps; ignore majors.
- Lockfile committed; CI enforces frozen install.

## Observability (light)

- Vercel logs are the only sink.
- `console.log` JSON-shaped lines so Vercel's parser highlights them.
- Critical errors → log with `level: 'error'` so they're easy to filter.
- A small `/settings/usage` page in the app shows last-30-days token spend from `chat_telemetry`.

## Backup & recovery

- Supabase Free has automatic daily backups (limited retention).
- The DB schema is in the repo; restoring from backup + replaying migrations is the recovery story.
- Periodically (monthly?), you can run `pg_dump` against the pooler to a local file as a belt-and-braces.

## Disclaimer

The app is for **your own** use; we're not making product claims. Still, on first run the chat shows a one-line note: "Information may be delayed or inaccurate. Decisions are yours." Dismissable, doesn't return.
