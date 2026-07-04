# 06 — Deployment & Self-Hosting Guide

> **Version:** 2026-07-04 · **Verified against:** commit `1803c17` (main)
> **Cross-references:** [01-architecture.md](./01-architecture.md) · [05-security-auth-compliance.md](./05-security-auth-compliance.md) · [08-agent-setup-run.md](./08-agent-setup-run.md)

---

## 1. Deployment Modes

Three modes from one codebase, controlled by env vars:

| Mode | Database | Scheduler | Setup Command |
|------|----------|-----------|---------------|
| Local native | PGlite (embedded) | node-cron (embedded) | `pnpm dev:local` |
| Local Docker | Postgres 16 + pgvector | node-cron (embedded) | `docker compose up -d` |
| Production | Supabase Postgres + pgvector | systemd timers (GCE VM) | Vercel + GCE VM |

---

## 2. Hosted Production Setup (Founder's Setup)

### 2.1 Architecture

```
+---------------------------------------------------------------------------+
|                         PRODUCTION TOPOLOGY                                |
|                                                                           |
|  +-------------------+         +------------------------------------+     |
|  | GitHub            |         | Vercel — apps/web                  |     |
|  | HamaFx/HamaFX-Ai  |--push-->| Next.js 15 PWA                     |     |
|  |                   |  to main| 78 API routes, auth, chat, market   |     |
|  +-------------------+         | Vercel cron: evaluate-signals (1)  |     |
|                                +------------------------------------+     |
|                                           |                               |
|                                +----------+----------+                    |
|                                |                     |                    |
|                                v                     v                    |
|  +-------------------+  +-------------------+  +-------------------+      |
|  | Supabase          |  | Vercel AI Gateway |  | GCP Secret Mgr    |      |
|  | Postgres+pgvector |  | (LLM routing)     |  | (secrets vault)   |      |
|  | 46 tables         |  |                   |  |                   |      |
|  +-------------------+  +-------------------+  +-------------------+      |
|                                                                           |
|  +-------------------------------------------------------------------+   |
|  | GCE VM — hamafx-cron (e2-medium, us-central1-a)                   |   |
|  |                                                                   |   |
|  |  +-------------------+  +-------------------+  +---------------+ |   |
|  |  | hamafx-worker     |  | systemd timers    |  | Backup scripts| |   |
|  |  | .service          |  | (8 heavy + 4 light|  | (DB + journal | |   |
|  |  | (SignalR + ticks  |  |  cron pokes +     |  |  + verify)    | |   |
|  |  |  + candle agg)    |  |  self-update)     |  |               | |   |
|  |  +-------------------+  +-------------------+  +---------------+ |   |
|  +-------------------------------------------------------------------+   |
|                                                                           |
|  +-------------------+  +-------------------+  +-------------------+      |
|  | GCS bucket        |  | healthchecks.io   |  | Sentry            |      |
|  | (backups)         |  | (heartbeat)       |  | (error tracking)  |      |
|  +-------------------+  +-------------------+  +-------------------+      |
+---------------------------------------------------------------------------+
```

### 2.2 Vercel (Web App)

- **Framework:** Next.js (auto-detected)
- **Build command:** `node ../../scripts/predeploy-migrate.mjs && npx turbo run build --filter=@hamafx/web` (`apps/web/vercel.json`)
- **Cron:** `/api/cron/evaluate-signals` at `0 1 * * *` (1 job registered in `vercel.json`)
- **Env vars:** Set in Vercel dashboard or via GCP Secret Manager (`SECRETS_VAULT_PROVIDER=gcp-secret-manager`)
- **Output:** Vercel handles build output (no `standalone` mode needed)

### 2.3 GCE VM (Worker + Crons)

**Instance details** (from `infra/cron-vm/README.md`):

| Property | Value |
|----------|-------|
| Name | `hamafx-cron` |
| Project | `hamafx-78845` |
| Zone | `us-central1-a` |
| Machine type | `e2-medium` (2 vCPU, 4 GB RAM) |
| OS | Ubuntu 24.04 LTS Minimal |
| Disk | 10 GB pd-standard |
| Monthly cost | ~$15-17 |

**Setup:**
```bash
# From local machine:
gcloud compute scp -r infra/cron-vm hamafx-cron:/tmp/hamafx-cron --zone=us-central1-a
gcloud compute ssh hamafx-cron --zone=us-central1-a \
  --command="sudo bash /tmp/hamafx-cron/setup.sh"
```

**`setup.sh`** (`infra/cron-vm/setup.sh`):
- Installs curl, logrotate, postgresql-client, docker.io, google-cloud CLI
- Copies systemd unit files from `infra/cron-vm/units/` to `/etc/systemd/system/`
- Enables all `*.timer` files
- Stops + masks legacy `cron` daemon
- Adds `hamafx` user to docker group

### 2.4 Systemd Timers

All unit files in `infra/cron-vm/units/`:

**Worker service:**
| Unit | Purpose |
|------|---------|
| `hamafx-worker.service` | Always-on worker (SignalR + tick processing) |

**Heavy job timers (worker jobs via CLI):**
| Timer | Schedule | Service | Job |
|-------|----------|---------|-----|
| `hamafx-job-briefings.timer` | Every 5 min | `hamafx-job-briefings.service` | briefings |
| `hamafx-job-snapshots.timer` | 00:05 UTC daily | `hamafx-job-snapshots.service` | snapshots |
| `hamafx-job-embedding-backfill.timer` | Every 6 hours | `hamafx-job-embedding-backfill.service` | embedding-backfill |
| `hamafx-job-cot.timer` | Friday 22:00 UTC | `hamafx-job-cot.service` | cot |
| `hamafx-job-fred-actuals.timer` | 01:30 UTC daily | `hamafx-job-fred-actuals.service` | fred-actuals |
| `hamafx-job-weekly-review.timer` | Sunday 18:00 UTC | `hamafx-job-weekly-review.service` | weekly-review |
| `hamafx-job-resonance-sync.timer` | 23:00 UTC daily | `hamafx-job-resonance-sync.service` | resonance-sync |

**Light cron pokers (curl to Vercel):**
| Timer | Schedule | Service | Endpoint |
|-------|----------|---------|----------|
| `hamafx-light-alerts.timer` | Every 5 min | `hamafx-light-alerts.service` | `/api/cron/alerts` |
| `hamafx-light-calendar.timer` | Every 15 min | `hamafx-light-calendar.service` | `/api/cron/calendar` |
| `hamafx-light-news.timer` | Every 5 min | `hamafx-light-news.service` | `/api/cron/news` |
| `hamafx-light-warm-cache.timer` | Every 2 min | `hamafx-light-warm-cache.service` | `/api/cron/warm-cache` |
| `hamafx-light-cleanup-uploads.timer` | Daily | `hamafx-light-cleanup-uploads.service` | `/api/cron/cleanup-uploads` |

**Maintenance timers:**
| Timer | Schedule | Service | Purpose |
|-------|----------|---------|---------|
| `hamafx-update.timer` | Every 5 min | `hamafx-update.service` | Git pull + worker restart |
| `hamafx-backup-db.timer` | Daily | `hamafx-backup-db.service` | DB backup to GCS |
| `hamafx-backup-journal.timer` | Daily | `hamafx-backup-journal.service` | Journal export to GCS |
| `hamafx-verify-restore.timer` | Weekly | `hamafx-verify-restore.service` | Backup restore verification |
| `hamafx-tenant-export.timer` | Weekly | `hamafx-tenant-export.service` | Per-tenant export rehearsal |
| `hamafx-tenant-delete.timer` | Weekly | `hamafx-tenant-delete.service` | Per-tenant delete dry-run |

### 2.5 Backup & Restore

**Scripts** (`infra/cron-vm/scripts/`):
| Script | Purpose |
|--------|---------|
| `backup-db.sh` | `pg_dump` → GCS bucket |
| `backup-journal.sh` | Journal entries export → GCS |
| `verify-restore.sh` | Restore backup to throwaway Postgres, sanity-check row counts |
| `export-tenant.sh` | Per-tenant data export |
| `delete-tenant.sh` | Per-tenant data deletion (dry-run rehearsal) |

**GCS bucket:** `hamafx-backups-hamafx-78845`

**Recovery playbook:** `infra/cron-vm/RECOVERY.md` — concrete commands for each failure scenario (DB restore, journal restore, VM rebuild, key rotation).

### 2.6 Production Env Vars (Key Set)

| Env var | Value (production) |
|---------|-------------------|
| `HAMAFX_RUNTIME` | unset (Vercel) / `worker` (GCE) |
| `DATABASE_URL` | Supabase pooler URL |
| `DIRECT_URL` | Supabase direct/session URL (for migrations) |
| `AUTH_SECRET` | 32-byte hex (generated) |
| `ENCRYPTION_SECRET` | 32-byte hex (generated) |
| `CRON_SECRET` | From Vercel cron settings |
| `MULTI_USER_ENABLED` | `1` |
| `BYOK_ENABLED` | `1` |
| `HAMAFX_ENABLE_RLS` | `true` |
| `ADMIN_DATABASE_URL` | `hamafx_admin` role connection string |
| `SECRETS_VAULT_PROVIDER` | `gcp-secret-manager` |
| `GCP_PROJECT_ID` | `hamafx-78845` |
| `AI_GATEWAY_API_KEY` | Vercel AI Gateway key |
| `AI_DEFAULT_MODEL` | `google/gemini-2.5-flash` |
| `NOWPAYMENTS_API_BASE` | `https://api.nowpayments.io` |
| `NOWPAYMENTS_API_KEY` | Production NOWPayments key |
| `NOWPAYMENTS_IPN_SECRET` | Production IPN secret |
| `SENTRY_DSN` | Sentry project DSN |
| `TELEGRAM_BOT_TOKEN` | Bot token from @BotFather |
| `HC_SIGNALR_UUID` | healthchecks.io UUID |
| `BIQUOTE_HUB_URL` | `https://biquote.io/hubs/tick` |
| `FINNHUB_API_KEY` | Finnhub API key |
| `MARKETAUX_API_KEY` | Marketaux API key |
| `FRED_API_KEY` | FRED API key |
| `TWELVEDATA_API_KEY` | TwelveData API key |

---

## 3. Self-Hosting Guide (Docker Compose)

### 3.1 Prerequisites

- **Docker** and **Docker Compose V2** installed
- At least 2GB RAM (4GB recommended)
- A domain name (optional, but recommended if exposing to internet)

### 3.2 Steps

```bash
# 1. Clone the repository
git clone https://github.com/HamaFx/HamaFX-Ai.git
cd HamaFX-Ai

# 2. Copy environment template
cp .env.example .env

# 3. Generate required secrets
node -e "console.log('AUTH_SECRET=' + require('crypto').randomBytes(32).toString('hex'))"
node -e "console.log('ENCRYPTION_SECRET=' + require('crypto').randomBytes(32).toString('hex'))"
node -e "console.log('CRON_SECRET=' + require('crypto').randomBytes(16).toString('hex'))"

# 4. Edit .env — fill in at minimum:
#    AUTH_SECRET, ENCRYPTION_SECRET, CRON_SECRET
#    GOOGLE_GENERATIVE_AI_API_KEY (or AI_GATEWAY_API_KEY)
#    NEXTAUTH_URL=http://localhost:3000
#    MULTI_USER_ENABLED=1 (if you want multi-user)
#    BYOK_ENABLED=1 (if you want BYOK)

# 5. Start services
docker compose up -d

# 6. Open http://localhost:3000
```

### 3.3 What Docker Compose Starts

From `docker-compose.yml`:

| Service | Port | Purpose |
|---------|------|---------|
| `db` | 5432 | Postgres 16 + pgvector (`pgvector/pgvector:pg16`) |
| `langfuse` | 3001 | Langfuse LLM observability (self-hosted) |
| `app` | 3000 | Next.js web app (standalone build) |
| `worker` | 8081 | Worker daemon (SignalR + tick processing + jobs) |

**Health checks:** All services have health checks. The `app` service polls `/api/health`, the `worker` polls `http://localhost:8081/health`.

**Resource limits:**
| Service | Memory limit | CPU limit |
|---------|-------------|-----------|
| `app` | 1GB | 1.0 |
| `worker` | 512MB | 0.5 |

### 3.4 Docker Compose

`docker-compose.yml` — single compose file for both development and production Docker deployment (web + worker + Postgres + Langfuse):

```bash
./docker/init-secrets.sh    # generates .env with random secrets
docker compose up -d
```

### 3.5 Langfuse (Optional)

Langfuse runs as a Docker container on port 3001. Access the UI at `http://localhost:3001`.

Create API keys in Langfuse UI → Settings → API Keys, then set:
```
LANGFUSE_PUBLIC_KEY=pk-lf-...
LANGFUSE_SECRET_KEY=sk-lf-...
LANGFUSE_BASE_URL=http://localhost:3001
```

When any of these is unset, Langfuse tracing is silently disabled.

---

## 4. CI/CD Pipeline

### 4.1 GitHub Actions Workflows

| Workflow | Trigger | Purpose | Source |
|----------|---------|---------|--------|
| `ci-fast` | Pull request | Lint + typecheck + build + unit tests (with coverage) + test file guard | `.github/workflows/ci-fast.yml` |
| `ci-slow` | Push to main + nightly | Lint + typecheck + unit tests + E2E (Playwright) + nightly AI eval | `.github/workflows/ci-slow.yml` |
| `docker-publish` | Release published | Build + Trivy scan + push to GitHub Container Registry | `.github/workflows/docker-publish.yml` |
| `release` | Push to main | Changesets release PR or publish | `.github/workflows/release.yml` |
| `codeql` | Push/PR to main + weekly | CodeQL security analysis (JavaScript) | `.github/workflows/codeql.yml` |
| `stale` | Daily | Mark stale issues (30 days) and PRs (45 days) | `.github/workflows/stale.yml` |
| `pr-labeler` | PR opened/sync/reopened | Auto-label PRs based on changed files | `.github/workflows/pr-labeler.yml` |

### 4.2 CI Pipeline Detail

**ci-fast (PR gate):**
1. `pnpm install --frozen-lockfile`
2. `pnpm turbo run lint`
3. `pnpm turbo run typecheck`
4. `pnpm turbo run build` (real build gate — catches broken `next build`)
5. `pnpm turbo run test -- --coverage`
6. `pnpm test:empty-guard` (ensures no empty test files)
7. Coverage report via `davelosert/vitest-coverage-report-action`

**ci-slow (main + nightly):**
1. Lint + typecheck
2. Unit + integration tests with coverage
3. E2E Playwright tests (`pnpm exec playwright install --with-deps` + `pnpm exec playwright test`)
4. Nightly AI eval harness (`pnpm turbo run eval`, only on schedule)

### 4.3 Docker Publishing

On GitHub release published:
1. Build web image (`Dockerfile`) and worker image (`Dockerfile.worker`)
2. Scan both with Trivy (CRITICAL + HIGH severity → fail)
3. Upload SARIF to GitHub Security tab
4. Push to `ghcr.io` (GitHub Container Registry)

### 4.4 Dependabot

`.github/dependabot.yml` — weekly updates for npm and GitHub Actions.

---

## 5. Testing

### 5.1 Test Infrastructure

| Runner | Scope | Config |
|--------|-------|--------|
| Vitest | Unit + integration tests (90+ files, 590+ cases) | `vitest.workspace.ts`, per-package `vitest.config.ts` |
| Playwright | E2E tests (7 spec files) | `apps/web/playwright.config.ts` |

### 5.2 Test Commands

```bash
# All packages
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

# Watch mode (dev only)
pnpm --filter @hamafx/indicators test

# E2E (Playwright)
pnpm --filter @hamafx/web exec playwright test

# AI Evals (manual, not in CI)
pnpm --filter @hamafx/ai eval -- --base-url http://localhost:3000 \
  --cookie "authjs.session-token=..." --cases
```

### 5.3 E2E Test Files

| Spec | Source | Tests |
|------|--------|-------|
| `auth.spec.ts` | `apps/web/tests/e2e/auth.spec.ts` | Login, register, logout |
| `chat.spec.ts` | `apps/web/tests/e2e/chat.spec.ts` | Chat flow, tool rendering |
| `isolation.spec.ts` | `apps/web/tests/e2e/isolation.spec.ts` | Multi-tenant data isolation |
| `multi-agent.spec.ts` | `apps/web/tests/e2e/multi-agent.spec.ts` | Committee deliberation |
| `service-worker.spec.ts` | `apps/web/tests/e2e/service-worker.spec.ts` | PWA service worker |
| `settings.spec.ts` | `apps/web/tests/e2e/settings.spec.ts` | Settings pages |

### 5.4 AI Eval Harness

- **Source:** `packages/ai/src/eval/` — `runner.ts`, `cases.json`, `prompts.json`, `parse-stream.ts`
- **Purpose:** End-to-end AI quality evaluation against a curated set of trading prompts
- **Not in CI** — runs nightly only (ci-slow schedule trigger) or manually
- **Requires:** Running app instance + auth cookie

---

## 6. Incident Response

> **Source:** `docs/archive/INCIDENT-RESPONSE.md` (archived)

### 6.1 Severity Taxonomy

| SEV | Definition | Response Target | Restore Target |
|-----|-----------|----------------|----------------|
| SEV1 | Full outage (chat, auth, or AI gateway down). Data loss. Billing failure. | 15 min | 1 hour |
| SEV2 | Major degradation (chat >10s latency, provider down, cron stuck >2h, >25% users affected) | 30 min | 4 hours |
| SEV3 | Minor degradation (intermittent errors, single cron failure, UI bugs with workaround) | 2 hours | 1 business day |
| SEV4 | Cosmetic / non-urgent (docs drift, minor UI glitch, log noise) | 1 business day | Next release |

### 6.2 SLOs

| Service | SLI | Target | Window |
|---------|-----|--------|--------|
| Chat API | Success rate (non-429/4xx) | 99.5% | 30 days |
| Auth | Login success rate (excluding user error) | 99.9% | 30 days |
| AI Gateway | Tool call success rate | 99.0% | 30 days |
| Worker | Tick flush success rate | 99.9% | 30 days |
| Cron Jobs | Job completion rate | 99.5% | 30 days |
| /api/health | Uptime | 99.9% | 30 days |

### 6.3 Recovery

See `infra/cron-vm/RECOVERY.md` for concrete recovery commands for:
- Database restore from GCS backup
- Journal restore
- VM rebuild from scratch
- Key rotation
- Worker restart
