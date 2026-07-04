# E2E Test System — HamaFX-Ai

> Upgraded July 2026 — modern Playwright practices, multi-browser, sharded CI,
> composable fixtures, storageState auth, and full route coverage.

## Quick Start

```bash
# From the monorepo root
pnpm install

# Run all e2e tests (requires dev server on :3000)
pnpm --filter @hamafx/web exec playwright test

# Run a specific spec
pnpm --filter @hamafx/web exec playwright test tests/e2e/auth.spec.ts

# Run with UI mode (interactive debugging)
pnpm --filter @hamafx/web exec playwright test --ui

# Run with Trace Viewer
pnpm --filter @hamafx/web exec playwright test --trace on
pnpm --filter @hamafx/web exec playwright show-trace test-results/output/trace.zip

# Run only chromium project
pnpm --filter @hamafx/web exec playwright test --project=chromium

# Run only mobile viewport tests
pnpm --filter @hamafx/web exec playwright test --project=mobile-chrome
```

## Architecture

### Project Structure

```
tests/e2e/
├── auth-setup.ts          # Logs in once, saves storageState for all downstream projects
├── fixtures.ts            # Composable fixtures: authedPage, mockChatApi, SSE mock bodies
├── test-utils.ts          # DB helpers: ensureTestUser(), encryptDummyByokKey()
├── env-loader.ts          # Loads .env.local → .env.production.local for test runner
├── global-setup.ts        # Runs Drizzle migrations before tests
├── .auth/                 # Generated storageState (gitignored)
│   └── user.json
├── auth.spec.ts           # Login, register, invalid creds, forgot password
├── chat.spec.ts           # Thread creation, message send/receive, error handling
├── multi-agent.spec.ts    # Full/Quick/Single analysis modes, SSE streaming
├── isolation.spec.ts      # Multi-user thread isolation, separate sessions
├── settings.spec.ts       # Profile, API keys, symbols, models, usage, nav
├── service-worker.spec.ts # PWA SW registration, offline page
├── navigation.spec.ts     # All authenticated routes load without errors
├── dashboard.spec.ts      # Dashboard widget rendering, error resilience
├── responsive.spec.ts     # Mobile viewport, no horizontal scroll
├── accessibility.spec.ts  # Labels, landmarks, headings, skip link
└── api-health.spec.ts     # API endpoint smoke tests, CSRF, auth guards
```

### Projects (Browser Matrix)

| Project         | Browser         | Viewport       | Specs matched                          |
|-----------------|-----------------|----------------|---------------------------------------|
| `setup`         | Chromium        | Desktop        | `auth-setup.ts` only                  |
| `chromium`      | Chromium        | Desktop        | All specs (excl. setup)               |
| `firefox`       | Firefox         | Desktop        | All specs (excl. setup)               |
| `webkit`        | Safari/WebKit   | Desktop        | All specs (excl. setup)               |
| `mobile-chrome` | Chromium        | Pixel 7        | navigation, responsive, auth          |
| `mobile-safari` | Safari/WebKit   | iPhone 15      | navigation, responsive, auth          |

### Authentication Flow

1. **`global-setup.ts`** runs first — loads env vars and applies Drizzle migrations.
2. **`setup` project** (`auth-setup.ts`) logs in as `test@example.com` and saves the
   session to `tests/e2e/.auth/user.json`.
3. All downstream projects (`chromium`, `firefox`, `webkit`, `mobile-*`) load this
   `storageState` automatically — **no per-test login boilerplate**.

### Composable Fixtures (`fixtures.ts`)

- **`authedPage`** — a `Page` that is already authenticated via storageState.
- **`mockChatApi`** — intercepts `/api/chat` with configurable single/multi-agent mocks.
- **`FULL_MODE_SSE`** / **`QUICK_MODE_SSE`** — pre-built SSE mock bodies for multi-agent tests.
- **`testUser`** — default test user credentials.

Usage:
```typescript
import { test, expect } from './fixtures';

test('my test', async ({ authedPage, mockChatApi }) => {
  await mockChatApi(authedPage);
  // ...
});
```

## Key Improvements (2026 Upgrade)

### 1. Modern Selectors
- **Before:** `page.fill('input[name="email"]', ...)` — brittle CSS selectors.
- **After:** `page.getByLabel('Email').fill(...)` — aligned with `<label htmlFor>` in the DOM.
- **After:** `page.getByRole('button', { name: /sign in/i })` — accessible-name based.

### 2. storageState Authentication
- **Before:** Every spec manually logged in (60+ lines of boilerplate per file).
- **After:** Login once in `auth-setup.ts`, reuse via `storageState` across all projects.

### 3. Multi-Browser Coverage
- **Before:** Chromium only.
- **After:** Chromium + Firefox + WebKit + Mobile Chrome + Mobile Safari.

### 4. CI Sharding + Artifacts
- **Before:** Single job, no artifacts.
- **After:** 4-way shard matrix, HTML report + JUnit XML + trace/video/screenshot artifacts.

### 5. Failure Debugging
- `trace: 'on-first-retry'` — captures trace on first retry only.
- `screenshot: 'only-on-failure'` — screenshots on failure.
- `video: 'retain-on-failure'` — video kept only for failed tests.
- `actionTimeout: 15_000` — per-action timeout surfaces real slowdowns.

### 6. Deterministic Environment
- `locale: 'en-US'` and `timezoneId: 'UTC'` set globally for all tests.
- Env loader walks up to monorepo root to find `.env.local` and `.env.production.local`.

### 7. Full Route Coverage
- **Before:** 6 specs covering auth, chat, settings, isolation, multi-agent, SW.
- **After:** 11 specs adding navigation (all routes), dashboard, responsive, accessibility, API health.

## Test Data

- `ensureTestUser()` creates/updates a user in the test database with a dummy encrypted BYOK key.
- Test users: `test@example.com`, `user-a@example.com`, `user-b@example.com`.
- Password: `password123` (or `passwordA`/`passwordB` for isolation tests).

## CI Configuration

The e2e job in `.github/workflows/ci-slow.yml`:
- Runs on push to `main` and nightly (`0 0 * * *`).
- 4-way shard matrix for parallel execution.
- Uploads HTML report, JUnit XML, and failure artifacts.
- 30-minute timeout (increased from 20 for multi-browser coverage).

## Environment Variables

The env loader (`env-loader.ts`) loads in order:
1. `apps/web/.env.local` (user-local overrides)
2. Monorepo root `.env.local`
3. Monorepo root `.env.production.local` (fallback for empty values like `ENCRYPTION_SECRET`)
4. `apps/web/.env.production.local`

Required for e2e:
- `DATABASE_URL` or `POSTGRES_URL` — test database connection
- `ENCRYPTION_SECRET` — 32-byte hex key for BYOK encryption
- `AUTH_SECRET` — NextAuth session secret (defaults to a fallback in env-loader)

## Debugging Tips

```bash
# Debug a single test with Playwright Inspector
pnpm --filter @hamafx/web exec playwright test tests/e2e/auth.spec.ts --debug

# Run with verbose output
pnpm --filter @hamafx/web exec playwright test --reporter=list

# View HTML report
pnpm --filter @hamafx/web exec playwright show-report

# View trace from a failed test
pnpm --filter @hamafx/web exec playwright show-trace test-results/output/trace.zip
```
