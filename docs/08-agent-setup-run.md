# 08 — Agent Setup & Run Guide

> **Version:** 2026-07-04 · **Verified against:** commit `1803c17` (main)
> **Purpose:** Copy-pasteable path from clean clone to running instance.
> **Cross-references:** [07-agent-understanding.md](./07-agent-understanding.md) · [06-deployment-self-hosting.md](./06-deployment-self-hosting.md)

---

## 1. Prerequisites

| Requirement | Version | Check |
|-------------|---------|-------|
| Node.js | ≥ 20.11 | `node --version` |
| pnpm | 9.15.4 (pinned in `package.json`) | `pnpm --version` |
| Docker | Any (optional, for full-feature dev) | `docker --version` |
| Git | Any | `git --version` |

---

## 2. Quick Start (Zero-Setup Local Dev)

```bash
# 1. Clone
git clone https://github.com/HamaFx/HamaFX-Ai.git
cd HamaFX-Ai

# 2. Install dependencies
pnpm install

# 3. Set up at least one AI provider key
echo 'GOOGLE_GENERATIVE_AI_API_KEY=AIza...' >> .env.local

# 4. Run (PGlite auto-boots, secrets auto-generate)
pnpm dev:local

# 5. Open http://localhost:3000
```

That's it. In dev mode (`NODE_ENV !== 'production'`):
- **PGlite** (embedded Postgres via WASM) starts automatically — no database to install
- **Auth secrets** (`AUTH_SECRET`, `ENCRYPTION_SECRET`, `CRON_SECRET`) auto-generate to `.hamafx/dev-secrets.json`
- **Migrations** auto-apply to PGlite on boot
- **Register** at `/register` (if `MULTI_USER_ENABLED=1`) or use legacy mode

### What Gets Auto-Generated

| Secret | Purpose | Min Length | Source |
|--------|---------|-----------|--------|
| `AUTH_SECRET` / `NEXTAUTH_SECRET` | Sign NextAuth.js v5 JWTs | 32 chars | `crypto.randomBytes(32).toString('hex')` |
| `ENCRYPTION_SECRET` | AES-256-GCM key for BYOK payloads | 32 bytes (64 hex) | `crypto.randomBytes(32).toString('hex')` |
| `CRON_SECRET` | Bearer token for `/api/cron/*` | 16 chars | `crypto.randomBytes(16).toString('hex')` |

Stored in `.hamafx/dev-secrets.json` (gitignored). Re-loaded on next boot. Encrypted BYOK keys survive restarts because the encryption key persists.

---

## 3. Docker Setup (Full Features)

```bash
# 1. Clone
git clone https://github.com/HamaFx/HamaFX-Ai.git
cd HamaFX-Ai

# 2. Copy environment template
cp .env.example .env

# 3. Generate secrets
node -e "console.log('AUTH_SECRET=' + require('crypto').randomBytes(32).toString('hex'))"
node -e "console.log('ENCRYPTION_SECRET=' + require('crypto').randomBytes(32).toString('hex'))"
node -e "console.log('CRON_SECRET=' + require('crypto').randomBytes(16).toString('hex'))"

# 4. Edit .env — fill in:
#    AUTH_SECRET, ENCRYPTION_SECRET, CRON_SECRET
#    GOOGLE_GENERATIVE_AI_API_KEY (or AI_GATEWAY_API_KEY)
#    NEXTAUTH_URL=http://localhost:3000
#    MULTI_USER_ENABLED=1 (optional)
#    BYOK_ENABLED=1 (optional)

# 5. Start all services
docker compose up -d

# 6. Open http://localhost:3000
```

### Docker Services

| Service | Port | Purpose |
|---------|------|---------|
| `db` | 5432 | Postgres 16 + pgvector |
| `langfuse` | 3001 | LLM observability UI |
| `app` | 3000 | Next.js web app |
| `worker` | 8081 | Worker daemon (SignalR + jobs) |

---

## 4. Environment Variables

### 4.1 Required (Minimum Viable)

| Env var | Example | Purpose |
|---------|---------|---------|
| `GOOGLE_GENERATIVE_AI_API_KEY` | `AIza...` | Google Gemini API key (or use `AI_GATEWAY_API_KEY`) |
| `AUTH_SECRET` | (auto-generated in dev) | JWT signing secret, ≥32 chars |
| `ENCRYPTION_SECRET` | (auto-generated in dev) | BYOK encryption key, 32-byte hex |
| `CRON_SECRET` | (auto-generated in dev) | Cron endpoint bearer token, ≥16 chars |

### 4.2 AI Providers (At Least One Required)

| Env var | Example | Purpose |
|---------|---------|---------|
| `AI_GATEWAY_API_KEY` | `gw-...` | Vercel AI Gateway (takes precedence if set) |
| `GOOGLE_GENERATIVE_AI_API_KEY` | `AIza...` | Direct Google Gemini |
| `AI_DEFAULT_MODEL` | `google/gemini-2.5-flash` | Default chat model |
| `AI_TITLE_MODEL` | `google/gemini-2.5-flash-lite` | Title generation + planner |
| `AI_EMBEDDING_MODEL` | `openai/text-embedding-3-small` | Embedding model for RAG |

### 4.3 Data Providers (Optional but Recommended)

| Env var | Required | Purpose |
|---------|----------|---------|
| `FINNHUB_API_KEY` | Recommended | Fallback FX, news, calendar |
| `MARKETAUX_API_KEY` | Recommended | Financial news + sentiment |
| `FRED_API_KEY` | Recommended | Macro data, economic calendar |
| `TWELVEDATA_API_KEY` | Optional | Gold live ticks (WebSocket) |
| `BIQUOTE_BASE_URL` | Optional (default: `https://biquote.io`) | BiQuote REST base URL |
| `BINANCE_CRYPTO_SYMBOLS` | Optional (default: `BTCUSDT,ETHUSDT,...`) | Crypto symbols for Binance WS |

### 4.4 Feature Flags

| Env var | Default | Purpose |
|---------|---------|---------|
| `MULTI_USER_ENABLED` | `0` | Enable multi-user registration |
| `BYOK_ENABLED` | `0` | Enable Bring Your Own Key |
| `PER_USER_BRIEFINGS` | `0` | Per-user briefing generation |
| `UNLIMITED_SYMBOLS` | `0` | Bypass symbol count limits |
| `AUTH_MODE` | unset | `legacy` to skip auth in dev |
| `HAMAFX_ENABLE_RLS` | unset | `true` to enforce RLS (hosted only) |

### 4.5 Notifications (Optional)

| Env var | Purpose |
|---------|---------|
| `TELEGRAM_BOT_TOKEN` | Telegram bot token from @BotFather |
| `TELEGRAM_CHAT_ID` | Default chat ID for alerts |
| `TELEGRAM_SECRET_TOKEN` | Webhook verification secret |
| `RESEND_API_KEY` | Email delivery (Resend) |
| `ALERT_FROM_EMAIL` | Alert email sender |
| `ALERT_TO_EMAIL` | Alert email recipient |
| `VAPID_PUBLIC_KEY` / `VAPID_PRIVATE_KEY` | Web push keys |
| `NEXT_PUBLIC_VAPID_PUBLIC_KEY` | Must equal `VAPID_PUBLIC_KEY` |

### 4.6 Observability (Optional)

| Env var | Purpose |
|---------|---------|
| `SENTRY_DSN` | Server error tracking |
| `NEXT_PUBLIC_SENTRY_DSN` | Client error tracking |
| `LANGFUSE_PUBLIC_KEY` | LLM observability (public key) |
| `LANGFUSE_SECRET_KEY` | LLM observability (secret key) |
| `LANGFUSE_BASE_URL` | Langfuse URL (default: `http://localhost:3001`) |

### 4.7 Runtime Guardrails

| Env var | Default | Purpose |
|---------|---------|---------|
| `MAX_DAILY_USD` | `5` | Daily AI spend ceiling (returns 503 when exceeded) |
| `MAX_TOOL_ITERATIONS` | `6` | Hard cap on tool-loop iterations per turn |
| `AI_CHAT_RATE_LIMIT` | `30` | Per-minute chat rate limit per user |
| `MAX_JSON_BODY_BYTES` | `65536` | Max request body size (64KB) |
| `LOG_LEVEL` | `debug` (dev) / `info` (prod) | Log level |
| `LOG_PROMPTS` | `0` | Set to `1` to log full LLM prompts (debug only) |

---

## 5. Running

### 5.1 Development

```bash
# Local native (PGlite, zero setup)
pnpm dev:local              # http://localhost:3000

# With remote DB
pnpm dev                    # starts web only (turbo run dev)
```

### 5.2 Docker

```bash
docker compose up -d        # All services (db, langfuse, app, worker)
docker compose logs -f app  # Follow web app logs
docker compose logs -f worker  # Follow worker logs
docker compose down         # Stop all services
```

### 5.3 Production

See [06-deployment-self-hosting.md](./06-deployment-self-hosting.md) for full production setup (Vercel + GCE VM).

---

## 6. Testing

```bash
# All packages (unit + integration)
pnpm turbo run test -- --run

# Single package
pnpm --filter @hamafx/web test -- --run
pnpm --filter @hamafx/ai test -- --run
pnpm --filter @hamafx/data test -- --run
pnpm --filter @hamafx/worker test -- --run
pnpm --filter @hamafx/db test -- --run
pnpm --filter @hamafx/shared test -- --run
pnpm --filter @hamafx/indicators test -- --run

# With coverage
pnpm turbo run test -- --coverage

# Watch mode (dev only — don't use in CI)
pnpm --filter @hamafx/indicators test

# E2E (Playwright — requires running app)
pnpm --filter @hamafx/web exec playwright test

# AI Evals (manual — requires running app + auth cookie)
pnpm --filter @hamafx/ai eval -- --base-url http://localhost:3000 \
  --cookie "authjs.session-token=..." --cases
```

> **Always use `-- --run` flag** with vitest to avoid watch mode (which causes timeouts in CI/automation).

---

## 7. Typecheck & Lint

```bash
# Typecheck all packages
pnpm typecheck

# Lint all packages
pnpm lint

# Format
pnpm format          # write
pnpm format:check    # check only
```

---

## 8. Build

```bash
# Build all packages
pnpm build

# Build web only
pnpm --filter @hamafx/web build

# Build worker only
pnpm --filter @hamafx/worker build
```

---

## 9. Migrations

```bash
# Generate migration from schema changes
pnpm --filter @hamafx/db migrate:gen

# Apply migrations to DATABASE_URL
pnpm --filter @hamafx/db migrate:apply

# Check migration status
pnpm --filter @hamafx/db migrate:status

# Seed billing plans
pnpm --filter @hamafx/db seed:plans

# Install DB extensions (pgcrypto, pgvector)
pnpm --filter @hamafx/db migrate:setup-extensions
```

**Production:** `scripts/predeploy-migrate.mjs` runs automatically before Vercel build (`vercel.json` → `buildCommand`).

**PGlite:** Migrations auto-apply on boot in dev mode. PGlite strips pgvector, RLS, and GRANT statements.

---

## 10. Common Failures & Fixes

### 10.1 `pnpm install` Fails

| Symptom | Fix |
|---------|-----|
| `ERR_PNPM_PEER_DEP_NOT_FOUND` | Ensure Node ≥ 20.11 and pnpm 9.15.4. Check `.nvmrc` = 20. |
| `ERR_PNPM_STORE_PATH_NOT_FOUND` | Run `pnpm config set store-dir /home/user/.local/share/pnpm/store/v3` |
| Lockfile mismatch | Run `pnpm install --no-frozen-lockfile` (dev only — never in CI) |

### 10.2 `pnpm dev:local` Fails

| Symptom | Cause | Fix |
|---------|-------|-----|
| `EADDRINUSE: address already in use :::3000` | Port 3000 occupied | `lsof -i :3000` then kill the process, or use `PORT=3001 pnpm dev:local` |
| PGlite initialization error | Corrupted `.hamafx/data/` | `rm -rf .hamafx/data/` and restart |
| `AI_GATEWAY_API_KEY or GOOGLE_GENERATIVE_AI_API_KEY required` | No AI provider key set | Add to `.env.local`: `echo 'GOOGLE_GENERATIVE_AI_API_KEY=AIza...' >> .env.local` |
| Auth secret missing | `.hamafx/dev-secrets.json` deleted | Restart — auto-generates on boot in dev |

### 10.3 Docker Fails

| Symptom | Cause | Fix |
|---------|-------|-----|
| `docker compose up` exits immediately | Missing required env vars | Check `.env` has `AUTH_SECRET`, `ENCRYPTION_SECRET`, `CRON_SECRET`, and at least one AI key |
| `db` service unhealthy | Postgres not ready | Wait 30s, check `docker compose logs db` |
| `app` service unhealthy | Next.js cold start > 40s | Increase `start_period` in `docker-compose.yml` healthcheck |
| `worker` service unhealthy | Missing `DATABASE_URL` | Ensure `.env` has `DATABASE_URL=postgres://hamafx:hamafx@db:5432/hamafx` |

### 10.4 Typecheck Fails

| Symptom | Cause | Fix |
|---------|-------|-----|
| `TS2742: Portability error` | NextAuth inferred type issue | This is a known issue — see `auth.ts` comment about `_nextAuth` typing |
| `TS2538: Type 'undefined' cannot be used as an index` | `noUncheckedIndexedAccess` | Add null check or use `!` assertion when certain |

### 10.5 Tests Fail

| Symptom | Cause | Fix |
|---------|-------|-----|
| Tests hang indefinitely | Watch mode active | Use `-- --run` flag: `pnpm turbo run test -- --run` |
| `E2E: browser not found` | Playwright browsers not installed | `pnpm exec playwright install --with-deps` |
| PGlite test failures | Corrupted test DB | Tests use isolated PGlite instances — check `packages/db/test/` setup |

### 10.6 Build Fails

| Symptom | Cause | Fix |
|---------|-------|-----|
| `Next.js build error: Type error` | TypeScript error in build | Run `pnpm typecheck` first to catch errors |
| `Module not found: @hamafx/*` | Workspace packages not linked | Run `pnpm install` to relink workspace packages |
| Sentry build error | `@sentry/nextjs` configuration | Check `next.config.mjs` — `withSentryConfig` wrapper |

---

## 11. Debugging Tips

### 11.1 Enable Prompt Logging

```bash
echo 'LOG_PROMPTS=1' >> .env.local
```

This logs full LLM prompts to the console. **Debug only — never enable in production.**

### 11.2 Check System Diagnostics

Ask the AI agent in chat: "Run system diagnostics" — it will use the `get_system_diagnostics` tool to report DB connectivity, worker status, budget remaining, and env var validation.

### 11.3 Check Migration Status

```bash
pnpm --filter @hamafx/db migrate:status
```

### 11.4 List All Tables

```bash
pnpm --filter @hamafx/db exec node scripts/list-tables.mjs
```

### 11.5 DB Check

```bash
pnpm --filter @hamafx/db exec node scripts/db-check.mjs
```

### 11.6 Langfuse Tracing

If Langfuse is running (Docker mode, port 3001):
1. Open `http://localhost:3001`
2. Create API keys in Settings → API Keys
3. Set `LANGFUSE_PUBLIC_KEY`, `LANGFUSE_SECRET_KEY`, `LANGFUSE_BASE_URL` in `.env`
4. Restart the app — LLM traces will appear in Langfuse UI

### 11.7 Sentry

Set `SENTRY_DSN` (server) and `NEXT_PUBLIC_SENTRY_DSN` (client) in `.env`. Errors will be captured to your Sentry project.

---

## 12. AI Eval Runner

The AI eval harness tests end-to-end AI quality against curated trading prompts:

```bash
# 1. Start the app
pnpm dev:local

# 2. Register/login and get your session cookie
#    (from browser dev tools → Application → Cookies → authjs.session-token)

# 3. Run evals
pnpm --filter @hamafx/ai eval -- \
  --base-url http://localhost:3000 \
  --cookie "authjs.session-token=YOUR_COOKIE_VALUE" \
  --cases
```

**Eval files:**
- `packages/ai/src/eval/cases.json` — curated test cases
- `packages/ai/src/eval/prompts.json` — prompt templates
- `packages/ai/src/eval/runner.ts` — eval runner
- `packages/ai/src/eval/parse-stream.ts` — stream parser for eval

**Nightly CI:** The eval harness runs nightly via `ci-slow.yml` (schedule trigger only, not on PRs).

---

## 13. Telegram Bot Setup (Optional)

```bash
# 1. Create a bot via @BotFather on Telegram, get the token

# 2. Set env vars
echo 'TELEGRAM_BOT_TOKEN=123456:ABC-DEF...' >> .env.local
echo 'TELEGRAM_SECRET_TOKEN=your-random-secret' >> .env.local

# 3. Run the webhook setup script
pnpm --filter @hamafx/web tsx scripts/setup-telegram-webhook.ts

# 4. Link your account:
#    - In the app, go to /settings/telegram
#    - Or use the /link command in Telegram
```

---

## 14. MT5 Bridge Setup (Optional)

1. Install the `HamaBridge.mq5` Expert Advisor in MT5 (`tools/mt5/HamaBridge.mq5`)
2. Enable local sockets in MT5: Tools → Options → Expert Advisors → Allow WebRequest/Sockets
3. The EA connects to `127.0.0.1:8080` and streams ticks from Market Watch
4. The worker's `mt5-server.ts` listens on port 8080 and ingests ticks
5. For headless MT5: use `tools/mt5/mt5-headless.service` systemd unit

---

## 15. Clean Rebuild

```bash
# Clean everything
pnpm clean

# Or manually:
rm -rf node_modules apps/web/.next apps/worker/dist packages/*/.turbo
pnpm install
pnpm dev:local
```
