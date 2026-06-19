# Local-First Deployment: Docker + Native Implementation Plan

> **For Hermes:** Implement task-by-task. Every step must not break existing Vercel + GCE VM production.

**Goal:** Add two zero-config deployment paths (Docker compose up, pnpm dev) while preserving all existing production infrastructure untouched.

**Architecture:** A database abstraction layer that auto-selects Postgres (production/Docker) or PGlite (embedded, for native dev). A unified entrypoint that brings up Next.js + worker + embedded cron scheduler in the same process for both Docker and native modes. Production paths (systemd timers, Vercel, remote Postgres) are never touched.

**Tech Stack:** PGlite (embedded Postgres + pgvector), node-cron (in-process scheduler), Drizzle ORM (unchanged), docker-compose (for Postgres container), Next.js 15 + Turborepo + pnpm (unchanged).

---

## Core Design Principles

1. **Zero production impact** — every change is gated behind env detection. If `DEPLOYMENT_MODE` is not set or `DATABASE_URL` is set, behavior is 100% identical to today.
2. **Additive only** — new files, new optional deps, new env vars. Never delete or rename existing functionality.
3. **Detection by env** — `DATABASE_URL` present → remote Postgres (production/Docker). `DATABASE_URL` absent → PGlite (native dev). `SCHEDULER_MODE=embedded` → node-cron. Default/no value → external systemd.
4. **Cron handlers become direct-callable** — extract core logic from HTTP route handlers so the embedded scheduler calls functions directly instead of curling itself.

---

## Phases

### Phase 0: Database Abstraction (PGlite support)

The most critical change — allows the app to start with zero Postgres setup.

#### Task 0.1: Add PGlite + vector extension dependency

**Files:**
- Modify: `packages/db/package.json`

Add `@electric-sql/pglite` and the vector extension. Also add `drizzle-orm/pglite` (check drizzle-orm 0.38 supports it) or create a simple adapter.

```json
// New deps in packages/db/package.json
"@electric-sql/pglite": "^0.2.x",
```

Also need the vector extension for PGlite. Check if `@electric-sql/pglite` includes pgvector natively or needs `@electric-sql/pglite-vcr`.

**Verification:** `pnpm install` succeeds, no peer dep conflicts.

#### Task 0.2: Create PGlite drizzle adapter

**Files:**
- Create: `packages/db/src/pglite-client.ts`

When `DATABASE_URL` is not set, create a PGlite instance with pgvector enabled, plus a drizzle wrapper:

```typescript
// packages/db/src/pglite-client.ts
import { PGlite } from '@electric-sql/pglite';
import { vector } from '@electric-sql/pglite/vector'; // check exact path
import { drizzle } from 'drizzle-orm/pglite'; // or manual adapter
import * as schema from './schema/index';

const DATA_DIR = '.hamafx/data';

let _pglite: PGlite | null = null;
let _pgliteDrizzle: ReturnType<typeof drizzle> | null = null;

export async function getPGliteDb(): Promise<ReturnType<typeof drizzle>> {
  if (_pgliteDrizzle) return _pgliteDrizzle;
  
  // Ensure data dir exists
  const fs = await import('node:fs/promises');
  await fs.mkdir(DATA_DIR, { recursive: true });
  
  _pglite = new PGlite(DATA_DIR, {
    extensions: { vector },
  });
  
  _pgliteDrizzle = drizzle(_pglite, { schema });
  return _pgliteDrizzle;
}

export async function closePGliteDb(): Promise<void> {
  if (_pglite) {
    await _pglite.close();
    _pglite = null;
    _pgliteDrizzle = null;
  }
}
```

**Critical check:** `drizzle-orm`'s PGlite support. If drizzle-orm 0.38.x doesn't have `drizzle-orm/pglite`, we use the `drizzle-orm/pglite` from `drizzle-orm` and pass PGlite instance directly. Check actual API.

**Verification:** This is a new file, doesn't break anything.

#### Task 0.3: Modify getDb() to auto-select PGlite

**Files:**
- Modify: `packages/db/src/client.ts`

Add PGlite fallback. The key invariant: when `DATABASE_URL` (or `POSTGRES_URL`) is present, the code path is byte-for-byte identical to today.

```typescript
// packages/db/src/client.ts — modified getDb()

export function getDb(): ReturnType<typeof drizzle> {
  if (_client) return _client;

  const url = process.env.DATABASE_URL || process.env.POSTGRES_URL;
  
  // NEW: PGlite fallback when no remote DB URL is configured
  if (!url) {
    // PGlite is lazy-loaded so it's not a hard dependency
    // in serverless/Vercel builds that never hit this path
    throw new Error(
      'DATABASE_URL is not set. For local development with PGlite, ' +
      'import { getPGliteDb } from "@hamafx/db/pglite" instead. ' +
      'See the deployment docs for setup options.'
    );
  }

  // ... rest is IDENTICAL to current code (postgres pool, drizzle, etc.)
  _sql = postgres(url, { prepare: false, max: resolvePoolMax(), ... });
  _client = drizzle(_sql, { schema });
  return _client;
}
```

The key decision: `getDb()` does NOT auto-fallback to PGlite. Instead we create a separate entry path. Why:
- `getDb()` is called everywhere (middleware, Edge, Vercel, worker)
- PGlite is Node-only (needs `fs`, native bindings)
- Auto-fallback would pull PGlite into Vercel bundles, breaking Edge runtime

Instead, we add `getLocalDb()` that apps explicitly opt into in development mode.

**Verification:** All existing tests pass. Production code path untouched.

#### Task 0.4: Create getLocalDb() unified client

**Files:**
- Create: `packages/db/src/local-db.ts`
- Modify: `packages/db/src/index.ts` (add export)

```typescript
// packages/db/src/local-db.ts
// Unified DB client for local/Docker development. 
// Auto-selects PGlite (when no DATABASE_URL) or Postgres (when URL present).
// NEVER import this from Edge/middleware code.

import { getDb, closeDb } from './client';
import { getPGliteDb, closePGliteDb } from './pglite-client';

let _mode: 'postgres' | 'pglite' | null = null;

export async function getLocalDb() {
  const url = process.env.DATABASE_URL || process.env.POSTGRES_URL;
  
  if (url) {
    _mode = 'postgres';
    return getDb();
  }
  
  _mode = 'pglite';
  return getPGliteDb();
}

export async function runMigrations(): Promise<void> {
  // Import drizzle-kit migrate function
  const { migrate } = await import('drizzle-orm/pglite/migrator'); // or postgres-js migrator
  const db = await getLocalDb();
  // Run migrations from packages/db/drizzle/
  await migrate(db, { migrationsFolder: new URL('../drizzle', import.meta.url).pathname });
}

export async function closeLocalDb(): Promise<void> {
  if (_mode === 'pglite') await closePGliteDb();
  else await closeDb();
}
```

**Verification:** Not called anywhere yet, no impact.

---

### Phase 1: Embedded Scheduler (node-cron)

Replace the "curl Vercel from systemd" pattern with direct function calls when running locally.

#### Task 1.1: Extract cron handler cores (light crons)

For each light cron route, extract the inner function so it can be called directly without HTTP.

**Files (for each cron):**
- Create: `packages/ai/src/cron/news-cron.ts` (or similar per-cron module)
- Modify: `apps/web/src/app/api/cron/news/route.ts` (thin wrapper that calls core)

Example — news cron:

```typescript
// packages/ai/src/cron/news-cron.ts
// The actual logic, importable by both the HTTP route AND the embedded scheduler.
// No dependency on Request/Response — just a plain async function.

import { latestArticleTimestampMs, upsertArticles } from '@hamafx/ai';
import { fetchNews } from '@hamafx/data';

export interface CronResult {
  processed: number;
  note?: string;
  errors?: string[];
}

export async function runNewsCron(): Promise<CronResult> {
  // ... copy the body of the GET handler, minus the withCronAuth wrapper
  // and minus the Response.json wrapping
}
```

Then the route becomes:

```typescript
// apps/web/src/app/api/cron/news/route.ts — simplified
import { runNewsCron } from '@hamafx/ai/cron/news';
import { withCronAuth } from '@/lib/cron';

export async function GET(req: Request): Promise<Response> {
  return withCronAuth(req, async () => runNewsCron());
}
```

This is backward-compatible — the HTTP endpoint still exists for systemd curl-pokers.

**Light crons to extract:** news, alerts, calendar, warm-cache, cleanup-uploads, cot, fred-actuals

**Verification:** Each cron route still works via curl in production. No behavior change.

#### Task 1.2: Add node-cron dependency

**Files:**
- Modify: `apps/worker/package.json` (or `packages/worker-core/package.json` if we create it)

```json
"node-cron": "^3.0.x",
"@types/node-cron": "^3.0.x"
```

**Verification:** `pnpm install` succeeds.

#### Task 1.3: Create embedded scheduler module

**Files:**
- Create: `apps/worker/src/scheduler/embedded.ts`

Wraps node-cron, maps cron schedules to direct function calls.

```typescript
// apps/worker/src/scheduler/embedded.ts
import cron from 'node-cron';
import { JOBS } from '../jobs/index';
import type { Logger } from '../log';

interface ScheduleEntry {
  name: string;
  cron: string;
  run: () => Promise<void>;
}

export function startEmbeddedScheduler(log: Logger): () => void {
  const schedules: ScheduleEntry[] = [
    // Light crons — call functions directly
    { name: 'news', cron: '*/5 * * * *', run: async () => {
      const { runNewsCron } = await import('@hamafx/ai/cron/news');
      await runNewsCron();
    }},
    { name: 'alerts', cron: '*/5 * * * *', run: async () => { /* ... */ }},
    { name: 'calendar', cron: '*/15 * * * *', run: async () => { /* ... */ }},
    { name: 'warm-cache', cron: '*/2 * * * *', run: async () => { /* ... */ }},
    
    // Heavy jobs — call JOBS[name].run directly
    { name: 'briefings', cron: '*/5 * * * *', run: async () => {
      await JOBS.briefings.run({ log, signal: new AbortController().signal });
    }},
    // ... snapshots at 00:05, cot on Friday 22:00, etc.
  ];

  const tasks = schedules.map(s => {
    const task = cron.schedule(s.cron, async () => {
      log.info(`scheduler: running ${s.name}`);
      try {
        await s.run();
        log.info(`scheduler: ${s.name} completed`);
      } catch (err) {
        log.error(`scheduler: ${s.name} failed`, { err: String(err) });
      }
    });
    log.info(`scheduler: registered ${s.name} (${s.cron})`);
    return task;
  });

  return () => tasks.forEach(t => t.stop());
}
```

**Verification:** Scheduler starts and stops cleanly. Tasks fire on schedule.

#### Task 1.4: Add SCHEDULER_MODE env var

**Files:**
- Modify: `apps/worker/src/env.ts`

Add optional `SCHEDULER_MODE` field (default `external`, can be `embedded`).

```typescript
SCHEDULER_MODE: z.enum(['external', 'embedded']).default('external'),
```

When `embedded`: start node-cron alongside the SignalR consumer.
When `external` (default): no change — systemd timers handle scheduling.

**Verification:** Worker starts in both modes. Default mode unchanged.

---

### Phase 2: Unified Entrypoint

A single process that starts Next.js + worker + scheduler for Docker and native modes.

#### Task 2.1: Create unified entrypoint for Docker

**Files:**
- Create: `apps/web/docker-entrypoint.sh`

```bash
#!/bin/sh
set -e

# Wait for Postgres (Docker compose health check or direct)
if [ -n "$DATABASE_URL" ]; then
  echo "Waiting for Postgres..."
  # Extract host:port from DATABASE_URL and wait
  until pg_isready -d "$DATABASE_URL" 2>/dev/null; do
    sleep 1
  done
  echo "Postgres ready"
fi

# Run migrations
echo "Running migrations..."
pnpm --filter @hamafx/db migrate:apply

# Start Next.js (production mode)
echo "Starting HamaFX-Ai..."
exec node apps/web/.next/standalone/server.js
```

**Verification:** Docker build produces a working image.

#### Task 2.2: Create development entrypoint

**Files:**
- Create: `scripts/dev.ts`

A single script that starts both Next.js dev server and the worker daemon.

```typescript
// scripts/dev.ts
import { spawn } from 'node:child_process';

// Start Next.js dev server
const nextDev = spawn('pnpm', ['--filter', '@hamafx/web', 'dev'], {
  stdio: 'inherit',
  env: { ...process.env, SCHEDULER_MODE: 'embedded' },
});

// Start worker (SignalR consumer + embedded scheduler)
const worker = spawn('pnpm', ['--filter', '@hamafx/worker', 'start'], {
  stdio: 'inherit',
  env: { ...process.env, SCHEDULER_MODE: 'embedded' },
});

process.on('SIGINT', () => {
  nextDev.kill();
  worker.kill();
});
```

But actually — the Next.js dev server already hot-reloads. The worker needs to be a separate process or a child. For simplicity, the worker process starts alongside.

Alternative: the worker starts in-process via Next.js instrumentation (but that's risky — instrumentation is per-request, not persistent). Better to keep them as separate processes spawned together.

**Verification:** `pnpm dev` or `pnpm local:dev` starts both processes.

#### Task 2.3: Add package.json scripts

**Files:**
- Modify: `package.json` (root)

```json
"scripts": {
  "dev": "turbo run dev",
  "dev:local": "tsx scripts/dev.ts",
  "setup": "tsx scripts/setup.ts",
  // ... existing scripts unchanged
}
```

**Verification:** Scripts appear but don't break existing `pnpm dev`.

---

### Phase 3: Docker Configuration

#### Task 3.1: Write Dockerfile

**Files:**
- Create: `Dockerfile`

Multi-stage build:
1. deps stage: pnpm install --frozen-lockfile
2. build stage: turbo run build --filter=web...
3. prod stage: standalone Next.js output, pnpm pruned deps

```dockerfile
FROM node:20-slim AS base
RUN corepack enable && corepack prepare pnpm@9.15.4 --activate
WORKDIR /app

FROM base AS deps
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json turbo.json tsconfig.base.json ./
COPY apps/web/package.json apps/web/
COPY packages/*/package.json packages/
RUN pnpm install --frozen-lockfile

FROM deps AS builder
COPY . .
RUN pnpm turbo run build --filter=@hamafx/web...

FROM base AS runner
RUN apt-get update && apt-get install -y curl && rm -rf /var/lib/apt/lists/*
COPY --from=builder /app/apps/web/.next/standalone ./
COPY --from=builder /app/apps/web/.next/static ./apps/web/.next/static
COPY --from=builder /app/packages/db/drizzle ./packages/db/drizzle
COPY apps/web/docker-entrypoint.sh /entrypoint.sh
RUN chmod +x /entrypoint.sh

ENV NODE_ENV=production
ENV PORT=3000
EXPOSE 3000

ENTRYPOINT ["/entrypoint.sh"]
```

**Note:** The Next.js standalone output path needs verification. Next.js 15's `output: 'standalone'` needs to be set in `next.config.mjs`.

**Verification:** `docker build -t hamafx-web .` succeeds.

#### Task 3.2: Add standalone output to Next.js config

**Files:**
- Modify: `apps/web/next.config.mjs`

Add `output: 'standalone'` — this is safe because Vercel ignores it (they have their own output handling), and it only affects local/Docker builds.

```javascript
const nextConfig = {
  output: process.env.DOCKER_BUILD ? 'standalone' : undefined,
  // ... existing config unchanged
```

Actually, simpler: always use `standalone` but only when not on Vercel:

```javascript
output: process.env.VERCEL ? undefined : 'standalone',
```

**Verification:** Vercel build still works. Local `next build` produces standalone output.

#### Task 3.3: Write docker-compose.yml

**Files:**
- Create: `docker-compose.yml`

```yaml
version: '3.8'
services:
  db:
    image: pgvector/pgvector:pg16
    environment:
      POSTGRES_DB: hamafx
      POSTGRES_USER: hamafx
      POSTGRES_PASSWORD: hamafx
    ports:
      - "5432:5432"
    volumes:
      - pgdata:/var/lib/postgresql/data
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U hamafx"]
      interval: 5s
      timeout: 5s
      retries: 5

  app:
    build:
      context: .
      dockerfile: Dockerfile
    ports:
      - "3000:3000"
    environment:
      DATABASE_URL: postgres://hamafx:hamafx@db:5432/hamafx
      NODE_ENV: production
      SCHEDULER_MODE: embedded
      # User fills in their .env file or docker-compose override
    env_file:
      - .env
    depends_on:
      db:
        condition: service_healthy
    restart: unless-stopped

volumes:
  pgdata:
```

**Verification:** `docker compose up` brings up both services. App connects to Postgres.

---

### Phase 4: Native Setup Script

#### Task 4.1: Create setup script

**Files:**
- Create: `scripts/setup.ts`

```typescript
// scripts/setup.ts
// One-command setup for native local development.
// Detects OS, guides the user through any missing deps.

import { execSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { createInterface } from 'node:readline';

async function main() {
  console.log('🔧 HamaFX-Ai Setup\n');
  
  // 1. Check Node version
  const nodeVersion = process.version;
  console.log(`✓ Node ${nodeVersion}`);
  
  // 2. Check pnpm
  try {
    execSync('pnpm --version', { stdio: 'pipe' });
    console.log('✓ pnpm installed');
  } catch {
    console.log('✗ pnpm not found. Install: npm install -g pnpm@9');
    process.exit(1);
  }
  
  // 3. Check .env exists
  if (!existsSync('.env.local') && !existsSync('.env')) {
    console.log('\n⚠ No .env file found.');
    console.log('  Copy .env.example to .env and fill in your API keys.');
    console.log('  cp .env.example .env');
    console.log('\n  For local dev with PGlite (embedded DB), you can leave DATABASE_URL empty.');
  }
  
  // 4. Install deps
  console.log('\n📦 Installing dependencies...');
  execSync('pnpm install', { stdio: 'inherit' });
  
  // 5. Run migrations (if DATABASE_URL is set or if using PGlite)
  const hasDb = process.env.DATABASE_URL || process.env.POSTGRES_URL;
  if (hasDb) {
    console.log('🗄️ Running database migrations...');
    execSync('pnpm --filter @hamafx/db migrate:apply', { stdio: 'inherit' });
  } else {
    console.log('🗄️ Using embedded PGlite (no Postgres setup needed)');
    console.log('  Migrations will run automatically on first pnpm dev');
  }
  
  console.log('\n✅ Setup complete! Run: pnpm dev:local');
}

main().catch((err) => {
  console.error('Setup failed:', err);
  process.exit(1);
});
```

**Verification:** `pnpm setup` runs without errors. Guides user appropriately.

---

### Phase 5: Documentation + Cleanup

#### Task 5.1: Update README with deployment paths

**Files:**
- Modify: `README.md`

Add a prominent "Quick Start" section at the top with two paths:

```markdown
## Quick Start

### Option 1: Docker (recommended for non-developers)
\`\`\`bash
git clone https://github.com/HamaFx/HamaFX-Ai
cd HamaFX-Ai
cp .env.example .env   # add your API keys
docker compose up -d
# Open http://localhost:3000
\`\`\`

### Option 2: Native (for developers)
\`\`\`bash
git clone https://github.com/HamaFx/HamaFX-Ai
cd HamaFX-Ai
pnpm setup              # installs deps, sets up DB
pnpm dev:local          # starts web + worker
# Open http://localhost:3000
\`\`\`

### Option 3: Deploy to the cloud
See [docs/09-deployment.md](./docs/09-deployment.md) for Vercel + GCE production deployment.
```

**Verification:** README is clear and actionable.

#### Task 5.2: Update .env.example for local-first

**Files:**
- Modify: `.env.example`

Add comments for DATABASE_URL to indicate it's optional for local dev:

```
# DATABASE_URL — NOT required for local dev (uses embedded PGlite)
# Required only for Docker deployment or production (Supabase/Postgres)
DATABASE_URL=
```

Move VM-only env vars into a separate section clearly marked "Production only (GCE VM)".

**Verification:** New user looking at .env.example knows exactly what to fill in.

#### Task 5.3: Verify nothing is broken

Run the full existing test suite to confirm zero regressions:

```bash
pnpm turbo run test -- --run
pnpm typecheck
pnpm --filter @hamafx/web build
```

All three must pass before any commit.

---

## Implementation Order

```
Phase 0 (DB abstraction) → don't commit yet
Phase 1 (scheduler)      → don't commit yet  
Phase 2 (entrypoint)     → don't commit yet
Phase 3 (Docker)         → don't commit yet
Phase 4 (setup script)   → don't commit yet
Phase 5 (docs)           → commit everything together

PRE-COMMIT:
  pnpm turbo run test -- --run  → must PASS
  pnpm typecheck                 → must PASS
  pnpm --filter @hamafx/web build → must PASS

Only commit when all three pass.
```

---

## Risk Matrix

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| PGlite breaks Vercel build | Low | Critical | PGlite code is never imported outside `local-db.ts`. Vercel never calls `getLocalDb()`. Guard with dynamic imports. |
| `output: 'standalone'` breaks Vercel | Low | High | Gate behind `!process.env.VERCEL` check in next.config. |
| node-cron collides with systemd | None | Low | Gated behind `SCHEDULER_MODE=embedded`. Default is `external` (unchanged). |
| Drizzle migrator doesn't work with PGlite | Medium | Medium | Test early. Fallback: write raw SQL runner for PGlite. |
| PGlite vector extension missing | Medium | Medium | Test early. Fallback: skip pgvector tables in PGlite mode (embedding features require Postgres). |
| Docker entrypoint complexity | Low | Low | Simple shell script. Easy to debug. |

---

## Files Summary

### New files (11)
- `packages/db/src/pglite-client.ts` — PGlite + drizzle wrapper
- `packages/db/src/local-db.ts` — unified DB client + migration runner
- `apps/worker/src/scheduler/embedded.ts` — node-cron scheduler
- `scripts/dev.ts` — unified dev entrypoint
- `scripts/setup.ts` — one-command native setup
- `Dockerfile` — multi-stage Docker build
- `docker-compose.yml` — Postgres + app services
- `apps/web/docker-entrypoint.sh` — Docker startup script
- `packages/ai/src/cron/news-cron.ts` — extracted news cron
- `packages/ai/src/cron/alerts-cron.ts` — extracted alerts cron
- `packages/ai/src/cron/warm-cache-cron.ts` — extracted warm-cache cron

### Modified files (8)
- `packages/db/package.json` — add PGlite dep
- `packages/db/src/client.ts` — PGlite-aware error message
- `packages/db/src/index.ts` — export getLocalDb
- `apps/worker/src/env.ts` — add SCHEDULER_MODE
- `apps/worker/package.json` — add node-cron dep
- `apps/web/next.config.mjs` — conditional standalone output
- `package.json` (root) — add dev:local, setup scripts
- `.env.example` — reorganize, mark DATABASE_URL as optional for local

### Unchanged (everything else)
- All API routes, all AI tools, all frontend components
- Worker SignalR consumer, aggregator, jobs
- Vercel config, GCE infra docs, CI workflow
- All tests

---

## Verification Checklist (post-implementation)

- [ ] `pnpm turbo run test -- --run` — all 346 tests pass
- [ ] `pnpm typecheck` — zero errors
- [ ] `pnpm --filter @hamafx/web build` — builds successfully
- [ ] `docker compose up` — app starts, accessible on localhost:3000
- [ ] Login with APP_PASSWORD works in Docker
- [ ] Chat agent responds in Docker
- [ ] `pnpm setup && pnpm dev:local` — app starts natively
- [ ] PGlite creates data directory, migrations auto-run
- [ ] Worker jobs fire on schedule in embedded mode
- [ ] Vercel deploy still works (no regression)
- [ ] GCE worker still works (systemd timers unchanged)