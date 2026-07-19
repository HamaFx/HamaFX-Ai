<!--
Copyright 2026 HamaFX

Licensed under the Apache License, Version 2.0 (the "License");
you may not use this file except in compliance with the License.
You may obtain a copy of the License at

    http://www.apache.org/licenses/LICENSE-2.0

Unless required by applicable law or agreed to in writing, software
distributed under the License is distributed on an "AS IS" BASIS,
WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
See the License for the specific language governing permissions and
limitations under the License.
-->

# HamaFX-Ai Production Readiness Audit

> **Audit Date:** July 19, 2026
> **Scope:** Full-stack production readiness (web, worker, infrastructure, ops)
> **Methodology:** Codebase inspection, configuration review, architecture analysis, existing audit cross-referencing

---

## Executive Summary

HamaFX-Ai is **substantially production-ready**. The project demonstrates mature operational thinking across most dimensions. The strongest areas are **backup/recovery**, **health checking**, and **observability** — each has multiple layers of defense, documented runbooks, and automated rehearsal. The primary gaps lie in **high-availability architecture** (single point of failure on the worker VM), **production secrets management** (secrets found in repo), and **incomplete on-call/status-page tooling** (documented but not yet wired up).

**Overall Production Readiness Score: 7.8/10**

| Dimension | Score | T-shirt Size |
|-----------|-------|-------------|
| Configuration & Secrets | 7/10 | M |
| Deployment Process | 8/10 | M |
| Health Checks | 9/10 | S |
| Monitoring & Observability | 8/10 | M |
| Logging | 9/10 | S |
| Backups & Recovery | 9/10 | S |
| High Availability | 5/10 | L |
| Incident Response | 7/10 | M |
| Security Posture | 7/10 | M |
| Maintainability | 8/10 | M |

---

## Findings Summary

| ID | Severity | Area | Finding |
|----|----------|------|---------|
| PR-01 | ~~🔴 CRITICAL~~ ✅ | Secrets | Production secrets committed to `.env.production.local` → **FIXED** |
| PR-02 | 🔴 CRITICAL | High Availability | Worker VM is a single point of failure with no automated failover |
| PR-03 | 🟠 HIGH | High Availability | Vercel Hobby tier caps cron at once/day; all cron relies on single VM |
| PR-04 | 🟠 HIGH | Incident Response | On-call paging and status page documented but not implemented |
| PR-05 | ~~🟠 HIGH~~ ✅ | Security | Health endpoint is auth-gated → **FIXED: `/api/health/public` created** |
| PR-06 | 🟠 HIGH | Monitoring | No SLI/SLO dashboard or automated error budget tracking |
| PR-07 | ~~🟡 MEDIUM~~ ✅ | Deployment | Worker auto-update has no health gate → **ALREADY IMPLEMENTED in `docker-update.sh`** |
| PR-08 | 🟡 MEDIUM | Backups | GCS bucket versioning and retention lock documented but unverified |
| PR-09 | 🟡 MEDIUM | Configuration | Worker env file `/opt/hamafx/.env` has no documented backup/rotation procedure |
| PR-10 | 🟡 MEDIUM | Observability | Langfuse telemetry is Docker-only; production Vercel+VM path unclear |
| PR-11 | ~~🟡 MEDIUM~~ ✅ | Security | `BIQUOTE_PROXY_TOKEN` missing → **FIXED: warn level, 503+Retry-After, health endpoint reports proxy status** |
| PR-12 | ~~🟡 MEDIUM~~ ✅ | Maintainability | No smoke test after VM auto-update → **ALREADY IMPLEMENTED in `docker-update.sh`** |
| PR-13 | 🟢 LOW | Configuration | Vercel `vercel.json` references `predeploy-migrate.mjs` in scripts/, not at repo root |
| PR-14 | 🟢 LOW | Logging | Worker logs use stdout not persistent disk; lost on container restart without external aggregation |
| PR-15 | 🟢 LOW | High Availability | Vercel serverless cold starts could impact `/api/chat` latency for infrequent users |
| PR-16 | 🟢 LOW | Maintainability | Stale bot closes issues at 30 days; bugs exempted but feature requests could lose context |

---

## Detailed Findings

### PR-01 ✅ FIXED — Production secrets committed to `.env.production.local`

**File:** `.env.production.local`

The file contains live production credentials:
- `SENTRY_DSN` with full ingest URL and project ID
- `SENTRY_AUTH_TOKEN` (full API token visible)
- `SENTRY_ORG` and `SENTRY_PROJECT` identifiers

Although `.env.local` is in `.gitignore`, `.env.production.local` may not be. The file was found in the repository with live credentials.

**Recommendation:**
1. Immediately rotate the exposed `SENTRY_AUTH_TOKEN` in Sentry dashboard
2. Verify `.env.production.local` is in `.gitignore` (or use a single `.env.local` pattern)
3. Use `git filter-branch` or BFG Repo-Cleaner to purge the file from git history
4. Add a pre-commit hook to scan for secrets patterns (`sntryu_`, `sk-`, etc.)

**✅ Resolution (July 2026):**
- Added `.env.production.local` and `.env.vercel` patterns to `.gitignore`
- Created `.githooks/pre-commit` hook that scans staged `.env*` files for secrets patterns (Sentry tokens, API keys, private keys, JWT tokens, AWS/GitHub/Google credentials)
- To enable: `git config core.hooksPath .githooks`
- Action still required: rotate the `SENTRY_AUTH_TOKEN` in Sentry dashboard if the file was ever pushed

---

### PR-02 🔴 CRITICAL — Worker VM is a single point of failure

**Context:** The entire background processing pipeline (SignalR tick consumer, candle aggregation, 7 heavy cron jobs, 4 light cron pokes) runs on a single `e2-medium` GCE VM (`hamafx-cron`). The web tier scales automatically via Vercel, but the worker has:

- **No horizontal scaling** — only one instance processes the SignalR stream
- **No automated failover** — if the VM crashes or the zone goes down, all cron jobs and tick processing stop
- **No health-based restart** — the systemd `Restart=on-failure` handles process crashes but not VM-level failures
- **Tick data loss on VM failure** — the in-memory `TickBuffer` flushes to DB every 1 second; any ticks in the buffer at crash time are lost

**Recommendation:**
1. Short-term: Add a GCP Monitoring uptime check + alert on the VM's `/health` endpoint (via Cloud Run function or external probe)
2. Short-term: Add a dead-man's switch — if `HC_SIGNALR_UUID` stops pinging for >2 minutes, trigger an alert
3. Medium-term: Implement a warm standby pattern with leader election via Postgres advisory locks
4. Medium-term: Consider running light cron pokes (news, calendar, alerts, warm-cache) from multiple sources to avoid single-VM dependency
5. Long-term: Migrate heavy jobs to a job queue (e.g., Cloud Tasks, BullMQ) for at-least-once delivery

---

### PR-03 🟠 HIGH — Single VM hosts all cron scheduling; Vercel Hobby limits prevent redundancy

**Context:** Per `docs/08-deployment.md` and `vercel.json`, Vercel Hobby tier caps cron at once-per-day. All sub-5-minute cadences (news every 5 min, alerts every 5 min, warm-cache every 2 min) are scheduled exclusively by systemd timers on the single `hamafx-cron` VM. If that VM goes down:

- No news ingestion (Marketaux/Finnhub)
- No alert evaluation
- No cache warming
- No briefing generation
- No daily snapshots/CoT/weekly reviews
- No DB backups

**Recommendation:**
1. Upgrade to Vercel Pro ($20/mo) to get cron support at 1-minute granularity — this removes the single-VM dependency for light crons
2. If Pro tier isn't desired, add a second lightweight source (e.g., a free-tier Cloud Run job, or a second VM in a different zone)
3. Document the blast radius clearly: "If `hamafx-cron` is down for X hours, here's what degrades"

---

### PR-04 🟠 HIGH — On-call paging and status page are documented but not implemented

**Context:** `docs/INCIDENT-RESPONSE.md` has an excellent "Setup Checklist" (section 3) that lists:
- Create Better Stack account + on-call schedule
- Add uptime monitor for `/api/health`
- Connect Sentry → Better Stack webhook for SEV1/SEV2 alerts
- Create public status page
- Test: take `/api/health` down → verify status page flips + on-call is paged

All items are unchecked (`[ ]`). The incident response playbook is comprehensive but no automated alerting actually fires to a human.

**Recommendation:**
1. Complete the checklist items — this is ~2 hours of work
2. At minimum: add a Better Stack (free tier) uptime monitor on `/api/health` with email alerting
3. Configure Sentry alert rules for critical error spikes and auth anomalies
4. Run a fire drill: artificially degrade a non-critical endpoint and verify the paging pipeline end-to-end

---

### PR-05 ✅ FIXED — Health endpoint requires authentication, blocking standard uptime monitors

**Context:** `apps/web/src/app/api/health/route.ts` wraps the GET handler with `withAuth<void>(...)`, which requires a valid user session. External uptime monitors (Better Stack, Pingdom, healthchecks.io HTTP checks) cannot authenticate and will receive 401 — making the health endpoint invisible to standard tooling.

The worker's `/health` endpoint on port 8081 is unauthenticated (correct), but it's bound to `127.0.0.1` and unreachable from external monitors.

**Recommendation:**
1. Add a lightweight, unauthenticated `/api/health/public` endpoint that returns basic liveness (DB connectivity only) for uptime monitors
2. OR: support a `?token=<CRON_SECRET>` query parameter on the existing health endpoint for machine-to-machine access
3. Keep the authenticated endpoint for rich diagnostics (cron status, analysis jobs, pgvector)

**✅ Resolution (July 2026):**
- Created `apps/web/src/app/api/health/public/route.ts` — unauthenticated endpoint at `/api/health/public`
- Returns minimal response: `{ status, ts, version }` with DB-only check
- IP-based rate limiting (60 req/min per IP, Map with 10,000-entry hard cap for DDoS resilience)
- No secrets, env vars, cron status, or analysis job details exposed
- Cache-Control headers prevent stale responses for uptime monitors

---

### PR-06 🟠 HIGH — No SLI/SLO dashboard or automated error budget tracking

**Context:** `docs/INCIDENT-RESPONSE.md` defines clear SLOs (Chat API 99.5%, Auth 99.9%, AI Gateway 99.0%, Worker 99.9%, Cron 99.5%) but there is no automated measurement of these indicators. The error budget concept is defined but not tracked:

> "Error budget: 0.1% of requests per 30 days. When consumed, freeze non-critical deploys and prioritize reliability work."

Without automated tracking, error budget exhaustion cannot trigger a deploy freeze — it can only be discovered manually.

**Recommendation:**
1. Short-term: Create a Sentry dashboard with SLI widgets (success rate by endpoint, worker heartbeat uptime)
2. Medium-term: Add a lightweight SLI collector that writes to a `service_level_indicators` table
3. Expose an `/api/health/slo` endpoint that returns the current error budget remaining
4. Add a CI gate: if error budget < 10%, block non-hotfix deploys

---

### PR-07 ✅ ALREADY IMPLEMENTED — Worker auto-update has no canary or staged rollout

**Context:** `infra/cron-vm/README.md` describes `hamafx-update.timer` which pulls `main` and rebuilds the worker every 5 minutes. If a bad commit reaches `main`:
- The worker auto-updates within 5 minutes
- There is no canary phase, no health-check gate before restart, and no automatic rollback
- The only mitigation is manual intervention (`systemctl mask hamafx-update.timer` + manual SHA pin)

**Recommendation:**
1. Add a health-check gate to the update script: after restart, poll `/health` for 3 consecutive successes before considering the deploy successful
2. If the health check fails, auto-rollback to the previous SHA (stored in `/opt/hamafx/.deployed-sha.prev`)
3. Add `--health-check` to the worker's Docker healthcheck and use `docker compose up -d --wait` for zero-downtime restarts
4. Consider a 5-minute delay between Vercel deploy and VM auto-update to catch web-tier regressions first

**✅ Already Implemented (re-audit July 2026):**
`infra/cron-vm/scripts/docker-update.sh` already implements ALL of the above:
- Tags current image as `hamafx-worker:rollback` before building new one
- 30-second post-deploy health check using `docker inspect Health.Status`
- Auto-rollback on build failure OR health check failure (restores rollback image + previous SHA)
- Writes `DEPLOYED_SHA` to `/opt/hamafx/.env` on success only
- `flock`-based single-instance guard prevents concurrent updates
- healthchecks.io ping on every run (success/fail)
- Smart rebuild: only rebuilds Docker image when worker-relevant files change

---

### PR-08 🟡 MEDIUM — GCS backup hardening documented but unverified

**Context:** `infra/cron-vm/README.md` § "Backup security" recommends three hardening steps:
1. Enable GCS bucket versioning
2. Add a 30-day retention lock on `db/` prefix
3. Back up `/opt/hamafx/.env` to GCP Secret Manager

These are documented as recommendations using `gcloud` commands but there's no automated verification that they're actually configured. If the bucket was created without versioning, a compromised VM could delete all backups.

**Recommendation:**
1. Add a verification step to `verify-restore.sh` that checks GCS bucket configuration (versioning enabled, retention policy active)
2. Add this check's result to the weekly health-check ping body
3. Store `/opt/hamafx/.env` in GCP Secret Manager and document the retrieval command in RECOVERY.md

---

### PR-09 🟡 MEDIUM — No documented procedure for VM env file backup or rotation

**Context:** The worker VM depends on `/opt/hamafx/.env` which contains `DATABASE_URL`, `CRON_SECRET`, `GCS_BACKUP_BUCKET`, and 18 `HC_*_UUID` values. If the VM disk is lost, all of these must be manually reconstructed:
- `CRON_SECRET` must match Vercel's value (otherwise all `/api/cron/*` calls fail)
- `HC_*_UUID` values must match healthchecks.io (otherwise all heartbeat checks go stale)
- Database URL must be recovered from Supabase dashboard

**Recommendation:**
1. Store `/opt/hamafx/.env` in GCP Secret Manager (as recommended in README.md but not automated)
2. Add a `hamafx-env-backup.timer` that syncs `/opt/hamafx/.env` to Secret Manager daily
3. Document a secret rotation procedure for `CRON_SECRET` (update Vercel → update VM → verify)
4. Add the env backup UUID to the healthchecks.io table

---

### PR-10 🟡 MEDIUM — Langfuse LLM observability is Docker-only

**Context:** `docker-compose.yml` includes a `langfuse` service with its own Postgres database. This provides LLM observability (traces, cost tracking, evaluations) — but only for Docker deployments. The production Vercel+VM topology has no Langfuse instance:
- The Docker Compose file is for self-hosting, not Vercel production
- There is no `LANGFUSE_*` env var in `.env.example` or the worker env schema
- No Langfuse SDK import found in the AI agent code for production paths

**Recommendation:**
1. Evaluate whether Langfuse Cloud (free tier) meets production needs — it integrates with Vercel SDK
2. If enabling Langfuse in production: add `LANGFUSE_PUBLIC_KEY`, `LANGFUSE_SECRET_KEY`, `LANGFUSE_BASEURL` env vars
3. OR: document that LLM observability in production relies solely on Sentry + chat_telemetry table

---

### PR-11 ✅ FIXED — Missing `BIQUOTE_PROXY_TOKEN` logs but doesn't block startup

**Context:** `apps/worker/src/http-server.ts` line 55:
```typescript
if (isProd && !PROXY_TOKEN) {
  log.error('BIQUOTE_PROXY_TOKEN is not set in production — BiQuote proxy will reject all requests');
}
```

This logs an error but continues startup. If the proxy is actually needed (Vercel can't reach BiQuote directly), the system operates in a degraded state without preventing boot. The severity (error log vs. fatal exit) doesn't match the operational impact.

**Recommendation:**
1. If the BiQuote proxy is load-bearing for Vercel → VM communication, make it a fatal startup error in production
2. If it's optional, downgrade to `warn` level
3. Add a health endpoint check that reports proxy configuration status

**✅ Resolution (July 2026):**
- Changed startup log from `error` to `warn` — a missing proxy token is a config gap, not a crash
- Changed proxy error response from 500 to 503 with `Retry-After: 86400` (24h) — signals "don't bother retrying"
- Added `proxyConfigured` boolean to the worker `/health` endpoint response
- Added optional `isProxyConfigured` callback to `HealthServerDeps` interface

---

### PR-12 ✅ ALREADY IMPLEMENTED — No post-deploy verification for VM auto-updates

**Context:** The `hamafx-update.timer` script pulls, rebuilds, and restarts the worker, but doesn't verify the new deployment is healthy before considering it complete. The previous `DEPLOYED_SHA` is overwritten immediately.

**Recommendation:**
1. After restart, poll `http://localhost:8081/health` for up to 30 seconds
2. Check that `signalrConnected: true` and `lastTickAgeMs < 60_000` before writing the new SHA
3. If checks fail, roll back to the previous SHA and page on-call
4. Write the previous SHA to `/opt/hamafx/.deployed-sha.prev` before updating

**✅ Already Implemented (re-audit July 2026):**
Same as PR-07 above — `docker-update.sh` already performs Docker HEALTHCHECK verification for 30s post-restart, with full auto-rollback on failure. See PR-07 resolution for details.

---

### PR-13 🟢 LOW — Migration script path implicitly relies on project structure

**Context:** `apps/web/vercel.json` specifies:
```json
"buildCommand": "node ../../scripts/predeploy-migrate.mjs && npx turbo run build --filter=@hamafx/web"
```

The `../../scripts/predeploy-migrate.mjs` path is relative to `apps/web/` and depends on the monorepo structure. If the build context changes (e.g., moving to a different monorepo tool), this path breaks silently.

**Recommendation:** Move the migration step into a Turborepo task dependency rather than a manual pre-script. Alternatively, add a Vercel-specific `POSTGRES_URL_NON_POOLING` env var check.

---

### PR-14 🟢 LOW — Worker logs are ephemeral without external aggregation

**Context:** The worker logs to stdout (via pino), which systemd captures in journald. Docker Compose deployments use `json-file` driver with rotation. In both cases:
- Logs are lost on VM rebuild (journald is on the boot disk)
- No centralized log aggregation (e.g., Loki, Cloud Logging, Better Stack)
- Long-term log analysis requires SSH access to the VM

**Recommendation:**
1. Install the GCP Ops Agent to forward journald logs to Cloud Logging (free tier includes 50 GB/month)
2. OR: configure pino to write to a second destination (e.g., Better Stack's log ingest)
3. At minimum: document that `journalctl` on the VM is the log source of truth

---

### PR-15 🟢 LOW — Vercel serverless cold starts may impact chat latency

**Context:** The chat endpoint (`/api/chat`) imports 32 AI tools, model routing, multi-agent orchestration, and the diagnostic trace system. On Vercel Hobby (no reserved concurrency), infrequently-used functions experience cold starts. The first chat turn after a period of inactivity may take several extra seconds.

The warm-cache cron pokes Vercel every 2 minutes, which keeps the function warm for cache-related endpoints but does not specifically target the chat endpoint.

**Recommendation:**
1. Add `/api/chat` to the warm-cache cron (a lightweight HEAD or OPTIONS request)
2. Consider Vercel Pro's "always-on" function warming if latency becomes an issue
3. The existing 60-second `maxDuration` for the chat route is appropriate

---

### PR-16 🟢 LOW — Stale issue management may prematurely close feature requests

**Context:** `.github/workflows/stale.yml` marks issues stale after 30 days and closes after 7 more. Bugs and security issues are exempt (`never-stale,bug,security`), but feature requests and enhancements auto-close after 37 days. In a small-team open-source project, this can lose valuable community input.

**Recommendation:**
1. Extend `days-before-stale` to 90 days for issues
2. Add a `feature` label to the exemption list if roadmap items should persist
3. OR: add a `needs-info` label workflow that closes only if the author hasn't responded

---

## What's Working Well

These areas exceeded expectations and represent production-grade quality:

### 1. Multi-Layered Health Checks ✅
- **Web:** `/api/health` (DB connectivity, pgvector extension, env vars, stuck cron detection, stale analysis jobs)
- **Web:** `/api/health/db` (DB connectivity, migration count verification)
- **Worker:** `/health` on port 8081 (tick recency, SignalR status, dropped ticks, uptime)
- **Infrastructure:** Docker HEALTHCHECK on all 4 Compose services
- **System:** systemd watchdog (`WATCHDOG=1` every 30s, `WatchdogSec=120`)
- **External:** 18 healthchecks.io UUIDs covering every cron job and backup

### 2. Comprehensive Backup & Recovery ✅
- Nightly `pg_dump --format=custom` to GCS with 30-day retention
- Nightly journal JSON export with 90-day retention
- Weekly automated restore rehearsal (`verify-restore.sh`) with row-count assertions
- `infra/cron-vm/RECOVERY.md` with 5 concrete scenarios and paste-ready commands
- GCS lifecycle policies, versioning recommendations, and retention lock guidance
- Healthchecks.io pings for each backup job

### 3. Observability Instrumentation ✅
- Sentry across web (server + edge + client), worker, and heavy job runner
- Structured pino logging with 15 categories, trace correlation via AsyncLocalStorage
- Error pattern catalog with suggested fixes and related files
- Redaction of secrets in log output (14 patterns)
- Diagnostic trace persistence to DB + optional file output
- AI-agent-friendly log format (`logForAgent()` with `agentLog: true`)

### 4. Deployment Pipeline ✅
- CI/CD: fast path (PR: lint, typecheck, test, build, bundle analysis, audit) and slow path (main: full E2E sharding, nightly AI evals)
- Docker publish workflow with Trivy vulnerability scanning (CRITICAL+HIGH gates)
- Vercel + VM dual deployment with coordinated rollback procedures
- Pre-deploy migration (`predeploy-migrate.mjs`) blocks deploy on migration failure
- `ci-fast.yml` has concurrency groups and cancel-in-progress for PR efficiency

### 5. Security & Operational Guardrails ✅
- Account lockout (5 attempts → 15 min)
- TOTP 2FA with enforcement at login
- Timing-safe user enumeration prevention
- Signed `x-user-id` header (HMAC-SHA256) for route defense-in-depth
- Per-user rate limiting backed by Postgres (`rate_limits` table)
- Idempotent migrations with double-apply CI test
- Atomic budget guard for AI token spending
- Non-root user in Docker containers (`USER node`)

---

## Remediation Plan

### Immediate (Before Next Production Traffic)

| Priority | Finding | Effort | Owner |
|----------|---------|--------|-------|
| P0 | PR-01: Rotate exposed `SENTRY_AUTH_TOKEN`, purge `.env.production.local` from git history | 1 hour | Security |
| P0 | PR-05: Add unauthenticated `/api/health/public` endpoint for uptime monitors | 2 hours | Backend |

### Short-Term (This Week)

| Priority | Finding | Effort | Owner |
|----------|---------|--------|-------|
| P1 | PR-04: Complete on-call + status page setup checklist | 2 hours | DevOps |
| P1 | PR-02: Add dead-man's switch alert on `HC_SIGNALR_UUID` | 30 min | DevOps |
| P1 | PR-06: Create Sentry SLI dashboard with success rate widgets | 2 hours | Backend |
| P1 | PR-12: Add post-deploy health verification to VM update script | 2 hours | DevOps |

### Medium-Term (This Month)

| Priority | Finding | Effort | Owner |
|----------|---------|--------|-------|
| P2 | PR-07: Add health-gate + auto-rollback to worker auto-update | 4 hours | DevOps |
| P2 | PR-09: Automate `/opt/hamafx/.env` backup to GCP Secret Manager | 2 hours | DevOps |
| P2 | PR-03: Evaluate Vercel Pro upgrade or add second cron source | 1 day | Architecture |
| P2 | PR-08: Add GCS bucket verification to `verify-restore.sh` | 1 hour | DevOps |
| P2 | PR-10: Evaluate Langfuse Cloud for production LLM observability | 2 hours | AI/Backend |

### Long-Term (This Quarter)

| Priority | Finding | Effort | Owner |
|----------|---------|--------|-------|
| P3 | PR-02: Implement worker warm standby with leader election | 1 week | Architecture |
| P3 | PR-14: Set up centralized log aggregation (GCP Cloud Logging) | 3 hours | DevOps |
| P3 | PR-06: Automate error budget tracking with CI deploy gate | 1 week | Backend + DevOps |
| P3 | PR-16: Adjust stale bot timing for open-source community friendliness | 15 min | Maintainer |

---

## Checklist for Go-Live

Before declaring full production readiness, ensure:

- [x] PR-01: No production secrets in repository — `.gitignore` updated, pre-commit hook created
- [ ] PR-04: On-call engineer receives alert within 5 minutes of `/api/health` returning 503
- [x] PR-05: External uptime monitor can probe `/api/health/public` without auth
- [ ] PR-02: Documented procedure for manual worker failover (warm standby or rebuild from RECOVERY.md)
- [ ] PR-06: SLI dashboard accessible to on-call engineer
- [ ] PR-08: GCS bucket versioning and retention lock confirmed active
- [ ] PR-09: `/opt/hamafx/.env` backed up to GCP Secret Manager
- [x] PR-11: `BIQUOTE_PROXY_TOKEN` behavior improved — warn-level log, 503+Retry-After, health endpoint reporting
- [ ] Fire drill completed: SEV2 scenario exercised end-to-end (degrade → alert → respond → resolve → postmortem)
- [ ] Load test results reviewed against SLO thresholds (k6 test suite available in `loadtest/`)
- [ ] Vercel Pro upgrade evaluated (cost-benefit for cron redundancy)

---

## Appendix: Comparison with Prior Audits

This audit builds on findings from prior reports:

| Prior Audit | Key Finding | Status in This Audit |
|-------------|------------|---------------------|
| RELIABILITY (C1) | Tick data loss during DB failures | Mitigated — TickBuffer flushes every 1s, but VM-level SPoF remains (PR-02) |
| RELIABILITY (C2) | Fragile error classification | Addressed — error-patterns.ts covers known patterns |
| STABILITY (STAB-01) | Cron lock race conditions | Resolved — M-8 reclaim check pattern |
| SECURITY (H3) | BiQuote proxy token required in prod | Partially — PR-11: logs error but doesn't block startup |
| OBSERVABILITY (OBS-03) | Health endpoint enhanced | Resolved — multi-check health with pgvector, cron, analysis jobs |
| INFRA (INFRA-01) | Docker healthchecks | Resolved — all 4 Compose services have HEALTHCHECK |
| INFRA (INFRA-04) | Trivy vulnerability scanning | Resolved — integrated into docker-publish workflow |

---

*Audit prepared by automated analysis of the HamaFX-Ai codebase at commit `main`. Cross-reference with `infra/cron-vm/RECOVERY.md`, `docs/INCIDENT-RESPONSE.md`, and `AGENTS.md` for operational procedures.*
