# Implementation Plan: Worker & Infrastructure Changes

## 1. Current State
Currently, the HamaFX-Ai worker operates under single-user assumptions:
- **Worker Environment:** An always-on Node.js daemon running directly on a GCE VM (e2-medium).
- **Market Data:** Hardcoded SignalR consumer for BiQuote live ticks (3 symbols: XAUUSD, EURUSD, GBPUSD).
- **MT5 TCP Bridge:** Optional, but if enabled it takes priority over BiQuote.
- **Data Pipelines:** TickBuffer pushing to `live_ticks` at 1Hz, and `Candle1mAggregator` producing `candles_1m`.
- **Background Jobs:** 7 heavy systemd jobs (briefings, snapshots, cot, fred, weekly-review, embedding-backfill, resonance-sync) and 5 light HTTP pokers (curl `/api/cron/*`).
- **Monitoring:** Healthchecks.io + Sentry.
- **Deployment:** Docker Compose is currently only used for web and db (no worker).
- **Alerting:** A single global `TELEGRAM_CHAT_ID` with global evaluation.

## 2. Dynamic Symbol Subscription
The worker needs to shift from hardcoded symbols to a dynamic set driven by what all users are watching across the instance.

- **Periodic Polling:** The worker must query the `user_symbols` (or global unique symbol list derived from user watchlists) on startup and periodically (e.g., every 5 minutes).
- **Dynamic SignalR:** Update the SignalR client to dynamically `subscribe` and `unsubscribe` from channels based on the current aggregate symbol set.
- **Data Handlers:** Ensure `TickBuffer` and `Candle1mAggregator` can handle an arbitrary number of symbols.
- **Storage:** The `live_ticks` table will grow beyond the static 3 rows.
- **Provider Validation:** Data providers (e.g., BiQuote) may require validation or error handling if an invalid or unsupported symbol is requested.

## 3. Per-User Alert Evaluation
Alert evaluation must move from a global perspective to a scoped, per-user approach.

- **Group by User:** Update the `evaluateAlerts()` routine to group active alerts by `user_id`.
- **Watchlist Scoping:** Each user's alerts are evaluated exclusively against their own watched symbols.
- **Delivery Config:** Alerts must be delivered using the specific user's notification settings retrieved from `user_settings`:
  - User's `telegram_bot_token` and `telegram_chat_id`
  - User's `alert_email`
  - User's Push subscriptions
- **Rate Limiting:** Implement per-user rate limiting for alert delivery to prevent notification spam.

## 4. Per-User Briefings
Briefings must be tailored to individual users based on their active watchlists and AI configuration.

- **User Iteration:** The briefing generator will fetch all users who have an active watchlist.
- **Personalized Scope:** Each generated briefing only includes context for the symbols that user cares about.
- **BYOK Integration:** Briefing generation must use the user's specific API keys (e.g., OpenAI, Anthropic). Users without configured AI keys will be skipped for AI-powered briefings.
- **Storage Update:** The `briefings_emitted` (or equivalent) table must record the `user_id` to link briefings to the correct user.

## 5. Docker Compose V2 (Full Stack)
The deployment model will standardize around Docker Compose V2, adding the worker to the stack.

- **Unified Stack:** Add a `worker` service alongside `web` and `db`.
- **Shared Environment:** The worker will run from the same codebase (different entrypoint), using the shared Postgres database and shared environment variables.
- **Health Checks:** Implement Docker health checks for `web`, `worker`, and `db`.
- **PGlite Support:** Use volumes for PGlite data for easy local development.

```yaml
# docker-compose.yml example snippet
services:
  db:
    image: pgvector/pgvector:pg16
    restart: always
    volumes:
      - db_data:/var/lib/postgresql/data
    environment:
      POSTGRES_DB: hamafx
      POSTGRES_USER: hamafx
      POSTGRES_PASSWORD: password

  web:
    build: .
    restart: always
    depends_on:
      - db
    ports:
      - "3000:3000"
    environment:
      - DATABASE_URL=postgres://hamafx:password@db:5432/hamafx

  worker:
    build: .
    command: node apps/worker/dist/index.js
    restart: always
    depends_on:
      - db
    environment:
      - DATABASE_URL=postgres://hamafx:password@db:5432/hamafx
      - WORKER_MODE=docker

volumes:
  db_data:
```

## 6. Self-Hosting Documentation
As an open-source project, clear self-hosting instructions are critical.

- **Quick Start Guide:** Step-by-step instructions for getting the full stack running.
- **Requirements:** Minimum system requirements (e.g., 2GB RAM, 1 vCPU).
- **Environment Reference:** Comprehensive guide to all required and optional environment variables.
- **Reverse Proxy:** Configuration examples for Nginx, Caddy, and Traefik.
- **Security:** SSL/TLS setup guide.
- **Maintenance:** Strategies for backing up the database and upgrading the instance when new versions are released.

## 7. MT5 Bridge (Optional)
The MT5 TCP bridge will remain, but correctly positioned for a multi-user instance.

- **Disabled by Default:** Governed by `MT5_ENABLED=false`.
- **Global Market Data:** When enabled, the MT5 instance provides shared market data globally for the entire self-hosted instance (not per-user MT5 connections).
- **Documentation:** Provide clear setup instructions for users who want to connect their self-hosted instance to an MT5 terminal.

## 8. Node-Cron for Docker Mode
To remove the dependency on Linux `systemd` timers for background jobs in Docker environments:

- **Deployment Detection:** The worker detects its environment (e.g., via `WORKER_MODE=docker`).
- **In-Process Scheduling:** Use a library like `node-cron` to schedule the 7 heavy jobs and 5 light HTTP pokers directly within the Node.js worker process.
- **Code Reusability:** The underlying job execution functions remain identical regardless of whether they are triggered by `systemd` or `node-cron`.

## 9. Monitoring Updates
Instance-level monitoring will be updated to reflect the new architecture.

- **Healthchecks.io:** Configured per-instance to monitor global job execution (not per-user).
- **Sentry:** Error tracking remains per-instance.
- **Metrics:** Add health metrics such as total user count, active user count, and aggregate active symbol count to help instance administrators monitor performance.

## 10. Files to Create/Modify

### To Create
- `docker-compose.yml`: (Update to full stack).
- `docs/self-hosting.md`: Comprehensive self-hosting and deployment guide.
- `apps/worker/src/scheduler.ts`: Node-cron implementation for scheduling jobs.
- `apps/worker/src/symbolManager.ts`: Logic for polling active symbols across users.

### To Modify
- `apps/worker/src/index.ts`: Update entrypoint to initialize node-cron (if in docker mode) and the new dynamic symbol manager.
- `apps/worker/src/biquote/signalr.ts`: Update to support dynamic subscribe/unsubscribe for symbols.
- `apps/worker/src/alerts/evaluator.ts`: Update `evaluateAlerts()` to loop over users and use user-specific watchlists.
- `apps/worker/src/alerts/notifier.ts`: Update to use per-user notification configs (Telegram tokens, email, push).
- `apps/worker/src/jobs/briefings.ts`: Refactor to iterate over active users, fetching their specific API keys and watchlists.
- `packages/db/schema.ts` (or relevant tables): Ensure tables like `briefings_emitted` include `user_id`.

## 11. Effort Estimate & Dependencies

| Task | Estimated Effort | Dependencies |
| :--- | :--- | :--- |
| Dynamic Symbol Subscription | 1 day | Auth & DB changes (user_symbols) |
| Per-User Alert Evaluation | 1.5 days | DB user_settings (notification configs) |
| Per-User Briefings | 1.5 days | DB user_keys (BYOK), Auth |
| Docker Compose V2 Setup | 0.5 days | None |
| Node-Cron Scheduling | 0.5 days | Docker Compose setup |
| MT5 Bridge Documentation & Tweaks | 0.5 days | None |
| Self-Hosting Documentation | 1 day | Docker setup finalized |
| Monitoring Updates | 0.5 days | None |
| **Total Estimated Effort** | **~7 days** | Requires Auth, Database Schema updates |

**Dependencies on other plan documents:**
- **01-auth-and-db.md:** Relies heavily on the new DB schema (`user_settings`, `user_symbols`, `user_keys`).
- **04-ai-and-byok.md:** Relies on how AI API keys are fetched and passed to the LLM functions during briefing generation.
