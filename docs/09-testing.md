# 09 — Testing

## Overview

64 test files, ~350 test cases across all packages. Vitest is the test runner. Tests use the `--run` flag to avoid watch mode (otherwise timeouts in CI/automation). The `@hamafx/config` package provides shared vitest configurations.

## Running Tests

```bash
# All packages
pnpm turbo run test -- --run

# Single package
pnpm --filter @hamafx/worker test -- --run
pnpm --filter @hamafx/ai test -- --run
pnpm --filter @hamafx/data test -- --run

# With coverage
pnpm --filter @hamafx/web test -- --run --coverage

# Watch mode (dev only)
pnpm --filter @hamafx/indicators test
```

## Package Test Layout

| Package | Test Files | Key Areas |
|---------|-----------|-----------|
| `ai` | 15+ | Tools, routing, verification, planner, committee, alerts, briefings, memory, cost |
| `data` | 10+ | Provider maps, rest endpoints, candles, live-ticks, news adapter, price adapter, throttle |
| `db` | 3 | Schema validation, locks, smoke tests |
| `indicators` | 8 | SMC swings, structure, FVG, order blocks, liquidity. Classic indicators (RSI, EMA, SMA) |
| `shared` | 4 | Env validation, error types, symbols, timeframes, biquote schemas |
| `worker` | 16 | SignalR consumer, reconnect, tick buffer, candle aggregator, env, jobs (briefings, snapshots, cot, weekly-review), live-ticks flush |
| `web` | 6 | API integration tests (login, market, signals, security), unit tests |

## Test Patterns

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
it('throws when neither DATABASE_URL nor POSTGRES_URL is set in production', () => {
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

## AI Eval Harness

Manual eval via CLI (not in CI):

```bash
pnpm --filter @hamafx/ai eval -- \
  --base-url http://localhost:3000 \
  --cookie "hfx_auth=..." \
  --cases \
  --out docs/eval
```

15 acceptance prompts in `packages/ai/src/eval/cases.json`. Each prompt specifies expected tools and forbidden tools. The runner creates a fresh thread per prompt, POSTs to `/api/chat`, captures the SSE stream, and writes a markdown report.

### Case format

```json
{
  "label": "Get gold price",
  "prompt": "What is XAUUSD trading at?",
  "expectedTools": ["get_price"],
  "forbiddenTools": ["analyze_fundamental"],
  "mustContainSubstrings": []
}
```

## What to Test When Adding Features

1. **New AI tool**: Test the execute function. Test that telemetry records. Test input validation.
2. **New API route**: Integration test with HTTP request. Test auth (200 with cookie, 401 without). Test error responses.
3. **New provider**: Test map/transform functions. Test empty response handling. Test error handling.
4. **New DB schema**: Test that migrations apply cleanly. Test both Postgres and PGlite. Test CRUD operations.
5. **New worker job**: Test the run function. Test idempotency. Test abort signal handling.

## CI

`.github/workflows/ci.yml` runs on every PR and push to main:
1. `pnpm install --frozen-lockfile`
2. `pnpm turbo run lint`
3. `pnpm turbo run typecheck`
4. `pnpm turbo run test`

15-minute timeout. No deploy step (Vercel handles that). No eval step (manual only).