# Langfuse Integration — Full Implementation Plan

> **For Hermes:** Implement this plan task-by-task. Each task is 2-5 minutes.

**Goal:** Add Langfuse (open-source LLM observability + eval + prompt management)
to HamaFX-Ai. Self-hosted via docker compose, integrated with the Vercel AI SDK
v5 via OpenTelemetry. Covers both tracing (VI) and evaluation (VII) in one platform.

**Architecture:** Add a `langfuse-server` docker compose service alongside the
existing Postgres. Add `@langfuse/otel` + OpenTelemetry SDK to `packages/ai`.
Boot OTel in `apps/web/src/instrumentation.ts` (Node runtime only) and
`apps/worker/src/index.ts`. AI SDK's native OTel scope (`ai`) is auto-captured.
Langfuse also gives us prompt versioning, LLM-as-Judge evals, datasets, and
experiments — all through the same dashboard at :3001.

**Tech Stack:** Langfuse (self-hosted, Docker), @langfuse/otel, @opentelemetry/sdk-node,
Vercel AI SDK v5 (native OTel), Postgres (existing)

**Cost:** $0. Runs on the existing GCE e2-medium VM alongside Postgres + worker.
Adds ~200MB RAM for the Langfuse server process.

---

## Prerequisites

Before starting, verify:

```bash
# Check current infra
cd /home/ubuntu/HamaFX-Ai
docker compose version  # must be available (Docker mode)
cat .env.example | grep -c LANGFUSE  # expect 0 (not yet configured)
ls docker-compose.yml 2>/dev/null    # file does NOT exist yet
cat packages/ai/package.json | grep -c opentelemetry  # expect 0
```

---

### Task 1: Create docker-compose.yml

**Objective:** Add docker compose with Postgres + pgvector + Langfuse server.

**Files:**
- Create: `docker-compose.yml`
- Create: `docker-compose.override.yml` (for local dev overrides)

**Step 1: Create docker-compose.yml**

```yaml
# HamaFX-Ai — Docker Compose stack
# Postgres 16 + pgvector (database) + Langfuse (LLM observability)
#
# Start:  docker compose up -d
# Stop:   docker compose down
# Status: docker compose ps
#
# Langfuse UI: http://localhost:3001
# Next.js:     http://localhost:3000

services:
  # ── Database ──────────────────────────────────────────
  postgres:
    image: pgvector/pgvector:pg16
    container_name: hamafx-postgres
    restart: unless-stopped
    ports:
      - "5432:5432"
    environment:
      POSTGRES_USER: hamafx
      POSTGRES_PASSWORD: hamafx
      POSTGRES_DB: hamafx
    volumes:
      - postgres_data:/var/lib/postgresql/data
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U hamafx -d hamafx"]
      interval: 10s
      timeout: 5s
      retries: 5

  # ── LLM Observability ────────────────────────────────
  langfuse:
    image: langfuse/langfuse:3
    container_name: hamafx-langfuse
    restart: unless-stopped
    ports:
      - "3001:3000"
    environment:
      # Postgres — reuses the same database server, separate database
      DATABASE_URL: postgresql://hamafx:hamafx@postgres:5432/langfuse
      # Auth secrets — generate fresh for each deployment
      NEXTAUTH_URL: http://localhost:3001
      NEXTAUTH_SECRET: ${LANGFUSE_NEXTAUTH_SECRET:-change-me-langfuse-nextauth-at-least-32-chars}
      SALT: ${LANGFUSE_SALT:-change-me-langfuse-salt-at-least-16-chars}
      # Telemetry (opt-out of Langfuse's own anonymous usage stats)
      TELEMETRY_ENABLED: "false"
      # Enable experimental features: LLM-as-Judge evals, datasets
      LANGFUSE_ENABLE_EXPERIMENTAL_FEATURES: "true"
    depends_on:
      postgres:
        condition: service_healthy
    healthcheck:
      test: ["CMD-SHELL", "curl -f http://localhost:3000/api/public/health || exit 1"]
      interval: 15s
      timeout: 5s
      retries: 5

volumes:
  postgres_data:
    driver: local
```

**Step 2: Create docker-compose.override.yml for local secrets**

```yaml
# docker-compose.override.yml — gitignored, local overrides.
# Copy this to set real secrets without touching docker-compose.yml.
#
# Generate secrets:
#   node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"

services:
  langfuse:
    environment:
      NEXTAUTH_SECRET: replace-with-32-byte-hex
      SALT: replace-with-16-byte-hex
```

**Step 3: Create the Langfuse database on first boot**

The Langfuse server auto-runs migrations on its own database. But the database
must exist. Add an init script:

Create `docker/postgres/init-langfuse-db.sh`:

```bash
#!/bin/bash
# Auto-create the langfuse database if it doesn't exist.
# Called by the postgres container's /docker-entrypoint-initdb.d/
set -e
psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" <<-EOSQL
  SELECT 'CREATE DATABASE langfuse'
  WHERE NOT EXISTS (SELECT FROM pg_database WHERE datname = 'langfuse')\gexec
EOSQL
```

Update docker-compose.yml postgres service to mount this:

```yaml
    volumes:
      - postgres_data:/var/lib/postgresql/data
      - ./docker/postgres/init-langfuse-db.sh:/docker-entrypoint-initdb.d/init-langfuse-db.sh
```

**Verification:**
```bash
docker compose up -d
docker compose ps  # all 2 services healthy
curl -s http://localhost:3001/api/public/health  # {"status":"ok"}
```

---

### Task 2: Add LANGfUSE env vars to project configuration

**Objective:** Add Langfuse env vars to .env.example and shared/src/env.ts.

**Files:**
- Modify: `.env.example` (append Langfuse section)
- Modify: `packages/shared/src/env.ts` (add Langfuse schema)

**Step 1: Append to .env.example**

After the Sentry section, add:

```
# --------------------------------------------------------------------------
# Langfuse — LLM Observability (self-hosted, OpenTelemetry)
#
# Self-hosted at http://localhost:3001 (docker compose up).
# Create API keys in Langfuse UI → Settings → API Keys after first boot.
#
#   LANGFUSE_PUBLIC_KEY  pk-lf-... (public key, safe in client)
#   LANGFUSE_SECRET_KEY  sk-lf-... (secret key, server-only)
#   LANGFUSE_BASE_URL    http://localhost:3001 (self-hosted)
#                        or https://cloud.langfuse.com (cloud free tier)
#
# When any of these is unset, Langfuse tracing is silently disabled
# (no crash, no log spam — the OTel SDK just doesn't export).
# --------------------------------------------------------------------------
LANGFUSE_PUBLIC_KEY=
LANGFUSE_SECRET_KEY=
LANGFUSE_BASE_URL=http://localhost:3001
```

**Step 2: Modify packages/shared/src/env.ts**

In the `RuntimeEnv` schema (around line 183, after `SENTRY_DSN`), add:

```typescript
  /** Langfuse LLM observability. Optional — omitted = tracing disabled. */
  LANGFUSE_PUBLIC_KEY: z.string().optional(),
  LANGFUSE_SECRET_KEY: z.string().optional(),
  LANGFUSE_BASE_URL: z.string().url().optional(),
```

This makes Langfuse fully optional — no env vars = no tracing, no crash.

**Verification:**
```bash
grep -A6 "Langfuse" .env.example    # shows the new section
grep "LANGFUSE" packages/shared/src/env.ts  # shows 3 new fields
pnpm typecheck  # must pass (no type errors from env.ts changes)
```

---

### Task 3: Install Langfuse + OpenTelemetry dependencies

**Objective:** Add the required npm packages to @hamafx/ai.

**Files:**
- Modify: `packages/ai/package.json`

**Step 1: Install packages**

```bash
cd /home/ubuntu/HamaFX-Ai
pnpm --filter @hamafx/ai add \
  @langfuse/otel \
  @opentelemetry/sdk-node \
  @opentelemetry/api
```

Expected: 3 packages added to packages/ai/package.json dependencies.

**Verification:**
```bash
cat packages/ai/package.json | grep -E "langfuse|opentelemetry"
# Should show: @langfuse/otel, @opentelemetry/sdk-node, @opentelemetry/api
pnpm install  # must succeed
```

---

### Task 4: Create OpenTelemetry + Langfuse instrumentation module

**Objective:** Create the OTel bootstrap file that wires Langfuse into the AI SDK.

**Files:**
- Create: `packages/ai/src/instrumentation.ts`

**Step 1: Write instrumentation.ts**

```typescript
// Langfuse + OpenTelemetry instrumentation for the Vercel AI SDK.
//
// The AI SDK (v5) emits OpenTelemetry spans under the instrumentation
// scope 'ai'. streamText, generateText, and tool calls are all
// auto-traced. We configure the OTel NodeSDK with a Langfuse span
// processor that exports traces to our self-hosted Langfuse instance.
//
// Import ONCE at process start (apps/web/instrumentation.ts for
// the web app, apps/worker/src/index.ts for the worker).
// Silently disabled when LANGFUSE_* env vars are unset.
//
// Coexists with Sentry: Sentry uses its own SDK (not OTel), so there's
// no span-processor conflict. Both can run in the same process.

import { NodeSDK } from '@opentelemetry/sdk-node';
import { LangfuseSpanProcessor } from '@langfuse/otel';

let _sdk: NodeSDK | null = null;
let _started = false;

/**
 * Initialise OpenTelemetry with Langfuse export. Idempotent — safe to
 * call from both web instrumentation.ts and worker index.ts (the SDK
 * guards against double-start internally, but we track our own flag
 * to skip the env-check work).
 */
export function initLangfuse(): void {
  if (_started) return;
  _started = true;

  const publicKey = process.env.LANGFUSE_PUBLIC_KEY;
  const secretKey = process.env.LANGFUSE_SECRET_KEY;
  const baseUrl = process.env.LANGFUSE_BASE_URL;

  // Silently skip when not configured — no crash, no env validation.
  if (!publicKey || !secretKey || !baseUrl) {
    if (process.env.NODE_ENV === 'development') {
      console.log(
        '[langfuse] skipping — LANGFUSE_PUBLIC_KEY, LANGFUSE_SECRET_KEY, or LANGFUSE_BASE_URL not set',
      );
    }
    return;
  }

  _sdk = new NodeSDK({
    spanProcessors: [
      new LangfuseSpanProcessor({
        publicKey,
        secretKey,
        baseUrl,
        // Flush spans every 5s in production, immediately in dev.
        flushInterval: process.env.NODE_ENV === 'production' ? 5000 : 1000,
        // Don't block process shutdown waiting for export.
        flushAtShutdown: true,
      }),
    ],
  });

  _sdk.start();
  console.log('[langfuse] OpenTelemetry tracing enabled → %s', baseUrl);
}

/**
 * Graceful shutdown — flush pending spans before the process exits.
 * Call from the web app's onRequestError hook or the worker's
 * shutdown handler. Best-effort; swallows errors so a Langfuse
 * outage never takes down the main process.
 */
export async function shutdownLangfuse(): Promise<void> {
  if (!_sdk) return;
  try {
    await _sdk.shutdown();
    console.log('[langfuse] tracing shut down cleanly');
  } catch (err) {
    console.warn('[langfuse] shutdown failed (non-fatal)', err);
  }
}
```

**Step 2: Export from the package barrel**

Modify `packages/ai/src/index.ts` — add at the bottom:

```typescript
// Langfuse / OpenTelemetry instrumentation
export { initLangfuse, shutdownLangfuse } from './instrumentation';
```

**Verification:**
```bash
cat packages/ai/src/instrumentation.ts | head -5  # file exists
grep "initLangfuse" packages/ai/src/index.ts      # exported from barrel
pnpm typecheck                                     # must pass
```

---

### Task 5: Wire Langfuse into the web app boot sequence

**Objective:** Call initLangfuse() when the Next.js server starts (Node runtime only).

**Files:**
- Modify: `apps/web/src/instrumentation.ts`

**Step 1: Add Langfuse init to register()**

In `apps/web/src/instrumentation.ts`, inside `register()`, after the
PGlite boot block and BEFORE the Sentry init block, add:

```typescript
  // ── Langfuse LLM Observability ──────────────────────────────────
  // Node runtime only — OpenTelemetry SDK uses Node APIs.
  // Silently skipped when LANGFUSE_* env vars are not set.
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    try {
      const { initLangfuse } = await import(
        /* webpackIgnore: true */
        '@hamafx/ai/instrumentation'
      );
      initLangfuse();
    } catch (err) {
      console.warn(
        '[boot] Langfuse init failed (non-fatal):',
        (err as Error).message,
      );
    }
  }
```

**Step 2: Add Langfuse shutdown to onRequestError**

The `onRequestError` hook runs when the server is shutting down.
It's the best place to flush pending Langfuse spans. But we don't
want to add shutdown logic to an error handler — instead, add a
separate shutdown handler.

The cleanest approach for Next.js: do nothing special. The OTel
SDK registers `process.on('SIGTERM')` internally and flushes
on shutdown. So no additional code needed in the web app.

Verification is manual — check Langfuse dashboard after a chat turn.

**Verification:**
```bash
# Start the app with Langfuse enabled
LANGFUSE_PUBLIC_KEY=pk-lf-dummy LANGFUSE_SECRET_KEY=sk-lf-dummy \
  LANGFUSE_BASE_URL=http://localhost:3001 pnpm dev:local

# In another terminal, check the boot log
# Should see: [langfuse] OpenTelemetry tracing enabled → http://localhost:3001
# ...or: [langfuse] skipping — LANGFUSE_* not set (if keys are dummy/invalid)
```

---

### Task 6: Wire Langfuse into the worker boot sequence

**Objective:** Call initLangfuse() when the worker starts, and shutdown on exit.

**Files:**
- Modify: `apps/worker/src/index.ts`

**Step 1: Add import at top**

```typescript
import { initLangfuse, shutdownLangfuse } from '@hamafx/ai';
```

**Step 2: Add init in main()**

In `apps/worker/src/index.ts`, inside `main()`, after `initSentry()` and before `log.info('worker starting', ...)`:

```typescript
  // ── Langfuse LLM Observability ──────────────────────────────
  // Silently skipped when LANGFUSE_* env vars are not set.
  initLangfuse();
```

**Step 3: Add shutdown in installSignalHandlers**

The worker already has a `state.cleanups` array that runs on SIGTERM/SIGINT.
Add the Langfuse shutdown to the shutdown sequence in `main()`:

```typescript
  onShutdown(() => worker.stop());
  onShutdown(() => flushSentry(2_000));
  onShutdown(() => shutdownLangfuse());  // <-- add this line
```

**Note:** `shutdownLangfuse()` is async but `onShutdown` accepts both sync and
async callbacks. The cleanup loop in `installSignalHandlers` already `await`s
each cleanup function. No change needed to the cleanup infrastructure.

**Verification:**
```bash
grep "initLangfuse" apps/worker/src/index.ts    # line present
grep "shutdownLangfuse" apps/worker/src/index.ts # line present
cd apps/worker && pnpm typecheck                  # must pass
```

---

### Task 7: Add Langfuse env vars to local .env files

**Objective:** Add placeholder Langfuse env vars so local dev doesn't crash.

**Files:**
- Modify: `apps/web/.env.local`
- Modify: `apps/worker/.env.local`

**Step 1: Check if these files exist**

```bash
cat apps/web/.env.local | head -5
cat apps/worker/.env.local | head -5
```

If they don't exist, skip — Langfuse is optional; the app boots fine without
the env vars (it just skips tracing).

**Step 2: If they exist, append**

```
# Langfuse — uncomment and fill to enable LLM observability
# LANGFUSE_PUBLIC_KEY=pk-lf-...
# LANGFUSE_SECRET_KEY=sk-lf-...
# LANGFUSE_BASE_URL=http://localhost:3001
```

**Verification:**
```bash
# App must boot normally WITHOUT Langfuse env vars set
pnpm dev:local
# Should see: [langfuse] skipping — LANGFUSE_* not set
# App at http://localhost:3000 must load normally
```

---

### Task 8: Generate Langfuse API keys and test tracing end-to-end

**Objective:** Boot the full stack, create API keys, send a chat message, and verify it appears in Langfuse.

**Step 1: Boot the stack**

```bash
cd /home/ubuntu/HamaFX-Ai
docker compose up -d
# Wait for both services to be healthy
docker compose ps
```

**Step 2: Create Langfuse API keys**

1. Open http://localhost:3001 in a browser
2. Click "Sign Up" (first user becomes admin)
3. Go to Settings → API Keys
4. Click "Create API Key"
5. Copy the public key (pk-lf-...) and secret key (sk-lf-...)

**Step 3: Set env vars and restart the web app**

```bash
# Write to apps/web/.env.local (create if it doesn't exist)
cat >> apps/web/.env.local <<'EOF'
LANGFUSE_PUBLIC_KEY=pk-lf-<paste-here>
LANGFUSE_SECRET_KEY=sk-lf-<paste-here>
LANGFUSE_BASE_URL=http://localhost:3001
EOF

# Restart the dev server
pnpm dev:local
```

**Step 4: Send a chat message**

```bash
# Use curl to POST a simple chat message
# (You'll need a valid hfx_auth cookie — log in via browser first,
#  then copy the cookie from DevTools)
curl -X POST http://localhost:3000/api/chat \
  -H 'Content-Type: application/json' \
  -H 'Cookie: hfx_auth=YOUR_COOKIE_HERE' \
  -d '{
    "threadId": "00000000-0000-0000-0000-000000000001",
    "messages": [{
      "id": "msg-1",
      "role": "user",
      "parts": [{"type": "text", "text": "What is the current price of gold?"}]
    }]
  }'
```

**Step 5: Verify traces in Langfuse**

1. Open http://localhost:3001
2. Go to "Traces" in the sidebar
3. You should see a trace for the chat turn
4. Click into it — you should see:
   - The `streamText` span with model, token counts, latency
   - Nested spans for each tool call (e.g., `get_price`)
   - Input/output for each span

If you don't see traces: check the Next.js server logs for `[langfuse]` messages.
If you see "skipping" — the env vars aren't being picked up. Check `.env.local`
path and restart.

**Verification:**
- Langfuse UI shows at least 1 trace
- Trace contains streamText span + tool-call spans
- Token counts and latency are populated

---

### Task 9: Document Langfuse usage in AGENTS.md

**Objective:** Add Langfuse documentation to the AGENTS.md so future AI agents know how to use it.

**Files:**
- Modify: `docs/AGENTS.md`

**Step 1: Add to the "Commands" section**

After the AI Evals command, add:

```markdown
# Langfuse (LLM Observability)
docker compose up -d              # start Postgres + Langfuse
open http://localhost:3001         # Langfuse dashboard
```

**Step 2: Add to the "Common Pitfalls" section**

```markdown
### Langfuse Tracing
- Self-hosted at http://localhost:3001 (docker compose up)
- Tracing is OPTIONAL — when LANGFUSE_* env vars are unset, the app
  boots normally with no tracing overhead.
- API keys are created in the Langfuse UI after first boot (Settings → API Keys)
- The AI SDK auto-emits OTel spans — no manual instrumentation needed.
- Coexists with Sentry: Sentry uses its own SDK, Langfuse uses OTel.
```

**Verification:**
```bash
grep -A5 "Langfuse" docs/AGENTS.md  # new documentation present
```

---

### Task 10: Run full test suite to ensure no regressions

**Objective:** Verify all existing tests pass with the new dependencies installed.

**Step 1: Run the full test suite**

```bash
cd /home/ubuntu/HamaFX-Ai
pnpm turbo run test -- --run
```

Expected: all 350+ tests pass. Langfuse is disabled during tests
(no LANGFUSE_* env vars), so the OTel SDK is never started.

**Step 2: Typecheck all packages**

```bash
pnpm typecheck
```

Expected: no type errors. The new exports from `packages/ai/src/index.ts`
must be compatible with all consumers.

**Step 3: Build the web app**

```bash
pnpm --filter @hamafx/web build
```

Expected: successful production build. The `@langfuse/otel` and
`@opentelemetry/sdk-node` packages are Node-only — they must not
be pulled into the browser bundle. Verify by checking the build output
size hasn't ballooned.

---

## Post-Integration: What You Get

After completing all tasks, you have:

### Tracing (VI — Observability)
- Every `streamText` call traced: model, tokens, latency
- Every tool invocation traced: tool name, duration, ok/error
- Planner, title generation, thread compaction all traced
- Committee persona LLM calls traced
- All viewable in real-time at http://localhost:3001

### Evaluation (VII — Prompt Management & Eval)
- **Prompt Versioning:** Create prompt versions in Langfuse UI.
  Link each version to traces to see which prompt produced which results.
- **LLM-as-Judge Evals:** Score answer quality (faithfulness, relevance,
  completeness) with automated LLM evaluation.
- **Datasets:** Pull real user messages from production traces into test
  sets. Much better than hand-maintaining cases.json.
- **Experiments:** Run a dataset against prompt version A vs B. See
  which scores higher with statistical confidence.
- **Playground:** Test prompt changes interactively before committing.

### Dashboard
- Single pane of glass for all LLM activity
- Cost tracking: tokens per model, per turn, per day
- Error surfacing: failed tool calls with error messages
- Latency breakdown: TTFT, tool execution, total turn time

### What does NOT change
- Existing telemetry tables (chat_telemetry, tool_telemetry) remain —
  they're the source of truth for budget accounting. Langfuse is
  observational only.
- Sentry continues to capture errors independently.
- healthchecks.io continues to monitor uptime.
- The eval harness (eval/runner.ts) continues to work for deterministic
  CI checks.

---

## Risk Assessment

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| OTel SDK conflicts with Next.js bundling | Low | Medium | OTel is imported only in Node runtime (webpackIgnore). Browser bundle is untouched. |
| Langfuse server OOM on e2-medium | Low | Low | Langfuse uses ~200MB idle. Worker uses ~300MB. Total ~500MB on 4GB VM — plenty of headroom. |
| Langfuse outage blocks chat | None | None | Tracing is fire-and-forget. Span export failures are swallowed. Chat continues. |
| API key rotation breaks tracing | Low | Low | Env vars are optional. Removing them silently disables tracing. |
| OTel + Sentry conflict | None | None | Sentry uses its own SDK, not OTel. Both run in the same process without issues. |

---

## Open Questions

1. **Cloud vs self-hosted?** The plan assumes self-hosted. If the user
   prefers Langfuse Cloud (free tier: 50K observations/month), change
   LANGFUSE_BASE_URL to https://cloud.langfuse.com and skip docker compose.
   Self-hosted is recommended — $0, data stays on your VM.

2. **Sampling rate?** Currently traces EVERY turn (single user, low volume).
   If volume increases, add `traceParams: { samplingRate: 0.1 }` to the
   LangfuseSpanProcessor config to sample 10% of traces.

3. **Data retention?** Langfuse default retains traces indefinitely.
   For a single-user project this is fine. If the DB grows, configure
   retention in Langfuse settings.

4. **Worker-only Langfuse?** The worker also makes LLM calls (briefings,
   weekly reviews). With the instrumentation in place, those calls are
   auto-traced too. Verify by checking the worker traces in Langfuse
   after a scheduled job runs.