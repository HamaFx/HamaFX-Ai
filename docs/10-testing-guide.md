# 10 — Testing Guide

## How to Write a Unit Test

Every test file lives in a `test/` directory at the package root or next to the source file it tests. Use `vitest` globals (`describe`, `it`, `expect`) — they are auto-imported.

### Basic structure

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

### Real example (pure function — indicators)

Test the execute function directly, not through the agent:

```typescript
import { detectStructure } from '../src/smc/structure';
import { findSwings } from '../src/smc/swings';

function bar(i: number, o: number, h: number, l: number, c: number): Candle {
  return { symbol: 'XAUUSD', tf: '1h', t: i * 3_600_000, o, h, l, c, v: null, source: 'test', fetchedAt: 0 };
}

describe('detectStructure', () => {
  it('emits a bullish BOS when price closes above a confirmed swing high', () => {
    const candles = [
      bar(0, 1, 1.5, 0.5, 1.2),
      bar(1, 1.2, 2.0, 1.0, 1.8),
      bar(2, 1.8, 3.0, 1.5, 2.5),
      bar(3, 2.5, 5.0, 2.0, 4.0),
    ];
    const swings = findSwings(candles, { lookback: 2 });
    const events = detectStructure(candles, swings);
    expect(events.some((e) => e.kind === 'bos' && e.direction === 'bullish')).toBe(true);
  });
});
```

### Real example — schema validation (shared)

Test that Zod schemas accept valid data and reject invalid data:

```typescript
import { CandleSchema } from '../src';

function validCandle(overrides?: Record<string, unknown>) {
  return { symbol: 'EURUSD', tf: '1h', t: 1748378101000, o: 1.1628, h: 1.1661, l: 1.1622, c: 1.1650, v: 0, source: 'twelve-data', fetchedAt: 1748378102000, ...overrides };
}

describe('CandleSchema', () => {
  it('accepts a valid candle', () => {
    expect(() => CandleSchema.parse(validCandle())).not.toThrow();
  });
  it('rejects missing required fields', () => {
    const { symbol: _, ...rest } = validCandle();
    expect(() => CandleSchema.parse(rest)).toThrow();
  });
});
```

---

## Using @hamafx/test-utils Factories

The `@hamafx/test-utils` package provides factory functions, mocks, and helpers used across all test suites.

### Factories

```typescript
import { makeCandles, makeTicks } from '@hamafx/test-utils/factories/candles';
import { makeUser, makeSession } from '@hamafx/test-utils/factories/users';
import { makeThread, makeMessage } from '@hamafx/test-utils/factories/threads';

// Candles — pass an array of closing prices, get back Candle[]
const candles = makeCandles([1.1, 1.2, 1.15, 1.3], { symbol: 'EURUSD', tf: '15m' });

// Ticks — pass an array of mid prices
const ticks = makeTicks([2390.12, 2390.45, 2390.33]);

// Users — auto-incrementing IDs
const user = makeUser({ role: 'admin' });
const session = makeSession(user.id); // returns { user, expires }

// Threads & messages
const thread = makeThread({ pinnedSymbol: 'XAUUSD' });
const message = makeMessage({ threadId: thread.id, role: 'user', content: 'What is gold at?' });
```

### Mocks

```typescript
import { createMockLlm } from '@hamafx/test-utils/mocks/llm';
import { createTestDb } from '@hamafx/test-utils/mocks/db';
import { createMockFetch } from '@hamafx/test-utils/mocks/fetch';

// Mock LLM — pre-configure responses for AI SDK calls
const llm = createMockLlm();
llm.addResponse({ content: 'The price of gold is $2,400', finishReason: 'stop' });

// Mock fetch — intercept HTTP requests
const fetchMock = createMockFetch();
fetchMock.mockResponse(/api\.example\.com/, { data: 'mocked' });
globalThis.fetch = fetchMock.handler;
// Check what was called:
fetchMock.getCallHistory(); // [{ url, method }, ...]
fetchMock.reset();

// In-memory PGlite database
const db = await createTestDb();
await db.exec('CREATE TABLE test (id INT)');
const result = await db.query('SELECT * FROM test');
await db.close();
```

### Helpers

```typescript
import { setupTestEnvironment, installServerOnlyStub, freezeTime } from '@hamafx/test-utils/helpers/vitest';

// Set env vars for a test
setupTestEnvironment({ DATABASE_URL: 'postgres://...', NODE_ENV: 'test' });

// Stub Next.js `server-only` module
installServerOnlyStub();

// Freeze time for deterministic tests
freezeTime(1_700_000_000_000);
```

---

## Running Tests

All test commands use `pnpm` and `turbo`:

```bash
# Run all tests (CI mode — no watch)
pnpm test

# Watch mode (dev only — re-runs on changes)
pnpm test:watch

# With coverage report
pnpm test:coverage

# E2E tests (Playwright)
pnpm test:e2e

# Single package
pnpm test:web
pnpm test:ai
pnpm test:shared

# Filter within a package (Vitest —test-name-pattern)
pnpm --filter @hamafx/indicators test -- --run --test-name-pattern "detectStructure"
```

### Per-package equivalents

```bash
pnpm --filter @hamafx/worker test -- --run
pnpm --filter @hamafx/data test -- --run
pnpm --filter @hamafx/db test -- --run
pnpm --filter @hamafx/indicators test -- --run
```

**Important:** Always pass `-- --run` in CI or automation scripts to prevent Vitest from entering watch mode.

---

## Coverage Thresholds per Package

| Package | Statements | Branches | Functions | Lines |
|---------|-----------|----------|-----------|-------|
| `web` | 10% | 10% | 10% | 10% |
| `worker` | 40% | 70% | 80% | 40% |
| `ai` | 20% | 40% | 35% | 20% |
| `data` | 60% | 60% | 60% | 60% |
| `indicators` | 70% | 70% | 70% | 70% |
| `shared` | 50% | 50% | 50% | 50% |
| `db` | 50% | 50% | 50% | 50% |

Configured in each package's `vitest.config.ts` under `test.coverage.thresholds`.

---

## Route Handler Tests (using ntarh)

Use `next-test-api-route-handler` (`ntarh`) to test Next.js App Router route handlers with full request/response lifecycle, including NextAuth session mocking.

```typescript
import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest';

const mockDbExecute = vi.hoisted(() => vi.fn());
vi.mock('@hamafx/db', () => ({
  getDb: vi.fn(() => ({ execute: mockDbExecute })),
}));

import { GET } from '@/app/api/health/route';

beforeEach(() => {
  process.env.DATABASE_URL = 'test-db-url';
  process.env.CRON_SECRET = 'test-secret';
});

afterEach(() => {
  vi.clearAllMocks();
});

describe('GET /api/health', () => {
  it('returns 200 when all checks pass', async () => {
    mockDbExecute.mockResolvedValue([{ extname: 'vector', recent: '42', stuck: '0' }]);
    const response = await GET();
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.status).toBe('ok');
  });

  it('returns 503 when db check fails', async () => {
    mockDbExecute.mockRejectedValue(new Error('connection refused'));
    const response = await GET();
    expect(response.status).toBe(503);
    const body = await response.json();
    expect(body.checks.db.ok).toBe(false);
  });
});
```

For routes requiring authentication, use the session helpers:

```typescript
import { mockSession } from '@hamafx/web/test/auth-helpers';

it('returns 401 when unauthenticated', async () => {
  mockSession(null);
  const req = new Request('http://localhost/api/market/price');
  const response = await GET(req);
  expect(response.status).toBe(401);
});
```

---

## Component Tests (RTL)

Component tests use `@testing-library/react` with a `jsdom` environment. Mark the file with the `@vitest-environment jsdom` pragma.

```typescript
// @vitest-environment jsdom

import React from 'react';
import { afterEach, describe, it, expect } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { EmptyState } from '@/components/ui/empty-state';

afterEach(cleanup);

describe('EmptyState', () => {
  it('renders title and description', () => {
    render(<EmptyState icon={<span data-testid="icon">🔍</span>} title="No data" description="Nothing here yet." />);
    expect(screen.getByText('No data')).toBeTruthy();
    expect(screen.getByText('Nothing here yet.')).toBeTruthy();
  });

  it('renders with role="status" and correct aria-label', () => {
    render(<EmptyState icon={<span>x</span>} title="No results" />);
    const el = screen.getByRole('status');
    expect(el.getAttribute('aria-label')).toBe('No results');
  });

  it('applies additional className', () => {
    const { container } = render(<EmptyState icon={<span>x</span>} title="Empty" className="my-class" />);
    expect(container.querySelector('[role="status"]')!.classList.contains('my-class')).toBe(true);
  });
});
```

### Testing hooks

Test custom hooks via `renderHook`:

```typescript
import { renderHook, act } from '@testing-library/react';
import { useLocalStorage } from '@/hooks/use-local-storage';

describe('useLocalStorage', () => {
  it('returns the default value when nothing is stored', () => {
    const { result } = renderHook(() => useLocalStorage('key', 'default'));
    expect(result.current[0]).toBe('default');
  });
});
```

---

## Test File Naming Conventions

| Pattern | Example | When to Use |
|---------|---------|-------------|
| `*.test.ts` | `candle-1m.test.ts` | Default for all unit/integration tests |
| `*.test.tsx` | `empty-state.test.tsx` | React component or hook tests |
| `src/**/*.test.ts` | `noise-control.test.ts` | Inline test next to source (used in `ai` package) |
| `*.test-e2e.ts` | `auth-flow.test-e2e.ts` | Playwright E2E tests (in `apps/web/e2e/`) |

Test files should be placed:
- **Packages** (`packages/*`): in a `test/` directory at the package root
- **Web app** (`apps/web`): in `apps/web/test/`
- **Worker** (`apps/worker`): in `apps/worker/test/`
- **Inline tests**: next to the source file (only used in `packages/ai` for tightly coupled tests)

---

## Best Practices

1. **Mock at boundaries** — mock external providers, not internal modules. Use dependency injection over global mocks.
2. **Test tools directly** — test `get_price.execute()` not the chat agent that calls it.
3. **Avoid `vi.mock` hoisting for local imports** — prefer `vi.hoisted` for factory variables.
4. **Use `-- --run` in CI** — prevents watch mode from hanging.
5. **Clean up env vars** — use `afterEach` to delete test environment variables so they don't bleed.
6. **Prefer `withIsolatedTx` for DB tests** — wraps in a transaction that auto-rolls back (from `@hamafx/db/test-utils`).
7. **Mark jsdom tests explicitly** — add `// @vitest-environment jsdom` at the top of the file.
8. **Keep tests fast** — avoid network calls, real timers, and file I/O in unit tests.
