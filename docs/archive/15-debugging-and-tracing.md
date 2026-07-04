# 15 — Debugging & Tracing

## Overview

HamaFX-Ai has a multi-layer diagnostics system:

| Layer | Mechanism | Scope |
|-------|-----------|-------|
| **Diagnostic context** | `AsyncLocalStorage` via `withDiagnostics()` | Per chat-turn trace of steps, errors, timings |
| **Redaction** | `redactSecrets()` / `redactString()` | Auto-redacts API keys, tokens, passwords from traces |
| **Tool telemetry** | `withTelemetry()` wrapper | Per-tool DB rows (`chat_tool_telemetry`) with ms, ok, errorCode |
| **System diagnostics** | `get_system_diagnostics` tool | Agent-facing health check (DB, env, budget) |
| **API error envelope** | `formatErrorResponse()` | Standardised JSON error with code, message, details, requestId |
| **Sentry** | Sentry SDK | Production error aggregation (configured in apps/web) |
| **Playwright traces** | `trace: 'on-first-retry'` | E2E failure replays |

---

## 1. Capturing a Trace from Production

### Via the agent (`get_system_diagnostics`)

The agent has a built-in `get_system_diagnostics` tool that returns real-time operational health:

```
Tool: get_system_diagnostics
Input:  { verbose?: boolean, forceProbe?: boolean }
Output: { status, asOf, database, worker, budget, envCheck, narrative }
```

Ask the agent: *"Run get_system_diagnostics with verbose=true"*.

The output includes:
- `database.status` — `connected` or `error`
- `database.latencyMs` — query latency
- `database.journalEntriesCount` / `snapshotsCount` / etc. — table volumes
- `budget.remainingUsd` / `limitUsd` / `spentUsd`
- `envCheck` — boolean map of `FRED_API_KEY`, `GOOGLE_GENERATIVE_AI_API_KEY`, etc.
- `narrative` — human-readable summary

### Via the diagnostic context (`withDiagnostics`)

Every chat turn is automatically wrapped in a diagnostic context. Use the exported functions from `@hamafx/ai/diagnostics`:

```typescript
import {
  withDiagnostics,
  getDiagnosticContext,
  recordStep,
  completeStep,
  recordError,
  exportDiagnosticContext,
} from '@hamafx/ai/diagnostics';

// Wrap any async function:
const result = await withDiagnostics(userId, threadId, async () => {
  // All steps/errors recorded inside here are tracked
});
```

The context propagates through the entire async call chain via `AsyncLocalStorage`. Any tool called during the turn automatically records its own steps (see `with-telemetry.ts`).

### On unhandled errors

`agent.ts:125` catches errors, records them in the diagnostic context, and attaches the exported context to the error object:

```typescript
return withDiagnostics(userId, threadId, () => runChatInner(args)).catch((err) => {
  recordError(err);
  const diagCtx = exportDiagnosticContext();
  if (diagCtx && err instanceof Error) {
    (err as Error & { diagnosticContext?: unknown }).diagnosticContext = diagCtx;
  }
  throw err;
});
```

When this error reaches Sentry, the `diagnosticContext` property contains the full (redacted) trace.

---

## 2. Examining Diagnostics Context

### Inside a chat turn

```typescript
const ctx = getDiagnosticContext();
if (ctx) {
  console.log('Trace ID:', ctx.traceId);         // UUIDv4
  console.log('User ID:', ctx.userId);
  console.log('Steps:', ctx.steps.length);        // Array<DiagnosticStep>
  console.log('Errors:', ctx.errors.length);      // Array<DiagnosticError>
}
```

### DiagnosticStep shape

```typescript
interface DiagnosticStep {
  name: string;                                    // e.g. 'tool:get_price', 'chat_turn_start'
  status: 'started' | 'completed' | 'failed';
  durationMs?: number;                             // set on completion
  metadata?: Record<string, unknown>;              // auto-redacted
  timestamp: number;                               // epoch ms
}
```

### DiagnosticError shape

```typescript
interface DiagnosticError {
  message: string;                                 // redacted
  name: string;                                    // e.g. 'Error', 'AppError'
  stack?: string;                                  // redacted
  timestamp: number;
}
```

### Outside a diagnostic scope

`getDiagnosticContext()` returns `null`. All `recordStep`, `completeStep`, and `recordError` calls are no-ops outside a `withDiagnostics` scope.

### Serialised export

`exportDiagnosticContext()` returns a plain object (or `null` outside scope):

```typescript
{
  traceId: 'a1b2c3d4-...',
  userId: 'user-abc',
  threadId: 'thread-xyz',
  startedAt: 1719500000000,
  durationMs: 1247,
  steps: [ /* redacted DiagnosticStep[] */ ],
  errors: [ /* redacted DiagnosticError[] */ ],
}
```

---

## 3. Redaction Utilities

### How redaction works

The redaction engine in `packages/ai/src/diagnostics/redact.ts` operates at two levels:

**String-level (regex patterns):**
- Authorization headers: `authorization: Bearer xxx` → `authorization=<redacted>`
- URLs with embedded credentials: `https://user:pass@host` → `https://<redacted>:<redacted>@host`
- JSON keys: `"api_key": "sk-xxx"` → `"api_key": "<redacted>"`
- Key=value pairs: `api_key=sk-xxx` → `api_key=<redacted>`
- Bearer tokens, x-api-key headers, URLs containing token/key/secret/webhook

**Object-level (sensitive key detection):**
Keys matching `/api[_-]?key|access[_-]?token|secret|password|token|cookie/` (case-insensitive) have their values replaced with `'<redacted>'`.

Redaction happens automatically at record time. `exportDiagnosticContext()` also runs a final redaction pass.

### Checking for leaked secrets

Use the redaction utilities directly to verify that sensitive data is being caught:

```typescript
import { redactSecrets, redactString } from '@hamafx/ai/diagnostics';

// Test a string
redactString('api_key=sk-proj-abc123');
// → 'api_key=<redacted>'

// Test an object
redactSecrets({
  endpoint: '/api/data',
  token: 'ghp_abc123def456',
  metadata: { apiKey: 'sk-xyz' },
});
// → { endpoint: '/api/data', token: '<redacted>', metadata: { apiKey: '<redacted>' } }
```

### Verifying traces don't leak secrets

Add test assertions like those in `packages/ai/test/diagnostics.test.ts`:

```typescript
it('redacts sensitive metadata', async () => {
  await withDiagnostics('user-1', 'thread-1', async () => {
    recordStep('api_call', { api_key: 'sk-secret123', endpoint: '/data' });
    const ctx = getDiagnosticContext();
    expect(ctx!.steps[0]!.metadata!.api_key).toBe('<redacted>');
    expect(ctx!.steps[0]!.metadata!.endpoint).toBe('/data');
  });
});

it('redacts secrets from error messages', async () => {
  await withDiagnostics('user-1', 'thread-1', async () => {
    const err = new Error('api_key=sk-secret failed');
    recordError(err);
    const ctx = getDiagnosticContext();
    expect(ctx!.errors[0]!.message).not.toContain('sk-secret');
  });
});
```

To add a new redaction pattern, edit `REDACTION_PATTERNS` in `packages/ai/src/diagnostics/redact.ts`.

---

## 4. Playwright Trace Viewer

Playwright is configured in `apps/web/playwright.config.ts`:

```typescript
use: {
  baseURL: 'http://localhost:3000',
  trace: 'on-first-retry',  // captures trace only when a test retries
},
```

### Viewing traces

After a retried test failure, traces are saved to `test-results/`. View them with:

```bash
npx playwright show-trace test-results/<trace-name>/trace.zip
```

### Capturing traces on every run (local debugging)

Override the trace mode temporarily in `playwright.config.ts`:

```typescript
use: {
  trace: 'on',  // capture on every test run
}
```

Or pass via CLI:

```bash
pnpm --filter @hamafx/web exec playwright test --trace on
```

### Running E2E tests

```bash
pnpm --filter @hamafx/web test:e2e
```

The webServer config auto-starts `pnpm dev` before tests and reuses the server between runs (outside CI).

---

## 5. DEBUG_TRACE_PATH

> **Note:** The `DEBUG_TRACE_PATH` environment variable is **planned but not yet implemented** (see `plan-6-testing-debugging-system.md`). Once implemented, setting it will cause the diagnostic context to write a JSON trace file on every chat turn for offline inspection.

Currently, the closest equivalent is to log the exported context manually from code:

```typescript
const ctx = exportDiagnosticContext();
if (ctx) {
  // Write to stdout or a file for inspection
  console.log(JSON.stringify(ctx, null, 2));
}
```

---

## 6. Structured Log Output

### Diagnostic trace fields

The `RunDiagnosticContext` provides these trace identifiers:

| Field | Type | Description |
|-------|------|-------------|
| `traceId` | `string` (UUIDv4) | Generated once per `withDiagnostics` call |
| `userId` | `string` | Authenticated user ID |
| `threadId` | `string` | Chat thread ID |
| `startedAt` | `number` | Epoch ms when the context was created |
| `durationMs` | `number` | Computed on export |
| `steps` | `DiagnosticStep[]` | Ordered step trace |
| `errors` | `DiagnosticError[]` | Recorded errors |

### Tool telemetry (DB)

Every tool invocation records a row in `chat_tool_telemetry` via `withTelemetry()` in `packages/ai/src/tools/with-telemetry.ts`:

```typescript
void recordToolTelemetry({
  threadId: ctx?.threadId ?? null,
  messageId: null,
  tool: name,               // e.g. 'get_price', 'analyze_technical'
  ms: Date.now() - startedAt,
  ok: true,                 // or false on failure
  errorCode: errorCodeFor(err),  // on failure only
});
```

Query this table directly to audit tool usage:

```sql
SELECT tool, ok, ms, error_code, created_at
FROM chat_tool_telemetry
WHERE thread_id = 'thread-xyz'
ORDER BY created_at;
```

### Agent trace steps

Steps recorded in `agent.ts`:
- `chat_turn_start` — when `runChatInner` begins
- `persist_user_message` — after saving the user's message
- `fetch_history_and_snapshot` — loading thread history and building live snapshot
- `routing` — domain classification and plan decision
- `stream_text` — AI model invocation (with attempt number)

Tool steps recorded by `withTelemetry`:
- `tool:<name>` — each tool call, with `'started'` then `'completed'` or `'failed'`

---

## 7. Testing the Telemetry Pipeline Locally

### Running diagnostic tests

```bash
pnpm --filter @hamafx/ai test -- --run -t 'diagnostics'
```

This runs the 15 test cases in `packages/ai/test/diagnostics.test.ts` covering:
- Context propagation through nested async calls
- Step recording and completion
- Error recording with redaction
- Context serialisation via `exportDiagnosticContext`
- Edge cases (null/undefined errors, orphan steps, metadata merging)

### Testing tool telemetry

Tool telemetry tests live alongside each tool's test file. To verify telemetry is recording:

```bash
pnpm --filter @hamafx/ai test -- --run -t 'telemetry'
```

### Testing the error response format

```bash
pnpm --filter @hamafx/shared test -- --run -t 'formatErrorResponse'
```

---

## 8. Error Response Format

All API errors follow a consistent envelope defined in `packages/shared/src/errors.ts`:

### HTTP response shape

```json
{
  "error": {
    "code": "VALIDATION",
    "message": "Symbol is required",
    "details": { "field": "symbol" },
    "requestId": "req-abc123"
  }
}
```

### Error codes

| Code | HTTP Status | Used when |
|------|-------------|-----------|
| `VALIDATION` | 400 | Zod parse failure, missing required fields |
| `UNAUTHORIZED` | 401 | Missing or invalid session |
| `FORBIDDEN` | 403 | Authenticated but not allowed |
| `NOT_FOUND` | 404 | Resource doesn't exist |
| `RATE_LIMITED` | 429 | Too many requests |
| `PROVIDER_UNAVAILABLE` | 503 | Market data provider error |
| `BUDGET_EXCEEDED` | 503 | Daily AI spend cap reached |
| `INTERNAL` | 500 | Unhandled errors (catch-all) |

### Reading error responses in tests

```typescript
expect(response.status).toBe(400);
const body = await response.json();
expect(body.error.code).toBe('VALIDATION');
expect(body.error.requestId).toBeTruthy();
```

### requestId propagation

The `X-Request-Id` header is stamped by middleware and echoed back in error responses. When calling `formatErrorResponse()` or `errorResponse()`, pass the request object to include the requestId:

```typescript
return errorResponse(err, req);
// Body includes: { "error": { ..., "requestId": "req-abc123" } }
```

---

## 9. Common Debugging Scenarios

### Scenario: A tool call fails silently

**Symptoms:** Agent response doesn't include expected data, no visible error.

**Check:**
1. Look at `chat_tool_telemetry` for the thread — find calls with `ok=false`
2. Check `errorCode` column for the failure reason
3. Enable verbose tool output by asking the agent "What tools did you call?"

### Scenario: "Daily AI budget exceeded" error

**Symptoms:** Chat returns 503 with `BUDGET_EXCEEDED`.

**Diagnose:**
1. Run `get_system_diagnostics` — check `budget.spentUsd` vs `budget.limitUsd`
2. Query `chat_tool_telemetry` — sum `cost` column per day
3. Reset or increase `MAX_DAILY_USD` in env if needed

### Scenario: Agent gives wrong or stale data

**Symptoms:** Price/event claim without supporting tool call.

**Check:**
1. Look at `ctx.steps` from the diagnostic context — which tools were called?
2. Check `enforceCitations()` in `agent.ts` — it appends `data-citation-warning` when the model cites numbers without tool calls
3. Verify the agent prompt includes `LIVE_SNAPSHOT` data

### Scenario: Database connection issues

**Symptoms:** Chat returns 500, or agent reports system degraded.

**Diagnose:**
1. Run `get_system_diagnostics` — check `database.status` and `database.latencyMs`
2. If `latencyMs >= 250`, the system reports `degraded`
3. Check `DATABASE_URL` env var via `get_system_diagnostics.envCheck`

### Scenario: Redaction is too aggressive or not aggressive enough

**Symptoms:** Secrets visible in logs, or legitimate data being redacted.

**To tighten redaction:** Add patterns to `REDACTION_PATTERNS` in `packages/ai/src/diagnostics/redact.ts`.

**To loosen redaction:** Remove patterns or adjust `SENSITIVE_KEY_PATTERN`. Be cautious — err on the side of over-redaction.

**Verify with existing test:**
```bash
pnpm --filter @hamafx/ai test -- --run -t 'redact'
```

### Scenario: Debugging a production incident

**Procedure:**
1. Find the `traceId` from Sentry or logs
2. If Sentry has `diagnosticContext` attached, inspect the steps/errors array
3. Query `chat_tool_telemetry` for the thread to see tool-level timings
4. Check `get_system_diagnostics` for system-level health at the time
5. Reproduce locally with verbose logging

### Scenario: E2E test failing only in CI

**Symptoms:** Playwright test passes locally but fails on CI.

**Diagnose:**
1. CI config uses `trace: 'on-first-retry'` with 2 retries
2. Download the CI artifact (Playwright HTML report)
3. Run `npx playwright show-trace` on the trace.zip from the failed run
4. CI uses `workers: 1` — serial execution avoids flakiness from parallelism

---

## Quick Reference

| What | Where | Command |
|------|-------|---------|
| Run diagnostic tests | `packages/ai/test/diagnostics.test.ts` | `pnpm --filter @hamafx/ai test -- --run -t 'diagnostics'` |
| Run redaction tests | `packages/ai/test/diagnostics.test.ts` | `pnpm --filter @hamafx/ai test -- --run -t 'redact'` |
| Run error format tests | `packages/shared/test/errors.test.ts` | `pnpm --filter @hamafx/shared test -- --run -t 'formatErrorResponse'` |
| Run E2E tests | `apps/web/tests/e2e/` | `pnpm --filter @hamafx/web test:e2e` |
| View Playwright trace | `test-results/*/trace.zip` | `npx playwright show-trace <path>` |
| All tests | — | `pnpm turbo run test -- --run` |
| Diagnostics exports | `@hamafx/ai/diagnostics` | `withDiagnostics`, `getDiagnosticContext`, `recordStep`, `completeStep`, `recordError`, `exportDiagnosticContext` |
| Redaction exports | `@hamafx/ai/diagnostics` | `redactSecrets`, `redactString` |
| Error response | `@hamafx/shared` | `formatErrorResponse`, `AppError`, factory helpers |
