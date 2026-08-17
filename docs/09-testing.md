# 09 — Testing & E2E

> Comprehensive guide to the test infrastructure, patterns, E2E suite, and AI eval harness.

---

## Overview

207 test files, ~2,019 `it` blocks across all packages (including 16 E2E spec files). Vitest is the test runner for unit/integration tests; Playwright handles E2E testing. The `@kestrel/test-utils` package provides shared factories, mocks, and vitest helpers. Tests use the `--run` flag to avoid watch mode (otherwise timeouts in CI/automation).

## Running Tests

```bash
# All packages
pnpm turbo run test -- --run

# Single package
pnpm --filter @kestrel/worker test -- --run
pnpm --filter @kestrel/ai test -- --run
pnpm --filter @kestrel/data test -- --run
pnpm --filter @kestrel/web test -- --run

# With coverage
pnpm --filter @kestrel/web test -- --run --coverage

# Watch mode (dev only)
pnpm --filter @kestrel/indicators test

# E2E (Playwright)
pnpm --filter @kestrel/web exec playwright test
```

## Package Test Layout

| Package | Test Files | Key Areas |
|---------|-----------|-----------|
| `ai` | 78 | Tools, routing, verification, planner, committee, alerts, briefings, memory, cost, diagnostics, budget, retry-loop, contract tests, budget-guard, thread-state |
| `data` | 19 | Provider maps, rest endpoints, candles, live-ticks, news adapter, price adapter, throttle, failover, chaos, cache, to-candle mapper, storage, cache-index |
| `db` | 14 | Schema validation, migration chain, phase migrations, rate-limit, user-scope, isolated DB, hash stability |
| `indicators` | 16 | SMC swings, structure, FVG, order blocks, liquidity, RSI, EMA, SMA, MACD, asian-range, defaults, pdh-pdl, registry |
| `shared` | 11 | Env validation, error types, encryption, market phase, logger, bug-report, biquote, error-patterns, tool-io, billing-features | 65% |
| `worker` | 19 | SignalR consumer, reconnect, tick buffer, candle aggregator, env, jobs, scheduler, cron-lock, briefings, cot, review |
| `web` | 45 unit + 16 E2E | API integration, auth flow, CSRF, route health, settings actions, voice input, admin routes, middleware, hooks, Playwright E2E (auth, chat, chat-ui, settings, isolation, multi-agent, service-worker, navigation, dashboard, responsive, accessibility, api-health, theme-tokens, admin-dashboard, nav-drawer, onboarding-replay) |
| `test-utils` | 6 | Factories (users, candles, threads), mocks (llm, fetch), helpers (vitest) — self-tested as of July 2026 |

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
import { withIsolatedTx } from '@kestrel/db/test-utils';

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
pnpm --filter @kestrel/ai eval -- \
  --base-url http://localhost:3000 \
  --cookie "authjs.session-token=..." \
  --cases \
  --out docs/eval
```

The checked-in acceptance dataset in `packages/ai/src/eval/cases.json` covers tools, Quick/Standard/Full/Single modes, all four specialists, the Decision stage, and strict Full-mode failure semantics. Each prompt can specify expected tools, agent lifecycle/status assertions, terminal status, structured numeric outputs, grounding requirements, safety substrings, and latency/cost ceilings. The runner creates a fresh thread per prompt, POSTs to `/api/chat`, captures the SSE stream, and writes a scored markdown report with transport, assertion, terminal-status, agent-coverage, timing, and reported-cost data. Expected terminal failures are valid cases; unexpected stream failures remain transport failures.

### Case Format

```json
{
  "id": "risk-sizing",
  "prompt": "Size a 1% risk long on XAUUSD.",
  "expectedTools": ["compute_risk"],
  "forbiddenTools": ["analyze_fundamental"],
  "expectedTerminalStatus": "complete",
  "expectedToolOutputs": [
    { "tool": "compute_risk", "path": "riskUsd", "value": 50, "tolerance": 0.01 }
  ],
  "quality": {
    "requireNumericToolSupport": true,
    "forbiddenOutputSubstrings": ["guaranteed profit"],
    "maxTtftMs": 45000,
    "maxTotalMs": 55000,
    "maxCostUsd": 0.25
  },
  "mustContainSubstrings": ["XAUUSD"]
}
```

### Evaluation dataset and scoring

`packages/ai/src/eval/cases.json` is the versioned acceptance dataset. It
covers tool selection, Quick/Standard/Full/Single modes, all four specialists,
the Decision stage, and strict Full-mode terminal failures. `--cases` reports transport, assertion, terminal-status, and agent-coverage
rates, plus per-case TTFT, total latency, server metadata cost, and quality
failures. Quality fields include `expectedToolOutputs` for numeric oracle
checks, `requireNumericToolSupport` / `requireEventToolSupport` for grounding,
`forbiddenOutputSubstrings` / `requiredOutputSubstrings` for safety contracts,
and `maxTtftMs` / `maxTotalMs` / `maxCostUsd` for performance and spend
regressions. Expected failures must be declared with
`expectedTerminalStatus: "failed"`, while unexpected failures still produce a
non-zero result.

The optional `pnpm eval:publish` command publishes only prompts and expected
metadata to a Langfuse dataset. It never uploads user conversations or model
outputs and requires explicit Langfuse credentials.

### Reviewable training records

`@kestrel/ai/eval/training-export` provides `buildTrainingRecords()` and
`writeTrainingExport()` for a vendor-neutral JSONL contract. By default records
contain only prompt/output hashes, tool names, quality assertion kinds,
terminal state, latency, and cost; prompts, tool arguments, and model output
are omitted. Including assistant text requires both `includeAssistantText: true`
and an explicit `approvedBy` identity, and supports reviewer annotations
(`pass`, `fail`, or `needs_review`).This makes dataset review and provenance explicit before any record is sent to a training or fine-tuning system.

### Production feedback and dataset governance

Assistant messages expose authenticated thumbs-up/thumbs-down controls at:
`/api/chat/threads/:threadId/messages/:messageId/feedback`. Feedback is scoped
by both user and thread ownership, upserted idempotently per user/message, and
stores only the rating, optional user note, and trace correlation — not a copy
of the conversation. Admins can triage the queue from the **Feedback** tab,
assign a reviewer label (`pass`, `fail`, or `needs_review`), classify issues
(`hallucination`, `wrong_number`, `bad_tool_choice`, `unsafe_advice`,
`bad_citation`, `poor_reasoning`, or `other`), and save an auditable review.

Dataset manifests are content-addressed with `contentSha256` and registered
through the admin dataset registry. Lifecycle is intentionally explicit:
`draft → in_review → approved → archived`. The registry stores record count,
source, provenance, creator, approver, and timestamps, while the export writer
creates a `${path}.manifest.json` sidecar. A governed export must not contain
`needs_review` records, and assistant text requires explicit `approvedBy`.
The **Datasets** admin tab exposes lifecycle transitions without exposing raw
prompts or model output. Governed exports must provide an explicit annotation
for every record, may assign deterministic `train`, `validation`, and `test`
splits, and reject approved assistant text containing email, phone, or
credential patterns after redaction.

### Unmocked staging system flow

The normal Playwright suite uses mocked chat responses for deterministic UI
coverage. The opt-in `tests/e2e/real-system.spec.ts` deliberately does not
mock `/api/chat` or Full-mode polling. Run it only against an isolated staging
application with a real database, configured model provider, and running
worker:

```bash
KESTREL_REAL_E2E=true \
PLAYWRIGHT_BASE_URL=https://staging.example.com \
DATABASE_URL=... AUTH_SECRET=... ENCRYPTION_SECRET=... \
pnpm --filter @kestrel/web exec playwright test tests/e2e/real-system.spec.ts
```The manual GitHub workflow `.github/workflows/e2e-staging.yml` performs the same run after applying migrations and reads credentials only from the
`staging` environment. It must never target production.

### SLO alert delivery

`/api/health/alerts` remains a read-only machine-readable monitor endpoint and
returns `503` for degraded or unhealthy reliability signals. The authenticated
`/api/cron/health-alerts` route evaluates the same snapshot and optionally sends
a sanitized vendor-neutral webhook when `HEALTH_ALERT_WEBHOOK_URL` is set.
`HEALTH_ALERT_WEBHOOK_TOKEN` adds a bearer credential and
`HEALTH_ALERT_WEBHOOK_TIMEOUT_MS` bounds delivery latency. Webhook failures are
logged but do not change the health computation or expose request content.
Configure an external scheduler to call the cron route with `CRON_SECRET`; keep
the webhook URL and token in staging/production secret storage only.

## E2E Testing (Playwright)

The primary E2E workflow is local and does not require GitHub Actions. Use the
bounded shard runner so a connection/session interruption does not discard
completed shard results:

```bash
# Four sequential Chromium shards; logs and summary go to artifacts/e2e-local/
pnpm test:e2e:local

# Smaller bounded run while debugging a feature
pnpm test:e2e:local -- --shards=2 --project=chromium --grep="Multi-Agent"

# Inspect the machine-readable result
cat artifacts/e2e-local/summary.json

# Run only shard 3/4; useful when a previous connection ended mid-run
pnpm test:e2e:local -- --shards=4 --only-shard=3
```

Each shard writes `shard-N-of-M.log` and the runner stops at the first failed
shard. Rerun only the failed shard directly when debugging:

```bash
pnpm --filter @kestrel/web exec playwright test \\
  --project=chromium --shard=3/4
```

The unsharded command remains available for small runs:

```bash
pnpm --filter @kestrel/web exec playwright test --project=chromium
```

The GitHub workflow files are optional CI mirrors; they are not required for
local or staging verification.

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
import { createCategorizedLogger, logErrorContext } from '@kestrel/shared';

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
9. **Use shared factories** — `@kestrel/test-utils` provides `makeUser`, `makeCandles`, `makeThread`, etc.
10. **Test factories and mocks** — `@kestrel/test-utils` has its own test suite ensuring factory correctness.

## Snapshot Testing

Vitest snapshot testing is available for complex output shapes that are tedious to
assert field-by-field. Use `toMatchSnapshot()` for stable, deterministic outputs:

```typescript
import { describe, expect, it } from 'vitest';

describe('Candle formatting', () => {
  it('produces consistent candle array structure', () => {
    const candles = makeCandles([100, 102, 105]);
    // Snapshot captures the full shape — open/high/low/close/timestamps/etc.
    expect(candles).toMatchSnapshot();
  });
});
```

**When to use snapshots:**
- Complex DTO shapes with nested fields (tool outputs, API responses)
- Regression tests for data transformations (candle mapping, indicator calculations)
- UI rendering output that's tedious to assert field-by-field

**When NOT to use snapshots:**
- Values that change per run (timestamps, UUIDs, random data)
- Simple scalar assertions (use `toBe`, `toEqual`)
- Tests that need to communicate intent (snapshots hide expected values)

Snapshots are stored in `__snapshots__/` directories next to test files. Review
snapshot diffs in PR reviews to catch unintended output changes.

## Contract Testing (LSP Compliance)

Use `describe.each` with a registry of implementations to verify that every subclass
satisfies its base contract:

```typescript
import { describe, it, expect } from 'vitest';

// PF-12 — verify every BaseAgent subclass satisfies the specialist contract
const ALL_SPECIALISTS: BaseAgent[] = [
  new TechnicalAgent(),
  new FundamentalAgent(),
  new RiskAgent(),
  new SentimentAgent(),
];

describe.each(ALL_SPECIALISTS.map((a) => ({ agent: a, name: a.constructor.name })))(
  '$name',
  ({ agent }) => {
    it('has a valid AgentName', () => {
      expect(VALID_AGENT_NAMES).toContain(agent.name);
    });

    it('tools() returns a non-empty Record', () => {
      expect(Object.keys(agent.tools()).length).toBeGreaterThan(0);
    });

    it('parseOutput() handles valid JSON input', () => {
      const result = agent.parseOutput(JSON.stringify({
        bias: 'bullish', confidence: 0.85, reasoning: '...',
      }));
      expect(result.bias).toMatch(/^(bullish|bearish|neutral)$/);
    });
  },
);
```

This pattern guarantees that adding a new agent implementation won't silently
violate the contract — the test suite will fail until the new class satisfies
every `it` block in the table.

See `packages/ai/test/base-agent-contract.test.ts` for the canonical example.

## CI

Three-tier CI pipeline:

### ci-fast.yml (optional every-PR mirror)
1. `lint-and-typecheck`: ESLint + TypeScript + `pnpm audit --audit-level=critical` + build + bundle analysis
2. `unit-tests`: `pnpm turbo run test -- --coverage` + empty-guard + coverage report
3. `e2e-tests`: Playwright (2-way shard), blob/JUnit reports, failure artifacts

For repositories without GitHub Actions access, `pnpm test:e2e:local` is the
supported equivalent for the E2E portion.

### ci-slow.yml (push to main + nightly)
1. `lint-and-typecheck`: Full lint + typecheck
2. `unit-tests`: Full suite with coverage
3. `e2e-tests`: Playwright (4-way shard for faster execution)
4. `nightly-eval`: AI eval harness (schedule only)

### loadtest.yml (nightly 3 AM UTC + manual dispatch)
k6 smoke + average-load tests against a throwaway Docker SUT. **Never gates PRs.**

Concurrency is managed via `cancel-in-progress: true` across all workflows.
All workflows use `pnpm install --frozen-lockfile` for reproducible installs.
30-minute timeouts on E2E, 60-minute on load tests.

## Load & Performance Testing (k6)

Backend HTTP load testing is handled by [Grafana k6](https://grafana.com/docs/k6/),
a separate, standalone TypeScript project under `loadtest/`. It is **not** part of
the pnpm workspace and talks to the running app only over HTTP.

k6 fills the gap between Vitest (correctness), Playwright (UX), and Lighthouse
(front-end vitals) by answering: *how many concurrent users can the API sustain?*

### Quick Start

```bash
cd loadtest
npm install
npm run typecheck

# Strategy A (legacy bypass, simplest)
docker compose -f docker-compose.loadtest.yml up -d --wait
k6 run -e K6_BASE_URL=http://localhost:3000 -e K6_AUTH_MODE=legacy tests/smoke-read-mix.ts
```

### Test Types

| Type | Purpose | CI |
|---|---|---|
| Smoke | Validate script + SUT wiring | Nightly |
| Average-load | Baseline latency SLOs (p95/p99) | Nightly |
| Stress | Find the throughput ceiling | Manual only |
| Spike | Surge → recovery validation | Manual only |
| Soak | Memory/resource leak detection (hours) | Manual only |
| Chat | LLM streaming latency (guarded) | Manual only |

### CI

`.github/workflows/loadtest.yml` runs smoke + average-load nightly at 3 AM UTC.
All other test types are `workflow_dispatch` only. k6 **never gates PRs**.

Full documentation: [`loadtest/README.md`](../loadtest/README.md).

### Auth Strategies

- **Strategy A (legacy)**: `AUTH_MODE=legacy`, single synthetic user, no cookies/CSRF.
  Rate limits lifted in the throwaway SUT. Best for local throughput profiling.
- **Strategy B (session)**: real NextAuth sessions for N seeded users, distributing
  load across users so per-user rate limits reflect reality.

### Out of Scope

The worker (`apps/worker`) is not an end-user HTTP server; it cannot be load-tested
via k6. Worker load is *indirect* (DB write pressure from tick volume). A separate
harness would be needed for worker load characterization.
