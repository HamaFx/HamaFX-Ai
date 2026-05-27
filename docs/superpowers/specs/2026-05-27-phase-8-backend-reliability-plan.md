# Phase 8 — Implementation Plan

> Companion to `2026-05-27-phase-8-backend-reliability-design.md`.
> Each task is one PR. Tasks are ordered so the system stays shippable
> at every checkpoint. Reversible step-by-step.

## Conventions

- Each PR title uses Conventional Commits with the scopes from
  `00-project.md`: `infra | data | db | ai | web | shared | docs`.
- Each task lists: **branch**, **files**, **commands**, **acceptance**, **rollback**.
- "Acceptance" is the test the owner runs to declare the PR done. Most
  tasks include a manual smoke step in addition to automated tests.
- Schemas first (steering rule §2): zod in `packages/shared/src/schemas`
  before any new tool / DTO / DB field.

## PR-0 — VM upgrade (no code, infra only)

**Branch**: not applicable (gcloud only).

**Why first**: cheapest reversible change, frees up RAM headroom before
we ship anything on top of it.

**Commands** (run from a shell with `gcloud` configured for project
`hamafx-78845`):

```bash
gcloud compute instances stop hamafx-cron \
  --zone=us-central1-a --project=hamafx-78845

gcloud compute instances set-machine-type hamafx-cron \
  --machine-type=e2-medium \
  --zone=us-central1-a --project=hamafx-78845

gcloud compute instances start hamafx-cron \
  --zone=us-central1-a --project=hamafx-78845

# Wait ~30s for boot, then verify
gcloud compute ssh hamafx-cron --zone=us-central1-a --project=hamafx-78845 \
  --command="grep MemTotal /proc/meminfo && uptime"
```

**Files**: `infra/cron-vm/README.md` — change machine-type row from
`e2-small` to `e2-medium`, monthly cost row from `~$6.11` to `~$15-17`.

**Acceptance**:
- `MemTotal` reports ~4 GB.
- Existing crontab still firing (`tail /var/log/hamafx-cron.log`).
- Vercel logs show no missed cron windows during the swap.

**Rollback**: same three commands with `--machine-type=e2-small`.

**Estimated downtime**: ~45 seconds. Run during a low-volume hour.

---

## PR-1 — BiQuote schemas in @hamafx/shared

**Branch**: `feat/data-biquote-schemas`.
**Scope**: `shared`.

**Why**: schemas before code (steering rule §2). Other PRs depend on
these zod definitions.

**Files**:
- `packages/shared/src/schemas/biquote.ts` (new)
  - `BiquoteTickSchema` — `{ symbol, description?, bid, ask, last, volume, time, source: 'MT5' | 'MTX', type }`
  - `BiquoteOhlcBarSchema` — `{ openTime, open, high, low, close, volume, tickVolume, isOpen }`
  - `BiquoteSymbolSchema` — `{ name, description, type, exchange, source }`
- `packages/shared/src/schemas/live-tick.ts` (new) — internal DTO
  - `LiveTickSchema` — `{ symbol, bid, ask, mid, ts, source }`
- `packages/shared/src/index.ts` — re-export the new schemas.
- `packages/shared/test/biquote.test.ts` — happy-path + invalid-shape cases.

**Acceptance**:
- `pnpm --filter @hamafx/shared test --run` passes.
- `pnpm --filter @hamafx/shared typecheck` passes.

**Rollback**: revert PR. No runtime impact (nothing imports them yet).

---

## PR-2 — BiQuote REST adapter

**Branch**: `feat/data-biquote-rest`.
**Scope**: `data`.

**Why**: gives us a working primary before the worker exists. The
adapter is callable from Vercel today.

**Files**:
- `packages/data/src/providers/biquote/rest.ts` (new)
  - `getTick(symbol)` → `GET /api/{symbol}` → mapped to `Tick` DTO
  - `getLatest(symbols[])` → `GET /api/latest?symbols=...`
  - `getOhlc(symbol, tf, n)` → `GET /api/{symbol}/ohlc?tf=&limit=` → mapped to `Candle[]`
- `packages/data/src/providers/biquote/map.ts` (new) — symbol mapping
  (BiQuote uses our internal codes directly; `toProviderSymbol` is the
  identity function but lives here for parity with other providers).
- `packages/data/src/providers/biquote/filter.ts` (new) — symbol allow-list.
- `packages/data/src/providers/biquote/index.ts` — barrel.
- `packages/data/test/providers/biquote.test.ts` — MSW mocks for `/api/{symbol}`,
  `/api/latest`, `/api/{symbol}/ohlc`. Happy + 404 + 500 + malformed body.
- `apps/web/src/lib/env.ts` — register optional `BIQUOTE_BASE_URL`
  (default `https://biquote.io`). No API key.
- `.env.example` — add `# BIQUOTE_BASE_URL=https://biquote.io` (commented; default works).
- `docs/06-data-sources.md` — add BiQuote row to provider matrix.

**Acceptance**:
- Unit tests pass.
- Manual: `curl https://biquote.io/api/latest?symbols=XAUUSD,EURUSD,GBPUSD`
  returns sensible JSON; the adapter parses it.
- The adapter is **not yet wired into failover**.

**Rollback**: revert PR. No production impact.

---

## PR-3 — DB tables: live_ticks + candles_1m

**Branch**: `feat/db-live-ticks-candles-1m`.
**Scope**: `db`.

**Files**:
- `packages/db/src/schema/live-ticks.ts` (new) — Drizzle table.
- `packages/db/src/schema/candles-1m.ts` (new) — Drizzle table + index.
- `packages/db/src/schema/index.ts` — export both.
- `packages/db/migrations/0XXX_phase-8-live-data.sql` — generated.
- `docs/08-backend-and-api.md` — append schema reference.

**Commands**:

```bash
pnpm --filter db migrate:gen     # generate the migration from the schema
pnpm --filter db migrate:apply   # apply locally first
# Then run against production DATABASE_URL after PR merge
```

**Acceptance**:
- Migration applies cleanly on a fresh DB.
- `SELECT * FROM live_ticks` and `SELECT * FROM candles_1m` return empty.
- `pnpm --filter db typecheck` passes.

**Rollback**: forward-only migration; if needed, write a follow-up
`DROP TABLE` migration. The tables are unused at this point so it's safe.

---

## PR-4 — BiQuote wired as primary (additive, Twelve Data still present)

**Branch**: `feat/data-biquote-primary`.
**Scope**: `data`.

**Why**: production-validate BiQuote with the safety net of Twelve
Data still in the failover chain.

**Files**:
- `packages/data/src/failover.ts` — change order:
  ```ts
  const PRICE_PROVIDERS = ['biquote', 'twelve-data', 'finnhub', 'alpha-vantage'];
  const CANDLE_PROVIDERS = ['biquote', 'twelve-data', 'finnhub', 'alpha-vantage'];
  ```
- `packages/data/src/cache/throttle.ts` — register BiQuote cap: 10 req/min total.
- `packages/data/src/health.ts` — no change (provider-name-keyed; works).
- `packages/data/src/cache/ttl.ts` — confirm price/candle TTLs unchanged.
- `docs/06-data-sources.md` — note BiQuote as primary; matrix updated.

**Acceptance**:
- Visit `/chart/XAUUSD` on a preview deploy. Live price tile updates.
- Vercel logs show `provider=biquote` on most requests, with
  occasional fallthrough only on transient errors.
- Watch the chat-telemetry / provider-error counters for 24h. If error
  rate against BiQuote is >5% sustained, halt migration; inspect.

**Rollback**: change failover order back. One-line revert.

---

## PR-5 — apps/worker scaffold

**Branch**: `feat/worker-scaffold`.
**Scope**: `infra`.

**Why**: gets the deploy mechanism in place before any real worker
logic. After this PR, the VM has the codebase and a no-op systemd
unit. The next PR fills it with logic.

**Files**:
- `apps/worker/package.json` — `@hamafx/worker`, type:module, scripts: build / start / test.
- `apps/worker/tsconfig.json` — extends `@hamafx/config/tsconfig`.
- `apps/worker/eslint.config.js` — extends `@hamafx/config/eslint`.
- `apps/worker/src/index.ts` — minimal: load env, init logger, sleep
  forever (so systemd has something to babysit).
- `apps/worker/src/env.ts` — zod env validation.
- `apps/worker/src/log.ts` — structured logger.
- `apps/worker/src/healthchecks.ts` — `ping(uuid, status, body?)`.
- `apps/worker/test/index.test.ts` — smoke test.
- `pnpm-workspace.yaml` — already covers `apps/*`; verify.
- `turbo.json` — confirm worker tasks present.
- `docs/03-project-structure.md` — add `apps/worker/` row.
- `infra/cron-vm/setup-worker.sh` (new) — initial bootstrap script:
  installs Node 20.x, pnpm, clones the repo into `/opt/hamafx/app`,
  runs `pnpm install --frozen-lockfile && pnpm --filter @hamafx/worker build`,
  installs `hamafx-worker.service` (Type=notify), enables it. **Not yet
  triggered automatically — invoked once by the operator from a known-good
  commit.**
- `infra/cron-vm/units/hamafx-worker.service` (new) — systemd unit file
  template. `Type=notify`, `Restart=always`, `MemoryMax=1.5G`,
  `WatchdogSec=120`, `EnvironmentFile=/opt/hamafx/.env`.

**Commands** (one-time, on the VM):

```bash
gcloud compute scp infra/cron-vm/setup-worker.sh hamafx-cron:/tmp/setup-worker.sh \
  --zone=us-central1-a --project=hamafx-78845
gcloud compute ssh hamafx-cron --zone=us-central1-a --project=hamafx-78845 \
  --command="sudo bash /tmp/setup-worker.sh"
```

**Acceptance**:
- `systemctl status hamafx-worker` shows `active (running)`.
- `journalctl -u hamafx-worker -f` shows the structured startup log.
- Worker survives `systemctl kill -s SIGTERM hamafx-worker` (auto-restart).
- `pnpm --filter @hamafx/worker test --run` passes locally.

**Rollback**: `systemctl stop hamafx-worker && systemctl disable hamafx-worker`.
The crontab still drives everything; the VM behavior is unchanged.

---

## PR-6 — SignalR consumer + live_ticks writer

**Branch**: `feat/worker-signalr-consumer`.
**Scope**: `infra`.

**Files**:
- `apps/worker/src/signalr/consumer.ts` (new) — SignalR client; subscribe
  to all 3 symbols; emit ticks to handler.
- `apps/worker/src/signalr/reconnect.ts` — exponential backoff.
- `apps/worker/src/signalr/tick-buffer.ts` — coalesces to ≤1Hz per symbol.
- `apps/worker/src/persistence/live-ticks.ts` — UPSERT writer.
- `apps/worker/src/index.ts` — wire it together; emit healthcheck heartbeats.
- `apps/worker/test/signalr-consumer.test.ts` — mock `@microsoft/signalr`,
  assert subscribe + ticks dispatched + reconnect.
- `package.json` deps: add `@microsoft/signalr@^8` to `apps/worker/package.json`.
- `infra/cron-vm/.env.example` — add `BIQUOTE_HUB_URL`, `HC_SIGNALR_UUID`.

**Acceptance**:
- After deploying, `SELECT * FROM live_ticks` shows 3 rows updating
  continuously (most recent `ts` < 5s old).
- `journalctl -u hamafx-worker | grep tick` shows steady tick flow.
- Heartbeat ping received by healthchecks.io UI every 30s.
- Killing the worker stops updates within 10s; restart resumes within 5s.

**Rollback**: `systemctl stop hamafx-worker`. The Vercel app keeps using
BiQuote REST as primary (PR-4) — no user-visible change.

---

## PR-7 — 1m candle aggregator

**Branch**: `feat/worker-candle-aggregator`.
**Scope**: `infra`.

**Files**:
- `apps/worker/src/aggregator/candle-1m.ts` (new) — pure function: bar builder.
- `apps/worker/src/aggregator/flush.ts` (new) — INSERT … ON CONFLICT DO NOTHING.
- `apps/worker/src/index.ts` — feed ticks into aggregator; flush on `CandleClosed`.
- `apps/worker/test/candle-1m.test.ts` — properties:
  - `o = first tick mid`
  - `c = last tick mid`
  - `h ≥ all mids, l ≤ all mids`
  - bar boundary aligns to `Math.floor(t/60_000)`
  - `tick_volume = count of ticks`

**Acceptance**:
- After 5 minutes of running, `SELECT count(*) FROM candles_1m WHERE
  symbol='XAUUSD' AND t > now_ms - 300_000` returns ≥4 (allowing
  boundary timing).
- Spot-check one bar against BiQuote REST `/api/XAUUSD/ohlc?tf=M1` —
  OHLC values match within tick spread.

**Rollback**: revert the wiring in `index.ts`; keep the aggregator code
behind a feature flag.

---

## PR-8 — Read path: live_ticks + candles_1m as pseudo-providers

**Branch**: `feat/data-pseudo-providers`.
**Scope**: `data`, `web`.

**Files**:
- `packages/data/src/providers/live-ticks/index.ts` (new) — pseudo-provider:
  reads `live_ticks` row; "healthy" if `now - ts < 60_000`.
- `packages/data/src/providers/candles-1m/index.ts` (new) — pseudo-provider:
  reads `candles_1m`; "healthy" if newest bar within 90s.
- `packages/data/src/failover.ts` — final order:
  ```ts
  const PRICE_PROVIDERS = ['live-ticks', 'biquote', 'twelve-data', 'finnhub', 'alpha-vantage'];
  const CANDLE_PROVIDERS_1M = ['candles-1m', 'biquote', 'twelve-data', 'finnhub', 'alpha-vantage'];
  const CANDLE_PROVIDERS_OTHER = ['biquote', 'twelve-data', 'finnhub', 'alpha-vantage'];
  ```
- `apps/web/src/app/api/market/price/route.ts` — uses new failover.
- `apps/web/src/app/api/market/candles/route.ts` — splits 1m vs higher TFs.
- `docs/06-data-sources.md` — note the read path.

**Acceptance**:
- Mobile chart: tick freshness visibly improves (sub-second updates).
- `/api/market/price?symbols=XAUUSD` response time p50 < 200ms (read
  hits Postgres, not BiQuote).
- Stop the worker; observe Vercel logs falling through to `provider=biquote`.
  User-visible: chart still updates at REST cadence.

**Rollback**: change failover order to skip pseudo-providers.

---

## PR-9 through PR-14 — Heavy job migrations (one PR each)

Same shape, repeated for each job. Order matters:

1. **PR-9** — `embedding-backfill` (most likely to hit Vercel's 60s cap; biggest win).
2. **PR-10** — `briefings`.
3. **PR-11** — `snapshots` (also adds `prune-candles-1m` step).
4. **PR-12** — `cot`.
5. **PR-13** — `fred-actuals`.
6. **PR-14** — `weekly-review`.

Per-PR file template:

- `apps/worker/src/jobs/<name>.ts` (new) — `run({ env, log, hc, signal })`.
- `apps/worker/src/runner/cli.ts` — registry includes the job.
- `infra/cron-vm/units/hamafx-job-<name>.service` (new) — Type=oneshot.
- `infra/cron-vm/units/hamafx-job-<name>.timer` (new) — `OnCalendar=...`,
  `RandomizedDelaySec=60`.
- `apps/web/src/app/api/cron/<name>/route.ts` — keep, document as "manual fallback only."
- `vercel.json` — remove this job from `"crons"` block (kept as route, not scheduled).
- `infra/cron-vm/crontab` — remove the `curl` line for this endpoint.
- `apps/worker/test/jobs/<name>.test.ts` — happy + idempotent re-run.
- Add `HC_JOB_<NAME>_UUID` env var.

**Per-PR acceptance**:
- New systemd timer fires on schedule (`systemctl list-timers`).
- Healthcheck pings observed at expected cadence.
- Re-running the same timer doesn't double-write to the DB.
- Triggering `curl https://hama-fx-ai.vercel.app/api/cron/<name> -H 'Authorization: Bearer $CRON_SECRET'`
  still works (fallback path verified).

**Rollback per PR**: re-enable the matching crontab line on the VM and
re-add the entry to `vercel.json`. The Vercel route was never deleted.

---

## PR-15 — systemd timer roll-out + crontab retirement

**Branch**: `feat/infra-systemd-timers`.
**Scope**: `infra`.

**Why**: by this point all heavy jobs have systemd units (PR-9..14). The
light jobs (alerts, news, calendar, warm-cache) still need to be
poked by *something*. We move them to systemd timers too — same
behavior, better logging, jitter, retry semantics.

**Files**:
- `infra/cron-vm/units/hamafx-light-{news,calendar,alerts,warm-cache}.service` (new) — Type=oneshot.
  ```ini
  [Service]
  Type=oneshot
  ExecStart=/usr/bin/curl -fsS -m 30 \
    -H "Authorization: Bearer ${CRON_SECRET}" \
    "https://hama-fx-ai.vercel.app/api/cron/news"
  ExecStartPost=/usr/bin/curl -fsS -m 5 "https://hc-ping.com/${HC_LIGHT_NEWS_UUID}"
  ```
- `infra/cron-vm/units/hamafx-light-*.timer` (new).
- `infra/cron-vm/setup.sh` — orchestrate: stop crontab, install all units.
- Old `infra/cron-vm/crontab` is **deleted** (kept in git history).

**Acceptance**:
- `systemctl list-timers --all` shows every job.
- `systemctl status cron` is inactive (not failed — just stopped).
- All healthcheck UUIDs report green.
- 24h soak: no missed runs in `journalctl -u 'hamafx-*' --since=yesterday`.

**Rollback**: re-enable crontab; `systemctl disable --now 'hamafx-*.timer'`.

---

## PR-16 — Self-update (`update.sh`)

**Branch**: `feat/infra-self-update`.
**Scope**: `infra`.

**Why**: ships last because it changes the deploy mechanism — once
this is on, every merge to main propagates within 5 min.

**Files**:
- `infra/cron-vm/update.sh` (new) — content from spec §4.6.
- `infra/cron-vm/units/hamafx-update.service` + `.timer` (new) —
  `OnUnitActiveSec=5min`, `RandomizedDelaySec=30`.
- `infra/cron-vm/setup.sh` — install update.sh + timer.

**Acceptance**:
- Push a no-op commit to main; observe in `/opt/hamafx/.deployed-sha`
  that the SHA updates within 5 min.
- Push a deliberately-broken commit (failing test); observe the worker
  *does not* restart and `.deployed-sha` is unchanged. Healthcheck
  shows a `fail` ping.
- Fix the commit; observe the worker recovers on the next 5-min tick.

**Rollback**: `systemctl disable --now hamafx-update.timer`. Worker
freezes at last-applied SHA; manual updates required.

---

## PR-17 — Backups + verification restore

**Branch**: `feat/infra-backups`.
**Scope**: `infra`.

**Files**:
- `infra/cron-vm/scripts/backup-db.sh` (new) — `pg_dump --format=custom |
  gzip | gsutil cp - gs://...`
- `infra/cron-vm/scripts/backup-journal.sh` (new) — `psql -c 'SELECT
  json_agg(*) FROM journal_entries' | gsutil cp - gs://...`
- `infra/cron-vm/scripts/verify-restore.sh` (new) — restore latest dump
  into local Postgres on the VM; assert non-zero rows in critical tables;
  drop the local DB.
- `infra/cron-vm/units/hamafx-backup-{db,journal}.service` + `.timer`.
- `infra/cron-vm/units/hamafx-verify-restore.service` + `.timer`.
- `infra/cron-vm/RECOVERY.md` (new) — full recovery playbook.
- GCS setup commands documented in `infra/cron-vm/README.md`:
  ```bash
  gcloud storage buckets create gs://hamafx-backups-hamafx-78845 \
    --project=hamafx-78845 \
    --location=us-central1 \
    --uniform-bucket-level-access

  # Lifecycle policy
  cat > /tmp/lifecycle.yaml <<EOF
  lifecycle:
    rule:
      - action: { type: Delete }
        condition: { age: 30, matchesPrefix: ['db/'] }
      - action: { type: Delete }
        condition: { age: 90, matchesPrefix: ['journal/'] }
  EOF
  gcloud storage buckets update gs://hamafx-backups-hamafx-78845 \
    --lifecycle-file=/tmp/lifecycle.yaml

  # Grant the VM service account write access to this bucket only
  gcloud storage buckets add-iam-policy-binding gs://hamafx-backups-hamafx-78845 \
    --member=serviceAccount:$(gcloud compute instances describe hamafx-cron \
        --zone=us-central1-a --project=hamafx-78845 \
        --format='get(serviceAccounts[0].email)') \
    --role=roles/storage.objectAdmin
  ```

**Acceptance**:
- After 24h: bucket has at least one `db/YYYY-MM-DD.dump.gz` and one
  `journal/YYYY-MM-DD.json`.
- After 7 days: `verify/last-success.txt` exists and is recent.
- Manually restore the latest dump on a scratch DB and confirm row counts
  match production. Document the exact commands in RECOVERY.md.

**Rollback**: disable timers; bucket can stay (no cost impact).

---

## PR-18 — Sentry wiring

**Branch**: `feat/observability-sentry`.
**Scope**: `web`, `infra`, `shared`.

**Files**:
- `apps/web/src/instrumentation.ts` — `@sentry/nextjs` server-only init.
  ```ts
  // No client config — bundle stays clean.
  export async function register() {
    if (process.env.NEXT_RUNTIME === 'nodejs') {
      const Sentry = await import('@sentry/nextjs');
      Sentry.init({
        dsn: process.env.SENTRY_DSN,
        tracesSampleRate: 0,
        tags: { service: 'web', commit_sha: process.env.VERCEL_GIT_COMMIT_SHA },
      });
    }
  }
  ```
- `apps/web/next.config.mjs` — wrap with `withSentryConfig` only if
  `SENTRY_DSN` is set; gate to keep local dev clean.
- `apps/worker/src/sentry.ts` — `@sentry/node` init; called from `index.ts`
  before anything else; tags include `service: 'worker'` + commit SHA from
  `/opt/hamafx/.deployed-sha`.
- `apps/worker/src/index.ts` — wrap top-level `main()` in
  `Sentry.captureException` on unhandled rejections.
- `packages/shared/src/request-id.ts` (new) — utility that reads/sets
  `X-Request-Id`; hooks into Sentry as a tag.
- `apps/web/src/middleware.ts` — already mints request id; ensure it's
  set on the Sentry scope.
- `.env.example` — add `SENTRY_DSN`.
- `docs/12-security-and-config.md` — note the new env.

**Acceptance**:
- Deliberate `throw new Error('phase-8 sentry smoke')` in a feature-flagged
  route shows up in Sentry within 60s, tagged `service=web`,
  `request_id=...`, `commit_sha=...`.
- Same test in the worker shows `service=worker`.

**Rollback**: unset `SENTRY_DSN`. Code paths remain but become no-ops.

---

## PR-19 — Drop Twelve Data

**Branch**: `chore/data-drop-twelve-data`.
**Scope**: `data`, `web`, `docs`.

**Why**: BiQuote has been running as primary since PR-4 and as the
fallback chain anchor since PR-8. After 1–2 weeks of clean runtime,
Twelve Data is dead weight.

**Pre-flight**: confirm in chat-telemetry that Twelve Data has not been
selected as the active provider for ≥7 days. If it has been selected,
investigate why before dropping.

**Files**:
- `packages/data/src/providers/twelve-data/` — **delete entire directory**.
- `packages/data/src/failover.ts` — remove `'twelve-data'` from arrays.
- `packages/data/src/cache/throttle.ts` — remove the Twelve Data cap row.
- `apps/web/src/lib/env.ts` — remove `TWELVEDATA_API_KEY`.
- `.env.example` — remove the env line.
- Vercel project envs — remove `TWELVEDATA_API_KEY` (manual, document).
- `docs/06-data-sources.md` — strike Twelve Data from matrix; note
  removal date.
- `docs/02-tech-stack.md` — update the data-providers row.
- `docs/09-deployment.md` — env section.
- `README.md` — provider line.
- `packages/data/test/` — remove Twelve Data tests; update failover tests.

**Acceptance**:
- `pnpm turbo run typecheck test lint` passes.
- Production traffic for 24h shows no errors and no provider gaps.
- Provider matrix in docs reflects new reality.

**Rollback**: revert PR. The directory was deleted, but `git revert`
restores everything.

---

## PR-20 — Docs sweep + Phase 8 marked done

**Branch**: `docs/phase-8-done`.
**Scope**: `docs`.

**Files**:
- `docs/01-architecture.md` — replace topology diagram with the v2 from
  the design doc.
- `docs/06-data-sources.md` — final provider matrix, BiQuote primary.
- `docs/08-backend-and-api.md` — `live_ticks`, `candles_1m`, the worker
  job catalogue, healthcheck UUIDs.
- `docs/09-deployment.md` — VM section expanded, GCS bucket, Sentry,
  healthchecks. Cost table updated.
- `docs/10-roadmap.md` — add Phase 8 with all checkboxes ticked.
- `docs/11-conventions.md` — no change expected; verify worker-specific
  conventions inherited from `apps/web` patterns.
- `docs/12-security-and-config.md` — new env vars listed.
- `docs/14-ai-agent-handoff.md` — recipe G ("Add a new cron job")
  rewritten to mention the worker as the default location for heavy
  jobs; light Vercel routes still allowed for trivial pokers.
- `docs/04-features.md` — add row "Live tick stream via BiQuote SignalR".
- `infra/cron-vm/README.md` — final state.
- `infra/cron-vm/RECOVERY.md` — finalize.
- `.kiro/steering/00-project.md` — update file-placement quick map row
  for cron jobs ("heavy → `apps/worker/src/jobs/<name>.ts`, light → `apps/web/src/app/api/cron/<name>/route.ts`").

**Acceptance**:
- Every doc that was changed is internally consistent.
- A fresh reader can follow `README.md → 14-ai-agent-handoff.md` and
  understand the new worker model.
- Phase 8 in `10-roadmap.md` lists all 20 PRs with acceptance.

**Rollback**: docs only; revertable.

---

## Sequencing summary

```
PR-0   VM upgrade (gcloud only)         ~45s downtime
PR-1   shared schemas
PR-2   biquote REST adapter
PR-3   live_ticks + candles_1m migration
PR-4   biquote wired primary (twelve-data fallback)
PR-5   worker scaffold (no-op systemd unit)
PR-6   signalr consumer + live_ticks writer
PR-7   1m candle aggregator
PR-8   pseudo-providers + read path
PR-9   embedding-backfill → worker
PR-10  briefings → worker
PR-11  snapshots → worker (incl. candles_1m prune)
PR-12  cot → worker
PR-13  fred-actuals → worker
PR-14  weekly-review → worker
PR-15  systemd timers replace crontab
PR-16  self-update (update.sh)
PR-17  backups + verification restore
PR-18  Sentry wiring
PR-19  drop Twelve Data
PR-20  docs sweep + roadmap tick
```

Total: **20 PRs**. Each is independently shippable and reversible. The
system is fully functional after every checkpoint.

## Estimated calendar

- PRs 1–4: ~1 week (provider plumbing, low-risk)
- PRs 5–8: ~1 week (worker stand-up, sub-second freshness lands)
- PRs 9–14: ~2 weeks (job migrations, one PR every ~2 days)
- PRs 15–20: ~1 week (timers, self-update, backups, sentry, cleanup)

**~5 weeks calendar time** at a comfortable pace; compressible if needed.

## Definition of done

- All 20 PRs merged.
- 7-day soak with zero missed cron windows (healthcheck UUIDs all green).
- One successful disaster-recovery dry run from `RECOVERY.md`.
- Twelve Data API key revoked.
- `docs/10-roadmap.md` Phase 8 fully checked.
