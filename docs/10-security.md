# 12 — Security & Config

> Personal-mode posture: this is **a single-user app with a single password**. We don't need RLS, GDPR, multi-tenant guardrails, or fancy observability. We _do_ still want to keep API keys safe and prevent random people stumbling onto our deployment from running up the AI bill.

## Threat model (lightweight)

Realistic threats for a personal deploy:

1. **Public URL discovery + AI bill abuse.** Someone finds the deploy URL and pounds `/api/chat` until it costs us money.
2. **API key exfiltration** (provider keys, AI Gateway).
3. **Prompt-injection-driven over-spending** (the agent gets stuck in a tool loop).
4. **Supply-chain compromise** (malicious dependency).

Things that are **not** in scope: account takeover (no accounts), GDPR, DDoS, advanced persistent threats.

## Secrets & keys

- Never in the repo, never in client bundle.
- `NEXT_PUBLIC_*` env vars are explicitly safe to expose; everything else is server-only.
- Stored in Vercel Environment Variables and `.env.local`.
- `packages/shared/src/env.ts` validates every required var at boot using zod and throws clearly if anything is missing.
- Rotate `APP_PASSWORD`, `AUTH_COOKIE_SECRET`, and AI keys whenever you suspect leakage.

## Auth: the password gate

Personal-mode auth is a single shared password.

### Setup

```env
APP_PASSWORD=<choose-a-strong-passphrase>
AUTH_COOKIE_SECRET=<32+ random hex bytes>
```

### Flow

1. Visiting any `(app)/*` route or non-public API hits `middleware.ts`, which checks the `hfx_auth` cookie.
2. If invalid/missing → redirect to `/login`.
3. `/login` posts `{ password }` to `/api/auth/login`.
4. Server does a **timing-safe compare** against `APP_PASSWORD`.
5. On match, sets `hfx_auth` cookie:
   - Value: HMAC-signed token = `base64(payload).hmac(AUTH_COOKIE_SECRET)`
   - Payload includes `iat` and `exp` (30 days)
   - Flags: `HttpOnly`, `Secure`, `SameSite=Lax`, `Path=/`

```ts
// pseudo
const token = sign({ iat: Date.now(), exp: Date.now() + 30 * 86400_000 }, AUTH_COOKIE_SECRET);
res.cookies.set('hfx_auth', token, { httpOnly: true, secure: true, sameSite: 'lax', path: '/' });
```

### Login rate-limit

To slow down brute force, the `/api/auth/login` route is rate-limited by IP using an in-memory token bucket: max 10 attempts per IP per 15 minutes. After that, return 429 with `Retry-After`. Personal-mode skips the cross-instance counter — there's only one user.

### Logout

`/api/auth/logout` clears the cookie. There is no "log out everywhere" — rotating `AUTH_COOKIE_SECRET` invalidates all existing cookies.

## Cron protection

- Light Vercel-poke crons run as `hamafx-light-*.service` units on the VM and `curl` `/api/cron/*` with `Authorization: Bearer ${CRON_SECRET}`. Heavy in-process jobs on the worker authenticate to Postgres + the AI Gateway directly — they never hit the Vercel routes.
- `/api/cron/*` handlers verify the bearer with `withCronAuth(req, fn)` (timing-safe compare). Any other call returns 401.
- The cookie middleware **skips** `/api/cron/*` since cron requests come from the VM without a cookie.

## DB: no RLS

There's a single user. The Next.js server uses a service-role connection to Supabase Postgres. Tables have no `user_id` column. RLS is **not** enabled.

If you ever decide to share with a friend or two, the migration path is:

1. Add `user_id` columns + indexes.
2. Switch auth to Supabase Auth or Clerk.
3. Enable RLS with `auth.uid()` policies.

Don't do this preemptively.

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
