# HamaFX-Ai Security Audit Report

> **Date:** July 19, 2026  
> **Scope:** Full codebase — authentication, authorization, API security, AI safety, secrets management, deployment security  
> **Methodology:** Static code analysis + configuration review + architectural analysis  
> **Total findings:** 31 (3 Critical, 9 High, 12 Medium, 7 Low)

---

## Executive Summary

HamaFX-Ai demonstrates a **strong security posture overall** with several well-implemented defenses: JWT-based auth with signed headers, AES-256-GCM BYOK encryption, account lockout, CSRF double-submit cookies, atomic budget guards, prompt injection detection, Zod validation at all boundaries, and comprehensive rate limiting.

However, the audit identified **3 critical findings** that require immediate attention, primarily around development/debug endpoints and legacy auth modes that could be dangerous if misconfigured in production. Additionally, **9 high-severity findings** cover areas like CSP hardening, session management edge cases, Docker exposure, and consent boundary issues.

---

## Findings by Severity

### 🔴 CRITICAL (3 findings)

---

#### C-1: Dev Login Endpoint with Hardcoded Credentials

**File:** `apps/web/src/app/api/dev/login/route.ts`  
**Lines:** 1-49

**Description:** The `/api/dev/login` route creates a user with hardcoded credentials (`dev@hamafx.ai` / `devpass`) and automatically logs them in. It is gated by `NODE_ENV !== 'development'` and `ENABLE_DEV_LOGIN !== 'true'`, but:

- The Docker build (used for self-hosted deployments) runs with `NODE_ENV=production`, so the `NODE_ENV` check alone is sufficient.
- However, the route is **not excluded from the middleware matcher** — only `/api/dev` is excluded as a prefix, not `/api/dev/*` sub-paths.
- If `ENABLE_DEV_LOGIN=true` were accidentally set in production, this route grants full authenticated access with a known password.

**Evidence:**
```typescript
// apps/web/src/app/api/dev/login/route.ts
const email = 'dev@hamafx.ai';
const userId = 'test-user-id';
const devPassword = 'devpass';
```

**Risk:** Complete authentication bypass if misconfigured. An attacker with the hardcoded password (published in open-source code) could gain full access to any self-hosted instance with `ENABLE_DEV_LOGIN=true`.

**Recommendation:**
1. Add an additional `ALLOW_DEV_LOGIN_IN_PRODUCTION` guard or remove the route entirely from production builds
2. Exclude `/api/dev/*` from middleware's CSRF/auth enforcement explicitly
3. Use a randomly generated password instead of the hardcoded `devpass`

---

#### C-2: Legacy Auth Mode Can Be Enabled in Production Docker Builds

**File:** `apps/web/src/auth.config.ts:62-67`, `apps/web/src/middleware.ts:57-66`

**Description:** The `AUTH_MODE=legacy` bypass is intended only for development. However, `ALLOW_LEGACY_AUTH=true` explicitly allows it even when `NODE_ENV=production`. This env var is set as a build arg in the Dockerfile:

**Evidence:**
```dockerfile
# Dockerfile
ARG ALLOW_LEGACY_AUTH
ENV ALLOW_LEGACY_AUTH=$ALLOW_LEGACY_AUTH
```

```typescript
// auth.config.ts
if (
  process.env.AUTH_MODE === 'legacy' &&
  (process.env.NODE_ENV !== 'production' || process.env.ALLOW_LEGACY_AUTH === 'true')
) return true;
```

**Risk:** A self-hoster who sets `AUTH_MODE=legacy` and `ALLOW_LEGACY_AUTH=true` (either intentionally for convenience or accidentally) would disable all authentication. All requests get `x-user-id: __system__` — full access to all data without login.

**Recommendation:**
1. Remove `ALLOW_LEGACY_AUTH` escape hatch entirely
2. In `auth.config.ts`, hard-fail with `throw new Error()` instead of `return true` when `AUTH_MODE=legacy` is detected in production
3. Remove `ARG ALLOW_LEGACY_AUTH` from Dockerfile

---

#### C-3: CSP Allows 'unsafe-eval' and 'unsafe-inline' Scripts

**File:** `apps/web/next.config.mjs:48-49`

**Description:** The Content-Security-Policy header includes `'unsafe-eval'` and `'unsafe-inline'` for `script-src`, which effectively disables CSP's XSS protection for scripts. While this is acknowledged as a known trade-off for Next.js + TradingView compatibility:

```
script-src 'self' 'unsafe-eval' 'unsafe-inline' https://s3.tradingview.com;
```

**Risk:** XSS vulnerabilities (e.g., DOM-based XSS through `dangerouslySetInnerHTML` in `text.tsx`) would not be mitigated by CSP. The `'unsafe-eval'` directive enables arbitrary code execution via `eval()`, `Function()` constructor, and `setTimeout`/`setInterval` with string arguments.

**Evidence of existing XSS surface:**
```tsx
// apps/web/src/components/chat/parts/text.tsx:149
return <div dangerouslySetInnerHTML={{ __html: html }} className="shiki-container" />;
```

**Recommendation:**
1. Implement nonce-based CSP for inline scripts
2. Compute SHA-256 hashes for known inline scripts (TradingView bootstrap, dark-mode toggle)
3. Use `strict-dynamic` with a nonce or hash source to maintain functionality while blocking untrusted scripts
4. Switch to CSP Report-Only mode first, monitor violations, then enforce

---

### 🟠 HIGH (9 findings)

---

#### H-1: Impersonation Provider Lacks Admin Check in authorize()

**File:** `apps/web/src/auth.ts:250-279`

**Description:** The impersonation credentials provider allows any admin to sign in as any user by userId. While the `/api/admin/impersonate` route is protected by `withAdminAuth`, the `authorize()` function in the impersonation provider itself does NOT verify that the caller is an admin — it only checks that the target user exists:

**Evidence:**
```typescript
async authorize(credentials) {
  const userId = typeof credentials?.userId === 'string' ? credentials.userId : '';
  if (!userId) return null;
  
  const db = getDb();
  const [user] = await db
    .select()
    .from(schema.users)
    .where(eq(schema.users.id, userId))
    .limit(1);
  
  if (!user) return null;
  // ... returns user without verifying caller is admin
}
```

**Risk:** If the impersonation provider were ever called directly (bypassing the admin route guard, e.g., through a misconfiguration or a new code path), any authenticated user could impersonate any other user.

**Recommendation:**
1. Add an admin check inside the impersonation provider's `authorize()` using `getAdminUser()`
2. Pass a signed token from the admin route to prove the call originated from an admin session
3. Better yet: remove the impersonation provider and use token-based impersonation where a signed JWT is minted server-side

---

#### H-2: Docker Compose Exposes Postgres Port to Host

**File:** `docker-compose.yml:21`

**Description:** The Postgres container exposes port 5432 to the host machine:
```yaml
ports:
  - "5432:5432"
```

**Evidence:** This is bound to `0.0.0.0:5432` (the default when no IP prefix is specified), making the database accessible from any network interface on the host.

**Risk:** If running on a cloud VM with a public IP, the database could be accessible from the internet. Combined with weak/non-random `POSTGRES_PASSWORD`, this creates a direct path to data exfiltration.

**Recommendation:**
1. Bind to localhost only: `"127.0.0.1:5432:5432"`
2. Alternatively, remove the `ports` mapping entirely — the `app` and `worker` containers can reach `db:5432` via the internal Docker network
3. Consider using Docker's internal network with `expose` instead of `ports`

---

#### H-3: Worker BiQuote Proxy Token is Optional

**File:** `apps/worker/src/http-server.ts:44-56`

**Description:** The BiQuote REST proxy on the worker VM requires a bearer token only when `BIQUOTE_PROXY_TOKEN` is configured:

**Evidence:**
```typescript
if (PROXY_TOKEN) {
  const auth = req.headers.authorization;
  if (auth !== `Bearer ${PROXY_TOKEN}`) {
    // ...403
  }
}
// If PROXY_TOKEN is not set, auth is completely SKIPPED
```

**Risk:** If `BIQUOTE_PROXY_TOKEN` is not set in the environment, the proxy is wide open to anyone who can reach port 8081. While it binds to `127.0.0.1`, local processes on the VM (including potentially compromised containers or services) could abuse it.

**Recommendation:**
1. Make `BIQUOTE_PROXY_TOKEN` required in production
2. Add a warning at boot when the proxy is active without a token
3. Consider requiring the token unconditionally (fail closed)

---

#### H-4: Session Not Immediately Invalidated on Password Change

**File:** `apps/web/src/auth.ts:287-320`

**Description:** When a password is changed, `tokenVersion` is incremented, but the session callback checks it **every 5 minutes**, not immediately:

**Evidence:**
```typescript
// auth.ts session callback
if (!lastChecked || now - lastChecked > 300) {
  // ... check tokenVersion
}
```

**Risk:** An attacker who obtained a valid session (e.g., through a stolen device) retains access for up to 5 minutes after the user changes their password. The "sign out everywhere" action similarly has a 5-minute window of continued access.

**Recommendation:**
1. Add a `tokenVersion` check on every session callback that's more aggressive (e.g., check every 30 seconds, or cache the result)
2. Use a real-time invalidation mechanism like a Redis key or a DB check with lower TTL
3. At minimum, reduce the check interval to 60 seconds

---

#### H-5: No Rate Limiting on Auth Endpoints (NextAuth Routes)

**File:** `apps/web/src/middleware.ts:146-148` (matcher)

**Description:** The NextAuth catch-all route (`/api/auth/*`) is excluded from middleware CSRF protection and the auth gate, and is not behind application-level rate limiting. While `loginAction` and `registerAction` have their own per-IP rate limits, the underlying NextAuth endpoints (`/api/auth/callback/credentials`, `/api/auth/session`, `/api/auth/csrf`) have no rate limiting:

**Evidence:**
```typescript
matcher: [
  '/((?!auth|share|api/auth|api/dev|api/cron|...)...)',
],
```

**Risk:** Brute-force attacks targeting the NextAuth callback endpoint directly (bypassing the `loginAction` rate limiter) could succeed. Session endpoint polling could be used for denial-of-service.

**Recommendation:**
1. Add IP-based rate limiting to `/api/auth/callback/*` using middleware or an edge function
2. Consider using Vercel's WAF or an edge-based rate limiting solution for auth endpoints

---

#### H-6: File Upload Allows Potentially Dangerous Formats (HEIC/HEIF)

**File:** `apps/web/src/app/api/upload/route.ts:50-56`

**Description:** The upload route accepts HEIC and HEIF image formats, which are container formats that can include multiple images, depth maps, and metadata:

**Evidence:**
```typescript
const ALLOWED_MEDIA_TYPES = new Set<string>([
  'image/jpeg', 'image/png', 'image/webp', 'image/gif',
  'image/heic', 'image/heif',  // ← allowed
]);
```

**Risk:** HEIC/HEIF files can be exploited via vulnerabilities in image processing libraries. The `sharp` library is used for processing, but HEIC format parsing may have less mature vulnerability mitigations compared to JPEG/PNG.

**Recommendation:**
1. Consider removing HEIC/HEIF from allowed types or adding additional validation
2. Ensure `sharp` is kept up-to-date (it has occasional security patches for format-specific vulnerabilities)
3. Add maximum dimension validation before processing

---

#### H-7: dangerouslySetInnerHTML with Shiki-Sanitized HTML

**File:** `apps/web/src/components/chat/parts/text.tsx:149`

**Description:** The chat text rendering uses `dangerouslySetInnerHTML` for syntax highlighting output from Shiki:

**Evidence:**
```tsx
return <div dangerouslySetInnerHTML={{ __html: html }} className="shiki-container" />;
```

**Risk:** While Shiki's HTML output is normally safe (it only generates span elements with CSS classes), any bug in Shiki or the HTML construction logic could lead to XSS. This risk is compounded by the weak CSP (C-3).

**Recommendation:**
1. Add DOMPurify or similar HTML sanitization as a defense-in-depth measure, even for Shiki output
2. Verify that the `html` string goes through sanitization before rendering
3. Consider rendering through React components instead of raw HTML

---

#### H-8: Custom timingSafeEqual Implementation in cron.ts

**File:** `apps/web/src/lib/cron.ts:82-88`

**Description:** The cron auth module uses a custom byte-by-byte comparison instead of Node's `crypto.timingSafeEqual`:

**Evidence:**
```typescript
function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let result = 0;
  for (let i = 0; i < a.length; i++) {
    result |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return result === 0;
}
```

**Risk:** While the implementation is theoretically constant-time, V8's JIT optimizer can optimize away the bitwise operations in ways that break constant-time guarantees. Node.js's `crypto.timingSafeEqual` is implemented in C++ and guaranteed to be constant-time.

**Recommendation:**
1. Replace with `crypto.timingSafeEqual(Buffer.from(a), Buffer.from(b))`
2. This is used for both cron bearer token comparison AND the legacy cookie auth path — both security-sensitive

---

#### H-9: No Database Connection Encryption Verification for Self-Hosted

**File:** `packages/db/src/client.ts:115-116`

**Description:** The database client disables TLS verification in development, but the `DB_ALLOW_INSECURE_TLS` escape hatch exists for production too:

**Evidence:**
```typescript
if (process.env.NODE_ENV === 'production' && process.env.DB_ALLOW_INSECURE_TLS !== 'true') {
  // ... enforce TLS
}
```

**Risk:** Self-hosters who set `DB_ALLOW_INSECURE_TLS=true` (or don't configure TLS at all) would connect to Postgres without encryption. Database credentials and all user data would be transmitted in cleartext.

**Recommendation:**
1. Remove the `DB_ALLOW_INSECURE_TLS` escape hatch
2. If needed for local development, keep it gated behind `NODE_ENV !== 'production'`
3. Add a loud startup warning when TLS is disabled

---

### 🟡 MEDIUM (12 findings)

---

#### M-1: Debug Route Exposes Internal State

**File:** `apps/web/src/app/debug/route.ts`

**Description:** The `/debug` route exposes database connection information (masked, but still reveals URL structure) and DB query results:

**Evidence:**
```typescript
env.DATABASE_URL_masked = maskDbUrl(process.env.DATABASE_URL);
```

**Risk:** While the route returns 404 in production, it's undefined behavior in self-hosted Docker deployments. Information disclosure about database topology could aid attackers.

**Recommendation:**
1. Ensure the debug route is fully disabled in Docker production builds
2. Add explicit guards at the route level, not just `NODE_ENV` checks

---

#### M-2: BYOK Keys Decrypted in Memory During Chat Execution

**File:** `packages/ai/src/byok-providers.ts`, `packages/shared/src/encryption.ts`

**Description:** User-provided BYOK API keys are decrypted and held in memory during AI model calls. While this is necessary for functionality, there's no explicit cleanup or memory scrubbing after use.

**Risk:** A memory dump or heap snapshot could expose decrypted API keys. In a multi-tenant environment, a compromised function instance could leak another user's key.

**Recommendation:**
1. Minimize the lifetime of decrypted keys (scope to the exact model call)
2. Explicitly null out references after use (though JS GC makes this best-effort)
3. Document the risk for self-hosters who share instances between untrusted users

---

#### M-3: AI Chat Route Exposes Error Messages to Client

**File:** `apps/web/src/app/api/chat/route.ts:183-195`

**Description:** When the chat agent fails, the raw error message is returned to the client:

**Evidence:**
```typescript
const message = err instanceof Error ? err.message : String(err);
return Response.json(
  { error: { code: 'CHAT_FAILED', message, ...(requestId ? { requestId } : {}) } },
  { status: 500, headers: errorHeaders },
);
```

**Risk:** Internal error messages could leak system architecture, model names, tool names, or database structure to end users. This is partly mitigated by the Sentry capture, but the raw message is still sent.

**Recommendation:**
1. Return a generic "An error occurred" message to users in production
2. Log the detailed error server-side only
3. Return the requestId for support correlation

---

#### M-4: __Host- Cookie Prefix Only in NODE_ENV=production

**File:** `apps/web/src/middleware.ts:91-92`

**Description:** The `__Host-` cookie prefix (which provides additional cookie security) is only used when `NODE_ENV === 'production'`:

**Evidence:**
```typescript
const csrfCookieName =
  process.env.NODE_ENV === 'production' ? '__Host-hfx_csrf' : 'hfx_csrf';
```

**Risk:** Self-hosted Docker deployments with `NODE_ENV=production` work correctly, but any configuration that sets `NODE_ENV` to something else would use the weaker cookie name without the `__Host-` binding protections.

**Recommendation:**
1. Use a dedicated `COOKIE_SECURE_MODE` env var instead of relying on `NODE_ENV`
2. Or always use the `__Host-` prefix and have a dev-only fallback

---

#### M-5: Missing NEXT_PUBLIC_ Variable Audit

**Files:** Multiple

**Description:** Several `NEXT_PUBLIC_` variables are exposed to the browser. While most are intentional (`NEXT_PUBLIC_APP_URL`, `NEXT_PUBLIC_VAPID_PUBLIC_KEY`), a few deserve scrutiny:

**Evidence:**
```typescript
// Exposed in client bundles:
process.env.NEXT_PUBLIC_TRADINGVIEW_ENABLED
process.env.NEXT_PUBLIC_ENABLE_DEV_LOGIN
process.env.NEXT_PUBLIC_GOOGLE_ENABLED
process.env.NEXT_PUBLIC_BUILD_ID
process.env.NEXT_PUBLIC_SENTRY_DSN
process.env.NEXT_PUBLIC_DEPLOYED_SHA
```

**Risk:** `NEXT_PUBLIC_ENABLE_DEV_LOGIN` exposes whether the dev login feature is enabled to any visitor. `NEXT_PUBLIC_DEPLOYED_SHA` reveals the exact commit deployed, which could help attackers target known vulnerabilities in specific versions.

**Recommendation:**
1. Audit all `NEXT_PUBLIC_*` variables for information disclosure
2. Remove `NEXT_PUBLIC_BUILD_ID` unless needed
3. Consider exposing commit SHA hash only (not the full SHA) or skipping it entirely

---

#### M-6: Password Reset Token Enumeration via Timing

**File:** `apps/web/src/app/(auth)/actions.ts:369-395`

**Description:** The `resetPasswordAction` first queries for the hashed token, then validates the password. The token lookup itself is constant-time (hash comparison), but the subsequent password validation varies in timing:

**Evidence:**
```typescript
const [vt] = await db.select()
  .from(schema.verificationTokens)
  .where(and(
    eq(schema.verificationTokens.token, hashedToken),
    eq(schema.verificationTokens.purpose, 'password_reset'),
    gt(schema.verificationTokens.expires, new Date()),
  ))
```

**Risk:** While the hash comparison itself is constant-time, the overall response time differs between "token not found" (fast) and "token found, password invalid" (slower due to bcrypt). An attacker could potentially distinguish these cases via timing analysis.

**Recommendation:**
1. Add a dummy bcrypt operation when the token is not found to normalize response times
2. Apply the same rate limiting to the reset-password action as to login

---

#### M-7: Missing Security Headers

**File:** `apps/web/next.config.mjs`

**Description:** Several recommended security headers are missing from the response:

- `Strict-Transport-Security` (HSTS) — documented as present but not visible in the headers configuration
- `X-DNS-Prefetch-Control`
- `Cross-Origin-Resource-Policy`
- `Cross-Origin-Opener-Policy`
- `Cross-Origin-Embedder-Policy`

**Risk:** Missing HSTS means connections could be downgraded to HTTP. Missing CORP/COOP/COEP headers reduce protection against cross-origin information leaks (Spectre, XS-Leaks).

**Recommendation:**
1. Add HSTS header: `Strict-Transport-Security: max-age=63072000; includeSubDomains; preload`
2. Add `Cross-Origin-Resource-Policy: same-origin`
3. Add `Cross-Origin-Opener-Policy: same-origin`

---

#### M-8: Worker Cron Lock Uses Advisory DB Locks Without Heartbeat

**File:** `apps/worker/src/cron-lock.ts`

**Description:** The cron lock mechanism uses PostgreSQL advisory locks (`pg_try_advisory_lock`). If a cron job crashes mid-execution without releasing the lock, it must wait for the lock timeout. The lock timeout configuration is unclear:

**Evidence:**
```typescript
const inserted = await db.execute(sql`
  INSERT INTO cron_locks (job_name, instance_id, locked_at)
  VALUES (${jobName}, ${instanceId}, now())
  ON CONFLICT (job_name) DO NOTHING
`);
```

**Risk:** A crashed cron job could hold a lock indefinitely, preventing the job from running on schedule. For time-sensitive operations (alerts, briefings), this could mean missed notifications.

**Recommendation:**
1. Add a lock TTL/expiry mechanism
2. Implement a heartbeat that refreshes the lock timestamp
3. Add monitoring for stale locks (held > 2× expected job duration)

---

#### M-9: Telegram Webhook Secret Token Validated but Bot Token Visible

**File:** `packages/ai/src/telegram/webhook.ts`

**Description:** The Telegram webhook uses `TELEGRAM_SECRET_TOKEN` for authentication, which is good. However, the bot token (`TELEGRAM_BOT_TOKEN`) is stored in the file system and potentially exposed in error messages.

**Recommendation:**
1. Encrypt `TELEGRAM_BOT_TOKEN` at rest using the same AES-256-GCM scheme as BYOK keys
2. Ensure bot token is never logged (already handled by `redactSecrets()`)

---

#### M-10: No Request Size Limit on Chat Text Content

**File:** `apps/web/src/app/api/chat/route.ts:52-65`

**Description:** The chat route validates message structure with Zod but doesn't limit individual message content length:

**Evidence:**
```typescript
const BodySchema = z.object({
  messages: z.array(
    z.object({
      content: z.string().default(''),  // no max length!
    })
  ).min(1),
});
```

**Risk:** An attacker could send extremely long messages to exhaust server memory or increase AI costs. While `MAX_JSON_BODY_BYTES` provides an upper bound, individual message content could still be extremely long.

**Recommendation:**
1. Add `.max(50000)` to the `content` field in BodySchema
2. Consider truncating very long messages before sending to the AI model

---

#### M-11: No Content Validation on Journal Import Data Source

**File:** `apps/web/src/app/api/journal/import/route.ts`

**Description:** The journal import route validates each trade row against a Zod schema, which is good. However, there's no validation that the data makes sense in context (e.g., checking that `openedAt` is not in the far future, or that `entry`/`stop`/`target` values are reasonable for forex instruments):

**Evidence:**
```typescript
const ImportRowSchema = z.object({
  entry: z.number().positive(),     // could be 999999
  openedAt: z.number().int(),      // could be year 2099
});
```

**Risk:** Malformed data could corrupt analytics (win rate, R-multiple, journal stats). Not a security risk per se, but a data integrity concern.

**Recommendation:**
1. Add reasonable bounds (e.g., `entry` between 0.5-5000 for forex pairs)
2. Validate `openedAt` is within a sensible range (not future, not before 2000)

---

#### M-12: Health Endpoints Have No Rate Limiting

**Files:** `apps/web/src/app/api/health/route.ts`, `apps/worker/src/http-server.ts`

**Description:** The health check endpoints are not rate-limited. While they perform lightweight DB queries, they could be used for denial-of-service in environments without external rate limiting.

**Recommendation:**
1. Add a lightweight rate limit (e.g., 30 req/min per IP) to health endpoints
2. Or use a separate lightweight health check that doesn't hit the DB

---

### 🔵 LOW (7 findings)

---

#### L-1: TO-DO Comments Reveal Security Considerations

**File:** `apps/worker/src/symbol-manager.ts:127`

**Evidence:**
```typescript
watchlistCount: 1, // TODO: aggregate from DB for real popularity
```

**Risk:** TODOs in production code signal incomplete features. This specific TODO shows that popularity-based symbol filtering is stubbed out.

**Recommendation:**
1. Track TODOs in the issue tracker, not in source code
2. Either implement or remove the TODO

---

#### L-2: No Automated Dependency Vulnerability Scanning in Fast CI

**Files:** `.github/workflows/ci-fast.yml`

**Description:** The fast CI pipeline runs linting, type checking, and unit tests but doesn't include `pnpm audit` or dependency vulnerability scanning. Dependabot handles dependency bumps, but there's no gate that blocks PRs introducing known-vulnerable dependencies.

**Recommendation:**
1. Add `pnpm audit --audit-level=high` to ci-fast.yml
2. Run Trivy or similar in all PRs, not just on release

---

#### L-3: Dockerfile Uses node:20-slim Without Digest Pinning

**File:** `Dockerfile:5`

**Evidence:**
```dockerfile
FROM node:20-slim AS base
```

**Risk:** Without a digest or specific tag, the base image can change between builds, potentially introducing vulnerabilities or breaking changes.

**Recommendation:**
1. Pin to a specific digest: `FROM node:20-slim@sha256:...`
2. Use Renovate or Dependabot to auto-update the digest

---

#### L-4: CSP Uses `https:` Wildcard for img-src and connect-src

**File:** `apps/web/next.config.mjs`

**Evidence:**
```
img-src 'self' data: blob: https:;
connect-src 'self' wss: https:;
```

**Risk:** The `https:` wildcard allows loading images and making connections to any HTTPS endpoint. This weakens CSP's ability to prevent data exfiltration.

**Recommendation:**
1. Specify exact domains for connect-src (Supabase, AI Gateway, TradingView, BiQuote)
2. Restrict img-src to known CDNs

---

#### L-5: Password Complexity Allows 8-Character Minimum

**File:** `apps/web/src/app/(auth)/actions.ts:19`

**Evidence:**
```typescript
const PASSWORD_MIN = 8;
```

**Risk:** 8 characters is the bare minimum for password security. Modern recommendations (NIST SP 800-63B) suggest 8 as minimum, but 12+ is recommended for higher security.

**Recommendation:**
1. Increase `PASSWORD_MIN` to 10 or 12
2. Add a password strength meter in the UI

---

#### L-6: Cookie httpOnly: false on CSRF Cookie

**File:** `apps/web/src/middleware.ts:155`

**Evidence:**
```typescript
httpOnly: false, // double-submit pattern requires JS readability
```

**Risk:** The CSRF cookie being readable by JavaScript means a successful XSS attack could read and exfiltrate the token. This is an inherent limitation of the double-submit cookie pattern and is well-documented in the code.

**Recommendation:**
No fix needed (this is by design for the double-submit pattern), but document as a known trade-off and mitigate through strong CSP (see C-3).

---

#### L-7: User-Agent String Parsed But Not Validated

**File:** `apps/web/src/app/(auth)/actions.ts:72`

**Evidence:**
```typescript
const ua = headersList.get('user-agent')?.slice(0, 255) || undefined;
```

**Risk:** While the User-Agent is truncated to 255 chars and stored in the session, it could contain malicious content if rendered unsafely in an admin dashboard. Currently low risk as it's only stored, not rendered without escaping.

**Recommendation:**
1. Add HTML entity encoding before rendering in any UI
2. Use a proper User-Agent parser for the device name display

---

## What's Working Well

The following security measures deserve recognition as well-implemented:

| Area | Implementation |
|------|---------------|
| **Account lockout** | Atomic SQL increment (no race), 5 attempts → 15 min lockout |
| **Password hashing** | bcrypt cost 12, constant-time dummy hash for user enumeration prevention |
| **2FA enforcement** | TOTP via otplib, enforced at login, secret encrypted at rest |
| **CSRF protection** | Double-submit cookie with `__Host-` prefix in production, SameSite=Strict |
| **Signed user header** | HMAC-SHA256 signed `x-user-id` in middleware, verified in route handlers |
| **BYOK encryption** | AES-256-GCM with random IV per encryption, auth tags verified on decrypt |
| **Prompt injection** | Multi-pattern detection with defensive prefix, logged for audit |
| **AI budget guard** | Atomic `INSERT..ON CONFLICT DO UPDATE WHERE` serializes concurrent turns |
| **Mutation guard** | Read tools check user intent before state-changing operations |
| **Input validation** | Zod schemas at every API boundary, JSON body size limits, timeout on body reads |
| **Rate limiting** | Per-user, per-IP rate limits on login, registration, chat, uploads, alerts |
| **Cron auth** | Bearer token (timing-safe compare) + session cookie dual auth |
| **Billing webhook** | HMAC-SHA512 signature verification before business logic |
| **Secret generation** | Auto-generated CSRNG secrets for dev, persisted to gitignored file |
| **Env validation** | Zod schema validates all env vars at boot, fails fast |
| **Error handling** | Sentry capture on all unhandled errors, structured error logging |
| **Soft delete** | Users soft-deleted via `deletedAt`, filtered in `authorize()` |
| **RLS infrastructure** | RLS policies exist (migrations 0035-0039), ready for enforcement |
| **CI security** | CodeQL analysis, Trivy container scanning, Dependabot enabled |
| **No secrets in repo** | `.env` gitignored, Vault integration for GCP Secret Manager |

---

## Remediation Priority Matrix

| Priority | Finding | Effort | Impact |
|----------|---------|--------|--------|
| **Immediate** | C-1: Dev login endpoint hardening | Low | Critical |
| **Immediate** | C-2: Legacy auth mode in production | Low | Critical |
| **Sprint** | C-3: CSP hardening | Medium | Critical |
| **Sprint** | H-1: Impersonation admin check | Low | High |
| **Sprint** | H-2: Docker Postgres port binding | Low | High |
| **Sprint** | H-9: DB TLS verification | Low | High |
| **Sprint** | H-8: timingSafeEqual fix | Low | High |
| **This week** | H-4: Session invalidation timing | Medium | High |
| **This week** | H-5: Auth endpoint rate limiting | Medium | High |
| **This week** | H-3: Worker proxy token enforcement | Low | High |
| **This week** | H-6: File upload format audit | Low | High |
| **This month** | M1-M12: Medium findings | Mixed | Medium |
| **Backlog** | L1-L7: Low findings | Low | Low |

---

## Appendix: Files Reviewed

| File | Area |
|------|------|
| `apps/web/src/auth.ts` | Authentication, 2FA, impersonation |
| `apps/web/src/auth.config.ts` | Edge auth config, legacy mode |
| `apps/web/src/middleware.ts` | CSRF, auth gate, signed headers |
| `apps/web/src/lib/csrf.ts` | Client-side CSRF |
| `apps/web/src/lib/api.ts` | Auth helpers, body parsing, error responses |
| `apps/web/src/lib/signed-user-header.ts` | HMAC header signing |
| `apps/web/src/lib/cron.ts` | Cron auth, timing-safe comparison |
| `apps/web/src/lib/admin-auth.ts` | Admin authorization |
| `apps/web/src/lib/billing-gate.ts` | Feature gating |
| `apps/web/src/lib/env.ts` | Dev secret generation |
| `apps/web/src/app/(auth)/actions.ts` | Login, register, password reset |
| `apps/web/src/app/api/chat/route.ts` | Chat endpoint |
| `apps/web/src/app/api/upload/route.ts` | File upload |
| `apps/web/src/app/api/billing/webhook/route.ts` | NOWPayments webhook |
| `apps/web/src/app/api/journal/import/route.ts` | Trade import |
| `apps/web/src/app/api/admin/impersonate/route.ts` | User impersonation |
| `apps/web/src/app/api/dev/login/route.ts` | Dev login |
| `apps/web/next.config.mjs` | Security headers, CSP |
| `packages/shared/src/encryption.ts` | AES-256-GCM encryption |
| `packages/shared/src/env.ts` | Server env validation |
| `packages/shared/src/vault.ts` | GCP Secret Manager integration |
| `packages/ai/src/message-text.ts` | Prompt injection detection |
| `packages/ai/src/tools/mutation-guard.ts` | Mutation intent guard |
| `packages/ai/src/cost.ts` | Budget guard, spend tracking |
| `packages/ai/src/routing.ts` | Domain classification |
| `packages/ai/src/tools/index.ts` | Tool registry |
| `apps/worker/src/http-server.ts` | Worker health/proxy server |
| `apps/worker/src/env.ts` | Worker env validation |
| `Dockerfile` | Container build |
| `docker-compose.yml` | Docker deployment |
| `infra/cron-vm/docker-compose.vm.yml` | VM worker deployment |
| `docs/10-security.md` | Security documentation |
| `docs/05-security-auth-compliance.md` | Auth documentation |
| `SECURITY.md` | Security policy |
