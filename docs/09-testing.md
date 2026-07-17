# 09 — Testing & E2E

> Comprehensive guide to the test infrastructure, patterns, E2E suite, and AI eval harness.

---

## Overview

173 test files, 590+ test cases across all packages. Vitest is the test runner. Tests use the `--run` flag to avoid watch mode (otherwise timeouts in CI/automation). The `@hamafx/config` package provides shared vitest configurations. Playwright handles E2E testing (16 spec files).

## Running Tests

```bash
# All packages
pnpm turbo run test -- --run

# Single package
pnpm --filter @hamafx/worker test -- --run
pnpm --filter @hamafx/ai test -- --run
pnpm --filter @hamafx/data test -- --run
pnpm --filter @hamafx/web test -- --run

# With coverage
pnpm --filter @hamafx/web test -- --run --coverage

# Watch mode (dev only)
pnpm --filter @hamafx/indicators test

# E2E (Playwright)
pnpm --filter @hamafx/web exec playwright test
```

## Package Test Layout

| Package | Test Files | Key Areas |
|---------|-----------|-----------|
| `ai` | 42 | Tools, routing, verification, planner, committee, alerts, briefings, memory, cost, diagnostics |
| `data` | 15 | Provider maps, rest endpoints, candles, live-ticks, news adapter, price adapter, throttle |
| `db` | 5 | Schema validation, migration chain, locks, rate-limit row shape |
| `indicators` | 11 | SMC swings, structure, FVG, order blocks, liquidity, RSI, EMA, SMA |
| `shared` | 4 | Env validation, error types, encryption, market phase |
| `worker` | 17 | SignalR consumer, reconnect, tick buffer, candle aggregator, env, jobs |
| `web` | 30+ unit + 16 E2E | API integration, auth flow, CSRF, route health, settings actions, voice input, admin routes, middleware, hooks, Playwright E2E (auth, chat, settings, isolation, multi-agent, service-worker, navigation, dashboard, responsive, accessibility, api-health, theme-tokens, admin-dashboard, nav-drawer, chat-ui, onboarding-replay) |
| `test-utils` | — | Shared factories (users, threads, candles), mocks (db, fetch, llm, server-only) |

## Test Patterns

### Basic Structure

Every test file lives in a `test/` directory at the package root or next to the source file. Use `vitest` globals (`describe`, `it`, `expect`) — they are auto-imported.

```typescript
import { describe, expect, it } from 'vitest';
import { myFunction } from '../src/my-function';

describe('myFunction', () => {
  it('returns expected output for valid input', () => {
    const result = myFunction('valid');
    expect(result).toBe('expected');
  });

  it('throws on invalid input', () => {
    expect(() => myFunction(null)).toThrow(/invalid/);
  });
});
```

### Provider Mocking (data/worker)

Always mock external providers in tests. Use dependency injection rather than global mocks:

```typescript
// Good: inject fake provider
const result = await getPrice('XAUUSD', {
  providers: { biquote: fakeBiquoteFn }
});

// Bad: global mock
vi.mock('biquote-client');
```

### Tool Testing (ai)

Test tool execute functions directly, not through the agent:

```typescript
import { get_price } from './tools/get-price';

const result = await get_price.execute({ symbols: ['XAUUSD'] });
expect(result.ticks).toHaveLength(1);
expect(result.ticks[0].symbol).toBe('XAUUSD');
```

### Database Testing (Isolated Transactions)

Use `packages/db/src/test-utils.ts` to run database tests within an isolated transaction that rolls back after each test:

```typescript
import { withIsolatedTx } from '@hamafx/db/test-utils';

it('creates a user', async () => {
  await withIsolatedTx(async (tx) => {
    const user = await tx.insert(users).values({...}).returning();
    expect(user).toBeDefined();
  });
});
```

### NextAuth Session Mocking

For testing API routes or components that require a user session, use the helpers in `apps/web/test/auth-helpers.ts`:

```typescript
import { mockNextAuthSession } from '../test/auth-helpers';

// vi.mock('@/auth') at the top of your test file
vi.mock('@/auth', () => ({
  auth: mockNextAuthSession('user-123'),
  signIn: vi.fn(),
  signOut: vi.fn(),
}));

it('returns user data', async () => {
  const response = await GET(req);
  expect(response.status).toBe(200);
});
```

### Worker Jobs

Jobs are tested by calling their `run()` function with a mock context:

```typescript
import { runSnapshots } from '../src/jobs/snapshots';
const result = await runSnapshots({ log: mockLogger, signal: ac.signal });
expect(result.processed).toBeGreaterThan(0);
```

### Env Validation

Test that env parsers reject bad config and accept valid config:

```typescript
it('throws when DATABASE_URL is missing in production', () => {
  expect(() => loadEnv({ NODE_ENV: 'production' })).toThrow(/DATABASE_URL/);
});

it('allows missing DATABASE_URL in development (PGlite mode)', () => {
  const env = loadEnv({ NODE_ENV: 'development' });
  expect(env.NODE_ENV).toBe('development');
});
```

### SignalR Consumer

Tests use a fake connection builder that returns a mock hub:

```typescript
const consumer = new SignalRConsumer({
  hubUrl: 'https://fake/hub',
  onTick: vi.fn(),
  buildConnection: async () => mockConnection,
  log: mockLogger,
});
await consumer.start();
```

### Schema Validation (shared)

Test that Zod schemas accept valid data and reject invalid data:

```typescript
import { CandleSchema } from '../src';

it('accepts a valid candle', () => {
  const result = CandleSchema.safeParse(validCandle());
  expect(result.success).toBe(true);
});

it('rejects a candle with negative price', () => {
  const result = CandleSchema.safeParse({ ...validCandle(), o: -1 });
  expect(result.success).toBe(false);
});
```

## AI Eval Harness

Manual eval via CLI (not in CI):

```bash
pnpm --filter @hamafx/ai eval -- \
  --base-url http://localhost:3000 \
  --cookie "authjs.session-token=..." \
  --cases \
  --out docs/eval
```

15 acceptance prompts in `packages/ai/src/eval/cases.json`. Each prompt specifies expected tools and forbidden tools. The runner creates a fresh thread per prompt, POSTs to `/api/chat`, captures the SSE stream, and writes a markdown report.

### Case Format

```json
{
  "label": "Get gold price",
  "prompt": "What is XAUUSD trading at?",
  "expectedTools": ["get_price"],
  "forbiddenTools": ["analyze_fundamental"],
  "mustContainSubstrings": []
}
```

## E2E Testing (Playwright)

```bash
pnpm --filter @hamafx/web exec playwright test
```

E2E tests in `apps/web/tests/e2e/` (16 spec files):
- `auth.spec.ts` — login flow, unauthenticated redirect
- `chat.spec.ts` — chat interaction, streaming
- `chat-ui.spec.ts` — chat UI component testing
- `settings.spec.ts` — settings page, API keys
- `isolation.spec.ts` — multi-tenant data isolation
- `multi-agent.spec.ts` — committee deliberation
- `service-worker.spec.ts` — PWA offline
- `navigation.spec.ts` — all routes load without errors
- `dashboard.spec.ts` — dashboard widget rendering
- `responsive.spec.ts` — mobile viewport, no horizontal scroll
- `accessibility.spec.ts` — labels, landmarks, headings, skip link
- `api-health.spec.ts` — API endpoint smoke tests
- `theme-tokens.spec.ts` — theme and design tokens
- `admin-dashboard.spec.ts` — admin dashboard pages
- `nav-drawer.spec.ts` — navigation drawer functionality
- `onboarding-replay.spec.ts` — onboarding wizard replay

Playwright config: `apps/web/playwright.config.ts`. Traces saved on first retry.

## What to Test When Adding Features

1. **New AI tool**: Test the execute function. Test that telemetry records. Test input validation.
2. **New API route**: Integration test with HTTP request. Test NextAuth session mock (200 with session, 401 without). Test error responses.
3. **New provider**: Test map/transform functions. Test empty response handling. Test error handling.
4. **New DB schema**: Test that migrations apply cleanly. Test CRUD operations using `withIsolatedTx`.
5. **New worker job**: Test the run function. Test idempotency. Test abort signal handling.
6. **New admin route**: Mock `getAdminUser()` and test 200/401/403 responses. Use `fetchCsrf` for POSTs.
7. **New logging/diagnostics feature**: Test that log lines include `category`, structured errors include `error.name/code/stack`, and diagnostic traces are persisted.

## Admin API Testing

Admin routes live under `/api/admin/*` and are gated by `withAdminAuth()`. When testing them:

1. Mock `getAdminUser()` so it returns a valid admin.
2. Test both the happy path and the 403/401 rejection paths.
3. Use `fetchCsrf` for POST requests — admin routes require CSRF tokens.

Example:

```typescript
import { describe, it, expect, vi } from 'vitest';
import { GET } from '../app/api/admin/users/route';
import { fetchCsrf } from '@/lib/csrf';
import * as adminAuth from '@/lib/admin-auth';

vi.mock('@/lib/admin-auth', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/admin-auth')>();
  return {
    ...actual,
    getAdminUser: vi.fn(() => Promise.resolve({
      admin: { userId: 'admin-123', email: 'admin@example.com', name: 'Admin' },
      reason: 'authenticated',
    })),
  };
});

beforeEach(() => {
  vi.clearAllMocks();
});

describe('GET /api/admin/users', () => {
  it('returns a paginated user list for admins', async () => {
    const res = await GET(new Request('http://localhost/api/admin/users'));
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json).toHaveProperty('users');
    expect(json).toHaveProperty('total');
  });

  it('returns 401 when unauthenticated', async () => {
    vi.mocked(adminAuth.getAdminUser).mockResolvedValueOnce({
      admin: null,
      reason: 'unauthenticated',
    });
    const res = await GET(new Request('http://localhost/api/admin/users'));
    expect(res.status).toBe(401);
  });

  it('returns 403 for non-admin users', async () => {
    vi.mocked(adminAuth.getAdminUser).mockResolvedValueOnce({
      admin: null,
      reason: 'forbidden',
    });
    const res = await GET(new Request('http://localhost/api/admin/users'));
    expect(res.status).toBe(403);
  });
});

describe('POST /api/admin/onboarding/reset', () => {
  it('resets onboarding for admins', async () => {
    const res = await fetchCsrf('/api/admin/onboarding/reset', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ mode: 'soft' }),
    });
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.ok).toBe(true);
    expect(json.reset).toBe(true);
  });
});
```

## Logging & Diagnostics Testing

The shared logger in `packages/shared/src/logger.ts` and diagnostic trace persistence in `packages/ai/src/diagnostics/trace-persistence.ts` should be tested for:

- `createCategorizedLogger()` adds `category` to every log line.
- `logErrorContext()` enriches errors with `error.name`, `error.message`, `error.code`, `error.stack`, `file`, `line`, and `traceId`.
- `logForAgent()` emits `agentLog: true`.
- Diagnostic traces are persisted to `diagnostic_traces` after `withDiagnostics()` completes.
- `DEBUG_TRACE_PATH` writes trace JSON files when set.
- Trace persistence failures do not block the chat turn.

Example:

```typescript
import { createCategorizedLogger, logErrorContext } from '@hamafx/shared';

describe('createCategorizedLogger', () => {
  it('adds category to log lines', () => {
    const log = createCategorizedLogger('ai');
    // Use a spy or pino destination to assert the emitted object has category: 'ai'
  });
});

describe('logErrorContext', () => {
  it('includes structured error info', () => {
    const err = new Error('boom');
    // Assert log output contains error.name, error.message, etc.
  });
});
```

## Best Practices

1. **Mock at boundaries** — mock external providers, not internal modules. Use dependency injection over global mocks.
2. **Test tools directly** — test `get_price.execute()` not the chat agent that calls it.
3. **Avoid `vi.mock` hoisting for local imports** — prefer `vi.hoisted` for factory variables.
4. **Use `-- --run` in CI** — prevents watch mode from hanging.
5. **Clean up env vars** — use `afterEach` to delete test environment variables so they don't bleed.
6. **Prefer `withIsolatedTx` for DB tests** — wraps in a transaction that auto-rolls back.
7. **Mark jsdom tests explicitly** — add `// @vitest-environment jsdom` at the top of the file.
8. **Keep tests fast** — avoid network calls, real timers, and file I/O in unit tests.

## CI

`.github/workflows/ci-fast.yml` runs on every PR and push to main:
1. `lint-and-typecheck`: `pnpm turbo run lint typecheck`
2. `unit-tests`: `pnpm turbo run test`

`.github/workflows/ci-slow.yml` runs nightly and on main:
3. `e2e-tests`: Playwright tests
4. Coverage report

15-minute timeout. No deploy step (Vercel handles that). No eval step (manual only).
