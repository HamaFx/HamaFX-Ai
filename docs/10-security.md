# 10 — Security, Auth & Secrets

> Single-user OSS security boundary, authentication flow, secrets management, and guarded rotation procedures. The schema contains tenant-oriented foundations, but shared runtime mode is disabled in this release.

---

## Threat Model

Realistic threats:

1. **Insecure Direct Object Reference (IDOR)** — a user attempting to read or modify another user's threads, journal entries, or settings.
2. **API key exfiltration** — provider keys, AI Gateway, user-provided BYOK keys.
3. **Prompt-injection-driven over-spending** — the agent gets stuck in a tool loop.
4. **Credential brute force** — unlimited login attempts on the credentials provider.
5. **Supply-chain compromise** — malicious dependency.

Out of scope: DDoS, advanced persistent threats.

> **Auth status:** The auth system has been hardened. Features include: JWT session management, bcrypt password hashing, account lockout (5 attempts → 15 min), TOTP 2FA (enforced at login), timing-safe user enumeration prevention, signed `x-user-id` header (HMAC-SHA256) for route defense-in-depth, `userSessions` table for active session tracking with revoke support, and `tokenVersion` for "sign out everywhere". See [`auth.ts`](../apps/web/src/auth.ts) and [`auth.config.ts`](../apps/web/src/auth.config.ts) for the canonical implementation.

## Authentication: NextAuth.js v5

### Stack

| Component | Technology |
|-----------|-----------|
| Auth framework | NextAuth.js v5 (Auth.js) |
| Session strategy | JWT (stateless) |
| Database adapter | `@auth/drizzle-adapter` |
| Credentials provider | Email + Password (bcrypt) |
| Request boundary | Next.js proxy (NextAuth + CSRF) |
| 2FA | TOTP via `otplib` (enforced at login) |

### Setup

```env
# Primary (NextAuth v5 convention)
AUTH_SECRET=<32+ random hex bytes>
AUTH_URL=http://localhost:3000

# Legacy fallback (deprecated but still works)
NEXTAUTH_SECRET=<same value as AUTH_SECRET>
NEXTAUTH_URL=http://localhost:3000
```

Generate secrets:
```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

### Auth Flow

1. Visiting any `(app)/*` route hits `proxy.ts`, which checks for a valid NextAuth JWT session cookie.
2. If invalid/missing → redirect to `/login` with `?next=` preserving the original URL.
3. User submits email + password on `/login` → `loginAction()` server action → `signIn('credentials')`.
4. `authorize()` in `auth.ts` validates credentials against the DB (bcrypt compare).
5. On success, NextAuth creates a JWT and sets it in an HttpOnly cookie.
6. Middleware reads the JWT, injects `x-user-id` header for downstream route handlers.
7. API routes use `getUserFromRequest()` (fast path: header) or `auth()` (slow path: JWT decode) to get the user ID.

### Route Protection

- **Public routes**: `/login`, `/register`, `/api/auth/*`, `/api/cron/*`, `/api/telegram/*`, `/share/*`, static files.
- **Protected routes**: everything else — middleware redirects to `/login` if no session.
- **`AUTH_MODE=legacy`**: development-only bypass that injects `x-user-id: __system__`. **Must not be active in production.**

### CSRF Protection

Double-submit cookie pattern:
- Middleware mints a `hfx_csrf` cookie (random UUID) on first request.
- State-changing requests (`POST`, `PUT`, `DELETE`, `PATCH`) to `/api/*` must carry `X-CSRF-Token` header matching the cookie.
- Client-side helper: `withCsrf()` in `apps/web/src/lib/csrf.ts` auto-attaches the header.
- NextAuth's own routes (`/api/auth/*`) are exempted (NextAuth has its own CSRF tokens).

### 2FA (TOTP)

- Users can enable 2FA from Settings → Two-Factor Authentication.
- Uses `otplib` for TOTP secret generation and verification.
- QR code generated via `qrcode` library.
- Secret stored in `users.twoFactorSecret` column.
- **Note:** 2FA is enforced at login. Users with 2FA enabled must enter their TOTP code during the login flow. See `apps/web/src/auth.ts` → `authorize()` for the enforcement logic.

### Session Management

- JWT strategy (stateless) — no DB session table lookups per request.
- `tokenVersion` field on `users` table for "sign out everywhere" — incremented to invalidate old JWTs.
- `userSessions` table for session tracking UI (device, IP, last active).
- Settings → Active Sessions shows all sessions with revoke capability.

## Secrets & Keys

### Environment Variables

- Never in the repo, never in client bundle.
- `NEXT_PUBLIC_*` env vars are explicitly safe to expose; everything else is server-only.
- Stored in `.env` (or `.env.local` for local dev) and Vercel Environment Variables.
- `packages/shared/src/env.ts` validates every required var at boot using Zod and throws clearly if anything is missing.
- In development, secrets auto-generate to `.hamafx/dev-secrets.json` (gitignored).

### BYOK Encryption

- User AI API keys are encrypted at rest using AES-256-GCM.
- Encryption key derived from `ENCRYPTION_SECRET` (32-byte hex).
- Encrypted format: `hex(iv) + "." + hex(ciphertext) + "." + hex(authTag)`.
- Encryption helpers in `packages/shared/src/encryption.ts`.
- `encryptByok()` / `decryptByok()` for BYOK payloads.
- `encryptSecret()` / `decryptSecret()` for individual secrets (2FA, etc.).

## DB: Row-Level Security

The schema contains tenant-oriented user-data columns such as `userId`, but this OSS release runs in single-user mode. Every user-data query must still retain explicit ownership scoping; shared PostgreSQL/RLS runtime mode is disabled until the complete tenant-isolation suite passes.

We rely on strict query scoping rather than Postgres RLS. Every Drizzle query that reads or mutates user data MUST include a `.where(eq(table.userId, session.user.id))` clause. This prevents IDOR vulnerabilities.

The `with-user-scope.ts` helper in `packages/db` provides scoped query builders.

## AI Cost Guardrails

1. **Login required** — the only public endpoints are `/login`, `/register`, and `/api/cron/*` (cron-secret-protected).
2. **Per-IP registration throttle** — 5 per minute per IP.
3. **Per-call token caps**: `MAX_TOKENS_INPUT`, `MAX_TOKENS_OUTPUT`, hard set in agent config.
4. **Tool-loop iteration cap**: 6 tool calls per user message, then forced summary.
5. **Daily $ ceiling**: global daily counter in `chat_telemetry`. When it crosses `MAX_DAILY_USD` (default $5), `/api/chat` returns 503; resets at UTC midnight.
6. **Telemetry table** records (model, input/output tokens, ms, est-cost) per turn.

## Prompt Injection Defence

1. **Tools, not prompts** are the source of truth for prices/news. Numbers can't be hallucinated because the agent must call a tool.
2. The system prompt sets a hard rule: external content (news bodies, article titles) is **data**, not instructions. External text is wrapped with `<external_content>` markers.
3. RAG retrieval is read-only; the agent never edits news rows.
4. Tools that mutate (`set_alert`, `log_journal`) take stable identifiers from server context, not from the model's free-form output.
5. We never put unsanitised user-supplied URLs into the model context — only structured DTOs.

## Web Security

- Strict CSP via `next.config.mjs`: `default-src 'self'` + allow-list for AI Gateway, Supabase, BiQuote SignalR.
- HSTS on apex.
- `Permissions-Policy: camera=(), microphone=(self)`, `geolocation=()`.
- `Referrer-Policy: strict-origin-when-cross-origin`.
- Subresource integrity on any third-party script.

## CORS

Same-origin only. No third party should call our API. If you ever build a Telegram or Shortcuts integration, mint a tiny dedicated endpoint with its own bearer token rather than opening CORS.

## Cron Protection

- Light Vercel-poke crons run as systemd units on the VM and `curl` `/api/cron/*` with `Authorization: Bearer ${CRON_SECRET}`.
- `/api/cron/*` handlers verify the bearer with `withCronAuth(req, fn)` (timing-safe compare). Any other call returns 401.
- The cookie middleware skips `/api/cron/*` since cron requests come from the VM without a cookie.

## Dependency Hygiene

- `pnpm audit` locally before publishing major updates.
- Dependabot enabled for weekly minor/patch bumps.
- Lockfile committed; CI enforces frozen install.
- CodeQL workflow runs on every PR.

## Observability

- Sentry for production error aggregation (server-only, no client SDK).
- `console.log` JSON-shaped lines so Vercel's parser highlights them.
- `/settings/usage` page shows last-30-days token spend from `chat_telemetry`.
- Diagnostic context via `AsyncLocalStorage` — `withDiagnostics()` traces every chat turn.
- `redactSecrets()` auto-redacts API keys, tokens, passwords from traces.

## Backup & Recovery

- Supabase Free has automatic daily backups (limited retention).
- The DB schema is in the repo; restoring from backup + replaying migrations is the recovery story.
- `infra/cron-vm/RECOVERY.md` covers 5 disaster scenarios with concrete commands.
- Weekly verified restore: `hamafx-verify-restore.timer` boots a throwaway Postgres, restores the latest dump, runs row-count assertions.

---

## Secrets Rotation

### Encryption Secret (`ENCRYPTION_SECRET`)

Used for BYOK keys, Telegram bot tokens, and TOTP secrets (AES-256-GCM). If rotated without re-encryption, all previously encrypted data becomes unreadable. Application startup does **not** attempt automatic dual-key recovery.

The repository includes a guarded maintenance utility that rotates all currently encrypted database fields in one transaction:

```bash
# Run during a maintenance window against a direct/session PostgreSQL URL.
# Stop app/worker writers first, then run:
OLD_ENCRYPTION_SECRET='<old 64-character hex secret>' \
NEW_ENCRYPTION_SECRET='<new 64-character hex secret>' \
ROTATE_ENCRYPTION_SECRET_CONFIRM=YES \
ROTATE_ENCRYPTION_SECRET_MAINTENANCE=STOP_WRITERS \
pnpm --filter @hamafx/db migrate:rotate-encryption
```

The utility:

- Requires both exactly 32-byte hex keys, an explicit `YES` confirmation, and a `STOP_WRITERS` maintenance confirmation.
- Pre-decrypts every non-empty BYOK, Telegram-token, and TOTP value before writing anything.
- Aborts on the first malformed or unreadable value.
- Writes all replacements in one database transaction.
- Never logs plaintext secrets.

**Operational procedure:**
1. Take and verify a database backup before starting.
2. Stop app/worker writers and run the utility with `DIRECT_URL` (or another direct/session URL), including `ROTATE_ENCRYPTION_SECRET_MAINTENANCE=STOP_WRITERS`.
3. Confirm the command completes successfully; if it fails, do not change the active environment secret.
4. Update `ENCRYPTION_SECRET` to the new value in every web/worker environment.
5. Restart all environments and verify login, 2FA, BYOK provider tests, and Telegram delivery if enabled.
6. Retain the old secret securely until the new-key data has been verified and a fresh backup exists; then destroy it according to your secret-retention policy.

If the old secret is lost, encrypted values cannot be recovered by the application. Restore the original secret or restore a database backup made before rotation. Older installations may contain legacy plaintext Telegram tokens from before the application-layer encryption change; inventory and convert those values during a controlled maintenance window before using this rotation utility, which intentionally aborts on non-encrypted values.

### NextAuth Secret (`AUTH_SECRET` / `NEXTAUTH_SECRET`)

Signs JWT session cookies. Rotation logs out all users.

**Procedure:**
1. Generate: `openssl rand -hex 32`
2. Update the environment variable in Vercel and on the VM.
3. Users will be logged out upon their next request (JWTs signed with the old key fail verification).

### Cron Secret (`CRON_SECRET`)

Protects internal cron endpoints.

**Procedure:**
1. Generate a new secure string: `openssl rand -hex 16`
2. Update `CRON_SECRET` in Vercel and in `/opt/hamafx/.env` on the VM.
3. Restart the worker: `systemctl restart hamafx-worker.service`.

### Database Passwords

For Supabase Postgres or local setups:
1. Change password in Supabase Dashboard.
2. Update `DATABASE_URL` in Vercel and `.env` files.
3. Re-deploy the application.
