# HamaFX-Ai k6 Load Testing

> Backend HTTP load & performance testing using [Grafana k6](https://grafana.com/docs/k6/).
>
> This suite fills the gap between Vitest (correctness), Playwright (UX), and
> Lighthouse (front-end vitals). It answers: *how many concurrent users can the
> API sustain, at what latency percentiles, before errors climb?*

## Prerequisites

Install k6 **≥ v0.57.0** (native TypeScript support):

```bash
# macOS
brew install k6

# Linux (Debian/Ubuntu)
curl -fsSL https://dl.k6.io/key.gpg | sudo gpg --dearmor -o /usr/share/keyrings/k6-archive-keyring.gpg
echo "deb [signed-by=/usr/share/keyrings/k6-archive-keyring.gpg] https://dl.k6.io/deb stable main" | sudo tee /etc/apt/sources.list.d/k6.list
sudo apt update && sudo apt install k6

# Or via Docker:
docker run --rm -i grafana/k6 run - < path/to/script.ts
```

## Quick Start

```bash
cd loadtest
npm install
npm run typecheck
```

## Auth Strategies

### Strategy A — Legacy Bypass (simplest)

Set `AUTH_MODE=legacy` in the SUT (development only) and all requests are
treated as a single `__system__` user. No cookies or CSRF needed.

**SUT setup:**
```bash
docker compose -f loadtest/docker-compose.loadtest.yml up -d --wait
```

**Run tests:**
```bash
k6 run -e K6_BASE_URL=http://localhost:3000 -e K6_AUTH_MODE=legacy tests/smoke-read-mix.ts
k6 run -e K6_BASE_URL=http://localhost:3000 -e K6_AUTH_MODE=legacy tests/load-read-mix.ts
```

The docker-compose.loadtest.yml already sets `AUTH_MODE=legacy` and lifts all
rate limits, so single-user load tests work without 429s.

### Strategy B — Real NextAuth Sessions (realistic)

Seed N test users, then k6 logs each in via the NextAuth credentials callback
and distributes load across them.

```bash
# 1. Seed users against the throwaway DB (run from repo root so @hamafx/db workspace links resolve)
cd ~/HamaFX-Ai
DATABASE_URL=postgres://hamafx:loadtest@localhost:5432/hamafx \
  K6_ALLOW_SEED=true K6_USER_COUNT=25 node loadtest/lib/seed/seed-users.mjs

# 2. Run tests with session auth
cd loadtest
k6 run -e K6_BASE_URL=http://localhost:3000 -e K6_AUTH_MODE=session \
  -e K6_USER_COUNT=25 tests/load-market-read.ts
```

## Test Types

| Type | Script | Purpose | CI |
|---|---|---|---|
| **Smoke** | `tests/smoke-market-read.ts`, `tests/smoke-read-mix.ts` | Validate script + SUT wiring | Nightly |
| **Average-load** | `tests/load-market-read.ts`, `tests/load-read-mix.ts` | Baseline for regression comparison | Nightly |
| **Stress** | `tests/stress-market-read.ts` | Find the throughput ceiling | Manual only |
| **Spike** | `tests/spike-read-mix.ts` | Sudden surge → recovery | Manual only |
| **Soak** | `tests/soak-read-mix.ts` | Detect memory leaks over hours | Manual only |
| **Chat** | `tests/load-chat.ts` | LLM streaming latency (guarded) | Manual only |

## npm Scripts

```bash
npm run typecheck     # tsc --noEmit
npm run smoke          # k6 run tests/smoke-read-mix.ts
npm run load           # k6 run tests/load-read-mix.ts
npm run stress         # k6 run tests/stress-market-read.ts
npm run spike          # k6 run tests/spike-read-mix.ts
npm run soak           # k6 run tests/soak-read-mix.ts
npm run seed           # Seed users for Strategy B
```

## Environment Variables

### k6 test env (`-e KEY=val`)

| Variable | Default | Purpose |
|---|---|---|
| `K6_BASE_URL` | `http://localhost:3000` | SUT base URL |
| `K6_AUTH_MODE` | `legacy` | `legacy` or `session` |
| `K6_USER_COUNT` | `10` | Number of seeded users (Strategy B) |
| `K6_TEST_PASSWORD` | `LoadTest!123` | Shared password for seeded users |
| `K6_TARGET_RPS` | varies | Target requests/sec for load profiles |
| `K6_SOAK_DURATION` | `1h` | Duration for soak test |
| `K6_ENABLE_CHAT` | unset | Must be `true` to run chat load test |
| `K6_LOADTEST_RELAXED` | `true` for Docker SUT | Relax p95/p99 thresholds 2-4× (POST endpoints slower w/o cache) |
| `K6_CRON_SECRET` | unset | For cron endpoint tests |

### SUT env (for the throwaway SUT)

| Variable | Default | Purpose |
|---|---|---|
| `MARKET_READ_RATE_LIMIT` | `100000` | Lifted for Strategy A |
| `AUTH_MODE` | `legacy` | Skip auth for k6 |
| `NODE_ENV` | `development` | Required for legacy auth bypass |
| `LIVE_TICKS_MAX_AGE_MS` | `86400000` | 24h freshness window for seeded live_ticks |
| `DB_DISABLE_SSL` | `true` | Skip TLS for local Docker Postgres |

Auto-seeding: the `seed-ticks` service in docker-compose.loadtest.yml seeds
XAUUSD/EURUSD/GBPUSD into the `live_ticks` table on startup, so the price
endpoint works without a running worker.

## Output

Every run produces:
- `results/<testname>-<timestamp>.summary.json` — full k6 JSON summary
- `results/<testname>-<timestamp>.junit.xml` — CI test report
- stdout text summary

## CI

`.github/workflows/loadtest.yml` runs smoke + average-load nightly at 3 AM UTC.
All other test types are `workflow_dispatch` only.

k6 **never gates PRs** — it's a dedicated workflow, separate from `ci-fast.yml`.

## Out of Scope

- **The worker** (`apps/worker`) is not an end-user HTTP server and cannot be
  load-tested via k6. Worker load is *indirect* (DB write pressure from tick
  volume). A separate harness would be needed.

- **Cron endpoints** (`/api/cron/*`) are bearer-token-protected background jobs.
  Do not blast them in load tests without explicit CRON_SECRET configuration.

- **WebSocket / SSE streaming** — the `/api/market/stream` SSE endpoint is not
  load-tested. True SSE streaming measurement requires xk6-sse (experimental).
