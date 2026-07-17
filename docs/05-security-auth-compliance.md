# 05 — Security, Auth & Compliance

> **Version:** 2026-07-04 · **Verified against:** commit `1803c17` (main)
> **Cross-references:** [01-architecture.md](./01-architecture.md) · [03-backend-api.md](./03-backend-api.md) · [06-deployment-self-hosting.md](./06-deployment-self-hosting.md)

---

## 1. Authentication: NextAuth.js v5

### 1.1 Stack

| Component | Technology | Source |
|-----------|-----------|--------|
| Auth framework | NextAuth.js v5 (Auth.js) | `apps/web/src/auth.ts`, `apps/web/src/auth.config.ts` |
| Session strategy | JWT (stateless, 30-day max age) | `auth.config.ts` → `session.maxAge: 30 * 24 * 60 * 60` |
| Database adapter | `@auth/drizzle-adapter` | `auth.ts` |
| Credentials provider | Email + Password (bcrypt) | `auth.ts` → `Credentials()` |
| Password hashing | bcryptjs | `auth.ts` → `bcrypt.compare()` |
| 2FA/TOTP | TOTP setup UI exists | `settings/_components/two-factor-setup.tsx` |
| Edge config | `auth.config.ts` (no Node.js imports) | Imported by `middleware.ts` |
| Full config | `auth.ts` (Node runtime, providers + adapter) | Imported by route handlers |

### 1.2 Auth Flow

```
Browser                Middleware (Edge)          /api/auth/[...nextauth]     auth.ts
   |                        |                            |                      |
   |--POST /api/auth/callback-->|                       |                      |
   |   (email+password)        |                       |                      |
   |                        |--JWT validate-->         |                      |
   |                        |  (session cookie)        |                      |
   |                        |                       |--authorize()-->        |
   |                        |                       |  (bcrypt compare)      |
   |                        |                       |  (lockout check)       |
   |                        |                       |  <--user object--      |
   |                        |                       |--jwt callback-->       |
   |                        |                       |  (set token.id,        |
   |                        |                       |   tokenVersion)        |
   |                        |                       |                       |
   |<--Set-Cookie:          |                       |                       |
   |   authjs.session-token |                       |                       |
   |   (JWT, 30 days)       |                       |                       |
   |                        |                       |                       |
   |--GET /chat------------>|                       |                       |
   |                        |--auth() wrapper-->    |                       |
   |                        |  (validate JWT)       |                       |
   |                        |--authorized callback->|                       |
   |                        |  (isLoggedIn? → allow)|                       |
   |                        |--inject x-user-id---->|                       |
   |<--200 OK---------------|                       |                       |
```

### 1.3 Account Lockout

- After 5 failed login attempts → account locked for 15 minutes
- `failedLoginAttempts` counter on `user` table
- `lockedUntil` timestamp checked in `authorize()`
- Counter reset on successful login
- Source: `apps/web/src/auth.ts` → `authorize()` function

### 1.4 Legacy Mode (Self-Host Dev)

`AUTH_MODE=legacy` + `NODE_ENV !== 'production'`:
- Middleware skips NextAuth JWT check entirely
- Injects `x-user-id: __system__` header
- All routes accessible without login
- **Only works in development** — production check is hardcoded in `auth.config.ts` and `middleware.ts`

### 1.5 Multi-User Registration

Gated by `MULTI_USER_ENABLED` env var (default: `0`):
- When `0`: `/register` page shows disabled state
- When `1`: full registration flow with email + password
- Registration creates `user` record with bcrypt-hashed password

### 1.6 Soft Delete

Users are soft-deleted via `deletedAt` column on `user` table. The `authorize()` function filters with `isNull(schema.users.deletedAt)` so deleted users cannot log in.

### 1.7 Token Version

`user.tokenVersion` column exists for session invalidation (e.g., after password change). The JWT callback in `auth.ts` stores `tokenVersion` in the token.

> **Fixed:** The `session()` callback in `auth.ts` checks `tokenVersion` against the database every 5 minutes. If a mismatch is detected, the session is invalidated. See `apps/web/src/auth.ts` → `session()` callback.

---

## 2. BYOK Encryption

### 2.1 AES-256-GCM

- **Source:** `packages/shared/src/encryption.ts`
- **Algorithm:** AES-256-GCM (authenticated encryption)
- **Key:** `ENCRYPTION_SECRET` env var — 32-byte hex (64 hex chars)
- **Per-key:** Random IV generated for each encryption operation
- **Storage:** Encrypted keys stored in `user_settings` table (jsonb column)
- **Decryption:** Keys decrypted in memory only during tool execution, never logged

### 2.2 BYOK Provider Registry

`packages/ai/src/byok-providers.ts` — 9 providers: Google Gemini, OpenAI, Anthropic, Groq, DeepSeek, Mistral, OpenRouter, xAI, Vertex AI.

**Feature flag:** `BYOK_ENABLED=0` by default. Must be set to `1` to enable.

### 2.3 Key Management UI

- **Settings page:** `/settings/api-keys` (`api-key-card.tsx`, `export-import-keys.tsx`, `save-bar.tsx`)
- **API:** `GET/POST /api/me/keys` — get/set encrypted API keys
- **Bulk test:** `POST /api/settings/bulk-test` — tests all configured provider keys
- **Per-provider test:** `POST /api/settings/test-provider` — tests a single provider key

---

## 3. CSRF Protection

### 3.1 Double-Submit Cookie Pattern

- **Cookie:** `hfx_csrf` — SameSite=Lax, Secure in production, Path=/
- **Header:** `x-csrf-token` — must match cookie value exactly
- **Required on:** All POST/PUT/DELETE/PATCH requests to `/api/*` (excluding `/api/auth/*`)
- **Enforcement:** `apps/web/src/middleware.ts`
- **Missing cookie:** Middleware generates new `crypto.randomUUID()` and sets it as cookie
- **Mismatch/missing header:** Returns `403 Forbidden - CSRF token missing or invalid`

### 3.2 Test

`apps/web/test/csrf.test.ts` — verifies CSRF enforcement on state-changing methods.

---

## 4. Known Auth Bugs & Security Issues

> **Source:** `docs/archive/review/01-authentication-security-review.md` (archived audit document)
> **Note:** These issues have been addressed. See the current auth implementation in `apps/web/src/auth.ts`.

### 4.1 [Fixed] Token Version Checked in JWT Callback

The `jwt()` callback now stores `tokenVersion` in the JWT, and the `session()` callback periodically checks the DB value against the token. On mismatch, the session is invalidated.

### 4.2 [Fixed] User Scope in Cron Jobs

Cron jobs now use proper user scoping when accessing data.

### 4.3 [Fixed] Session Validation

The `authorized()` callback, `jwt()` callback, and `session()` callback collectively validate user existence and token version.


---

## 5. Row-Level Security (RLS)

### 5.1 Implementation Status

RLS is **implemented but not enforced by default**.

| Component | Status | Source |
|-----------|--------|--------|
| RLS policies | Implemented (migrations 0035–0039) | `packages/db/drizzle/0035_*` through `0039_*` |
| Tenant columns | All 46 user-data tables have `tenant_id` | Migration `0041_fix_missing_tenant_columns.sql` |
| BYPASSRLS admin role | Created | Migration `0037_phase3_bypassrls_admin_role.sql` |
| RLS cutover | Applied | Migration `0038_phase3_rls_cutover.sql` |
| Runtime enforcement | **Off by default** | `HAMAFX_ENABLE_RLS` env var must be `true` |

### 5.2 How RLS Works

When `HAMAFX_ENABLE_RLS=true`:
1. `withTenantDb()` (`packages/db/src/with-user-scope.ts`) sets `app.current_tenant` GUC on the connection
2. RLS policies compare `app.current_tenant` to each row's `tenant_id`
3. Queries only return rows matching the current tenant

### 5.3 BYPASSRLS Admin Role

- `ADMIN_DATABASE_URL` env var — connection string for the `hamafx_admin` role
- Used by worker and cron jobs that need to operate across all tenants
- `getAdminDb()` falls back to regular `DATABASE_URL` if `ADMIN_DATABASE_URL` is unset
- Self-host (AUTH_MODE=legacy, no RLS): leave unset

### 5.4 PGlite Compatibility

PGlite **does not support RLS**. The PGlite client (`packages/db/src/pglite-client.ts`) strips all RLS-related SQL from migrations:
- `CREATE POLICY` → skipped
- `ALTER TABLE .. FORCE ROW LEVEL SECURITY` → skipped
- `GRANT` → skipped
- `DROP POLICY` → skipped

Self-hosters using PGlite have no RLS — all data is accessible to all users (or the single `__system__` user in legacy mode).

### 5.5 Organization Tables (Scaffolding)

`organization` and `organization_member` tables exist in `schema/auth.ts` but are **not actively used** for data isolation. They are scaffolding for future org-level multi-tenancy.

---

## 6. NOWPayments Billing Security

### 6.1 Webhook Verification

- **Source:** `apps/web/src/app/api/billing/webhook/route.ts`
- **Method:** HMAC-SHA512 signature verification
- **Header:** `x-nowpayments-sig` — contains HMAC-SHA512 of the raw request body
- **Secret:** `NOWPAYMENTS_IPN_SECRET` env var
- **Flow:** Verify signature before any business logic → reject with 401 if invalid

### 6.2 Billing Webhook Safety Gate

> **Source:** `docs/archive/BILLING-WEBHOOK-SAFETY-GATE.md` (archived)

The safety gate defines **hard requirements** that MUST be met before paid plans can be enabled:

1. **Webhook signature verification** — HMAC-SHA512 on every request before business logic. Reject unsigned/invalid with 401. Capture signature failures to Sentry.
2. **Dead-letter queue** — Failed webhook processing (after signature verification) stored in `ipn_events` table for manual replay.
3. **Sentry capture** — All webhook errors captured with `tags: { component: 'billing-webhook' }`.
4. **Paging** — Page on-call when signature failures exceed 3 in 5 minutes.

> **Status:** The webhook route exists and does HMAC verification. The dead-letter queue (`ipn_events` table) exists. The Sentry capture and paging thresholds are documented but their implementation status should be verified against the actual webhook route code.

### 6.3 Billing Gate (Feature Gating)

- **Source:** `apps/web/src/lib/billing-gate.ts`
- **Functions:** `checkFeature(userId, feature)`, `checkAlertLimit(userId)`, `checkJournalLimit(userId)`
- **Free tier limits:** `FREE_PLAN_ALERT_LIMIT=5` (max 5 active alerts), `FREE_PLAN_JOURNAL_MONTHLY_LIMIT` (journal entries per month)
- **Feature keys:** Defined in `packages/shared/src/billing/features.ts`
- **Plan lookup:** `packages/db/src/queries/billing.ts` → `getSubscription()`, `getEffectiveFeatures()`

### 6.4 Sandbox vs. Production

- `.env.example` defaults `NOWPAYMENTS_API_BASE` to `https://api-sandbox.nowpayments.io`
- Production: set to `https://api.nowpayments.io`
- The cutover runbook (`docs/archive/review/12-billing-production-cutover-runbook.md`) lists unchecked prerequisites for going live

---

## 7. Secrets Management

### 7.1 Env Var Validation

`packages/shared/src/env.ts` — Zod schema validates all server env vars at boot. Apps fail fast on missing/invalid values.

### 7.2 Dev Secret Auto-Generation

In `NODE_ENV !== 'production'`, the web app auto-generates:
- `AUTH_SECRET` / `NEXTAUTH_SECRET` — 32-byte hex (JWT signing)
- `ENCRYPTION_SECRET` — 32-byte hex (BYOK encryption)
- `CRON_SECRET` — 16+ chars (cron bearer token)

Stored in `.hamafx/dev-secrets.json` (gitignored). Re-loaded on next boot.

### 7.3 GCP Secret Manager (Hosted Edition)

- **Env var:** `SECRETS_VAULT_PROVIDER=gcp-secret-manager`
- **Source:** `packages/shared/src/vault.ts`
- **Behavior:** Fetches secrets from GCP Secret Manager at runtime. Existing `.env` values take precedence — vault secrets only fill in missing keys.
- **Requires:** `GCP_PROJECT_ID` and Application Default Credentials on the runtime

### 7.4 Secret Redaction

`packages/ai/src/diagnostics/redact.ts` — `redactSecrets()` / `redactString()` auto-redacts API keys, tokens, passwords from diagnostic traces and logs.

---

## 8. Data Provider Licensing

> **Critical gap:** No `TERMS.md`, `LICENSE-NOTICES.md`, or provider terms files exist in the repository.

| Provider | Redistribution to Paying Subscribers | Status |
|----------|--------------------------------------|--------|
| BiQuote | **Unresolved** — keyless read endpoints, terms unclear | No terms file in repo |
| Finnhub | **Unresolved** — free tier terms unclear for redistribution | No terms file in repo |
| Marketaux | **Unresolved** — free tier terms unclear for redistribution | No terms file in repo |
| FRED | Generally permitted with attribution (Federal Reserve public data) | No attribution file in repo |
| TwelveData | **Unresolved** — free tier terms unclear for redistribution | No terms file in repo |
| Binance | **Unresolved** — public stream terms unclear for redistribution | No terms file in repo |
| CFTC | Permitted (U.S. government work, public domain) | No terms file in repo |

> **The founder must consult a qualified lawyer before redistributing market data to paying subscribers.** The legal compliance review (`docs/archive/review/11-legal-compliance-review.md`) covers this extensively but is an audit document, not legal advice.

---

## 9. Security Headers

From `apps/web/next.config.mjs`:

| Header | Value |
|--------|-------|
| `X-Frame-Options` | `DENY` (prevents clickjacking) |
| `X-Content-Type-Options` | `nosniff` (prevents MIME sniffing) |
| `Referrer-Policy` | `strict-origin-when-cross-origin` |
| `Permissions-Policy` | `camera=(), microphone=(self), geolocation=()` |
| `Content-Security-Policy` | `default-src 'self'; script-src 'self' 'unsafe-eval' 'unsafe-inline' https://s3.tradingview.com; style-src 'self' 'unsafe-inline' https://s3.tradingview.com; img-src 'self' data: blob: https:; font-src 'self' data:; connect-src 'self' wss: https:;` |

> **Note:** CSP includes `'unsafe-eval'` and `'unsafe-inline'` for scripts. This is a known trade-off for Next.js compatibility and TradingView widget embedding. Tightening this would require nonce-based CSP.

---

## 10. Threat Model

> **Source:** `docs/archive/10-security.md` (archived)

| Threat | Mitigation |
|--------|-----------|
| IDOR (Insecure Direct Object Reference) | `userId` scoping on all user-data tables; RLS when enabled |
| API key exfiltration | AES-256-GCM encryption at rest; redaction in logs/traces |
| Prompt-injection-driven over-spending | `MAX_DAILY_USD` budget guardrail; `MAX_TOOL_ITERATIONS` cap |
| Credential brute force | Account lockout after 5 failed attempts (15-min) |
| Supply-chain compromise | Dependabot weekly updates; Trivy container scanning on release; CodeQL analysis |
| CSRF | Double-submit cookie pattern on all state-changing API requests |
| XSS | CSP headers; React's built-in escaping; no `dangerouslySetInnerHTML` without sanitization |
