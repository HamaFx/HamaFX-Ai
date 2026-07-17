# Security Policy

## Supported Versions

We provide security updates for the `main` branch and the latest stable release.

| Version | Supported |
| ------- | ---------- |
| Latest `main` | ✅ |
| Latest release tag | ✅ |
| Older releases | ❌ |

## Reporting a Vulnerability

If you discover a security vulnerability in HamaFX-Ai, **do not open a public issue**.

Instead, email **security@hamafx.com** with:

1. A description of the vulnerability
2. Steps to reproduce the issue
3. The potential impact (data exposure, privilege escalation, financial impact, etc.)
4. Any suggested mitigations

**Response timeline:**

| Step | Target |
|------|--------|
| Acknowledgment | 48 hours |
| Initial assessment | 5 business days |
| Fix or mitigation | 30 days (severity-dependent) |
| Public disclosure | After fix is released, coordinated with reporter |

Please practice responsible disclosure. We commit to not taking legal action against reporters who act in good faith.

## Known Security Considerations

### Authentication

HamaFX-Ai uses NextAuth.js v5 with a Credentials provider (email + password, bcrypt). Sessions are JWT-based with a 30-day expiry. Account lockout activates after 5 failed login attempts (15-minute lockout).

**Auth hardening completed** — see [docs/05-security-auth-compliance.md](docs/05-security-auth-compliance.md) for details.

| Issue | Severity | Status |
|-------|----------|--------|
| Token version now checked in `session()` callback every 5 min — invalidates on mismatch | Critical | ✅ Fixed |
| Signed `x-user-id` header (HMAC-SHA256) prevents spoofing; cron jobs use proper scoping | Critical | ✅ Fixed |
| `authorized()` + `jwt()` + `session()` callbacks collectively validate user existence and token version | High | ✅ Fixed |
| TOTP 2FA enforced at login | High | ✅ Fixed |
| Account lockout after 5 failed attempts (15-min timeout) | Medium | ✅ Fixed |

If you are working on auth code, read the current implementation at `apps/web/src/auth.ts` and `apps/web/src/auth.config.ts`.

### BYOK API Key Encryption

User-provided AI provider keys (BYOK) are encrypted at rest using AES-256-GCM with the `ENCRYPTION_SECRET` environment variable (32-byte hex key). Keys are decrypted in memory only during tool execution.

**Responsibilities:**
- `ENCRYPTION_SECRET` must be a strong, randomly generated 32-byte hex value
- Never commit `ENCRYPTION_SECRET` to version control
- Never log decrypted API key values
- The `redactSecrets()` utility (`packages/ai/src/diagnostics/redact.ts`) automatically redacts keys from diagnostic traces — ensure any new logging flows through it

### Row-Level Security (RLS)

RLS policies exist (migrations 0035–0039) but enforcement is **off by default**. Set `HAMAFX_ENABLE_RLS=true` to enable. Self-hosted deployments using PGlite have no RLS (PGlite does not support it).

If you are self-hosting with multiple users, you must:
1. Use Postgres (not PGlite)
2. Set `HAMAFX_ENABLE_RLS=true`
3. Set `ADMIN_DATABASE_URL` to the `hamafx_admin` BYPASSRLS role connection string
4. Apply all migrations through 0041

### Billing Webhook

The NOWPayments billing webhook (`/api/billing/webhook`) verifies HMAC-SHA512 signatures on every request before any business logic runs. The `NOWPAYMENTS_IPN_SECRET` must be kept secret and set in the NOWPayments dashboard.

**Safety gate requirements** (must be met before enabling paid plans):
1. Webhook signature verification on every request ✅
2. Dead-letter queue for failed processing (`ipn_events` table) ✅
3. Sentry capture of webhook errors ⚠️ verify implementation
4. Paging on signature failure threshold ⚠️ verify implementation

### CSRF Protection

All state-changing API requests (POST, PUT, DELETE, PATCH) require a CSRF double-submit cookie. The `hfx_csrf` cookie must match the `x-csrf-token` header. This is enforced in Edge middleware (`apps/web/src/middleware.ts`).

### Content Security Policy

The CSP header is set in `next.config.mjs`:

```
default-src 'self';
script-src 'self' 'unsafe-eval' 'unsafe-inline' https://s3.tradingview.com;
style-src 'self' 'unsafe-inline' https://s3.tradingview.com;
img-src 'self' data: blob: https:;
font-src 'self' data:;
connect-src 'self' wss: https:;
```

> **Note:** `'unsafe-eval'` and `'unsafe-inline'` are present for Next.js and TradingView compatibility. Tightening to nonce-based CSP is a future improvement.

### Self-Hosted Deployment Security

Self-hosters are responsible for:
- Securing the underlying infrastructure (OS, network, firewall)
- Using a reverse proxy (Nginx, Traefik, Caddy) with TLS/SSL
- Generating strong secrets (`AUTH_SECRET`, `ENCRYPTION_SECRET`, `CRON_SECRET`)
- Keeping `ENCRYPTION_SECRET` backed up — losing it makes all stored BYOK keys unrecoverable
- Restricting access to the database
- Regularly updating dependencies (`pnpm update` + Dependabot PRs)

### Data Provider Licensing

HamaFX-Ai integrates with multiple market data providers (BiQuote, Finnhub, Marketaux, FRED, TwelveData, Binance, CFTC). **No provider terms of service are included in this repository.** If you redistribute market data to paying subscribers, you are responsible for verifying each provider's redistribution terms and obtaining appropriate licenses. See [docs/02-data-flows.md](docs/02-data-flows.md) §6 for the licensing status table.

## Security Measures in CI/CD

| Measure | Workflow | What it catches |
|---------|----------|----------------|
| CodeQL analysis | `codeql.yml` (weekly + PRs) | Code injection, path traversal, XSS patterns |
| Trivy container scan | `docker-publish.yml` (on release) | CRITICAL + HIGH vulnerabilities in Docker images |
| Dependabot | Weekly | Outdated dependencies with known CVEs |
| ESLint security rules | `ci-fast.yml` (every PR) | Common security anti-patterns |

## Secret Management

| Environment | Method |
|-------------|--------|
| Local dev | Auto-generated to `.hamafx/dev-secrets.json` (gitignored) |
| Docker | `.env` file (gitignored, from `.env.example` template) |
| Production (hosted) | GCP Secret Manager (`SECRETS_VAULT_PROVIDER=gcp-secret-manager`) |
| Self-hosted | `.env` file or your preferred secrets manager |

**Never commit secrets.** The `.gitignore` excludes `.env`, `.env.local`, `.hamafx/`, and `docker-compose.override.yml`.
