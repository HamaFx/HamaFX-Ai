# Plan 6: Trustworthy Testing & Debuggability System Upgrade

## Metadata
- **Scope:** Monorepo-wide testing infrastructure, observability, and debugging experience for HamaFX-Ai.
- **Goal:** Transform the current "vibe-coded" test suite into a deterministic, trusted, and debuggable system that catches real regressions, prevents silent failures, and accelerates incident response.
- **Target Agent:** A coding agent implementing this plan. Do not implement ad-hoc fixes; follow the phases and acceptance criteria below.
- **Estimated Effort:** 4-6 focused PRs over 2-3 weeks.
- **Owner:** @rawshtosman66

## 1. Current State Analysis

### 1.1 Repository Layout
- **Monorepo:** pnpm + Turborepo (`apps/*`, `packages/*`).
- **Apps:** `web` (Next.js 15, React 19, App Router), `worker` (tsx background jobs).
- **Packages:** `ai`, `data`, `db`, `indicators`, `shared`, `config`.
- **Test Runner:** Vitest 2.x across all packages/apps; Playwright 1.61 for E2E in `apps/web`.
- **CI:** `ci-fast.yml` (lint + typecheck + `turbo run test`), `ci-slow.yml` (lint + typecheck + coverage + E2E + nightly eval).

### 1.2 Test Inventory (as of main)
| Package/App | Source Files | Test Files | Notes |
|-------------|--------------|------------|-------|
| `packages/ai` | ~131 `.ts` | 42 | Best coverage in core logic; many tests are good but some re-implement logic instead of importing it. |
| `packages/data` | ~37 `.ts` | 15 | Strong pure-function tests; external provider tests rely on maps/adapters. |
| `packages/indicators` | ~18 `.ts` | 11 | Excellent deterministic math tests. |
| `packages/db` | ~38 `.ts` | 5 | Mostly migration tests; rate-limit row-shape test is a good pattern. |
| `packages/shared` | ~61 `.ts` | 3 | Very under-tested; mostly zod schemas and env parsing. |
| `apps/worker` | ~28 `.ts` | 17 | Good pure/in-memory tests for aggregation, cron locks, tick buffer. |
| `apps/web` | ~308 `.ts/.tsx` | 13 unit + 6 E2E | Severely under-tested: 96 components, 8 hooks, 66 API routes, 16 lib files. |

**Total:** ~761 source files, ~110 test files. README claims 590 passing assertions.

### 1.3 What Works Well
1. **Deterministic pure-function tests:** `indicators`, `worker` aggregation, `data` cache/failover, `ai` routing/redact/diagnostics.
2. **Regression tests with comments:** e.g., `rate-limit.test.ts` documents the postgres-js vs PGlite row-shape fix.
3. **In-memory DB tests:** PGlite is used in `db` tests, avoiding real Postgres.
4. **AsyncLocalStorage isolation tests:** `tool-context.test.ts` verifies concurrent run isolation.
5. **E2E isolation spec:** `isolation.spec.ts` attempts multi-user thread isolation.

### 1.4 Critical Gaps
1. **No coverage gates:** Every package uses `--passWithNoTests`. CI does not enforce minimum coverage.
2. **Broken coverage config in slow CI:** `ci-slow.yml` points to `packages/data/vite.config.ts` for the coverage report action, but `packages/data` has no `vite.config.ts`.
3. **Web app is a testing desert:** 308 source files, only 13 unit tests. No component tests, no hook tests, no route-handler tests.
4. **No shared test utilities:** Fixtures (e.g., candle builders) are duplicated or live next to tests. No central factory package.
5. **`server-only` barrier:** Many `ai` and `web` modules import `server-only`, which vitest cannot resolve without the alias hack in `apps/web/vitest.config.ts`. This forces tests to *re-implement* logic instead of importing it (e.g., `fusion.test.ts` copies `buildOpinionsBlock` verbatim).
6. **No deterministic LLM replay:** AI tests either mock at a high level or skip tool execution. There is no golden-record / VCR-style replay for LLM streams.
7. **No property-based testing:** Numeric schemas, parsers, and indicator edge cases would benefit from `fast-check`.
8. **No mutation testing:** We cannot prove tests are "trusted" (i.e., that they would catch real bugs).
9. **E2E is flaky and mocks the product:** `chat.spec.ts` mocks `/api/chat` with a static string, so it does not test the actual chat pipeline. Playwright config uses `pnpm dev` as webServer, which is slow and can fail in CI.
10. **Observability is present but not testable:** Langfuse/Sentry/OTel are initialized but there are no tests that spans/logs are emitted, redacted, or structured correctly.
11. **No contract tests between packages:** `shared` schemas are consumed by `ai` tools, but changes to schemas can break tool output parsers without any test failing.
12. **No debugging runbook:** `BUGFIX_GUIDE.md` exists but there is no standardized incident response or trace-first debugging workflow.

## 2. Vision: "Trusted Tests"

A trusted test system has four properties:
1. **Deterministic:** Same code + same inputs = same result. No real network, no real LLM, no real DB unless explicitly integration-tested.
2. **Meaningful:** Tests fail when behavior changes that users care about. `--passWithNoTests` is banned.
3. **Fast:** Unit/component tests run in seconds so developers run them locally.
4. **Observable:** When a test or production incident fails, we can reconstruct the exact trace, inputs, and decisions without adding `console.log`.

## 3. Guiding Principles

- **Test behavior, not implementation.** Prefer public API / black-box tests.
- **One source of truth for test data.** Move all factories/fixtures to a shared `@hamafx/test-utils` package.
- **No logic duplication in tests.** If `server-only` prevents importing a function, refactor the function to a pure helper in a non-server-only file and test that helper.
- **Fail CI on missing tests.** Remove `--passWithNoTests` and add coverage thresholds.
- **Mock at the boundary.** External HTTP, LLM, DB, and time should be controlled in unit tests.
- **Trace-first debugging.** Every production incident must be reproducible from a trace ID.

## 4. Phased Implementation Plan

### Phase 0: Foundation & Tooling (PR 1)
**Goal:** Make the test infrastructure capable of supporting trusted tests.

#### 4.0.1 Create `@hamafx/test-utils` package
- Location: `packages/test-utils`
- Exports:
  - `factories/candles.ts` — deterministic candle/tick builders (move from `packages/indicators/test/fixtures.ts` and `apps/worker/test/candle-1m.test.ts`).
  - `factories/users.ts` — user/settings/encryption fixtures.
  - `factories/threads.ts` — chat thread/message fixtures.
  - `mocks/llm.ts` — deterministic LLM response recorder/replayer.
  - `mocks/db.ts` — PGlite in-memory DB bootstrapper with migrations.
  - `mocks/fetch.ts` — MSW server setup for external HTTP mocks.
  - `helpers/vitest.ts` — shared custom matchers, snapshot serializers, time helpers.
- Add to `pnpm-workspace.yaml` and make all apps/packages depend on it as a dev dependency.
- Update existing tests to import factories from `@hamafx/test-utils` instead of local copies.

#### 4.0.2 Fix `server-only` testing barrier
- Current workaround: `apps/web/vitest.config.ts` aliases `server-only` to `test/empty.ts`.
- Problem: This only works for `apps/web`. `packages/ai` tests avoid importing `server-only` files and re-implement logic.
- Solution:
  1. Add a shared vitest plugin/alias in `@hamafx/test-utils` that stubs `server-only` for all packages.
  2. Refactor the most-tested pure logic out of `server-only` files into side-effect-free modules that can be imported in tests.
  3. For files that genuinely need `server-only` (DB writes, API secrets), keep them behind a boundary and test via integration tests with mocked boundaries.

#### 4.0.3 Unify Vitest configuration with Projects
- Create a root `vitest.config.ts` using Vitest Projects (formerly workspace) that includes:
  - `apps/web` (node environment for lib/route tests + browser environment for component tests).
  - `apps/worker` (node).
  - `packages/ai`, `packages/data`, `packages/indicators`, `packages/db`, `packages/shared` (node).
- Ensure each project uses `defineProject` and extends a shared base config from `@hamafx/test-utils`.
- Keep per-project `vitest.config.ts` files for local runs but make the root config the CI source of truth.

#### 4.0.4 Add essential dev dependencies
- `@testing-library/react`, `@testing-library/user-event`, `@testing-library/jest-dom`, `jsdom` for component tests.
- `msw` (already present implicitly? verify) for HTTP mocking.
- `fast-check` for property-based tests.
- `@vitest/coverage-v8` already present at root; ensure each project has it.
- `next-test-api-route-handler` (ntarh) for Next.js route handler unit tests.
- `playwright` already present.

#### 4.0.5 Remove `--passWithNoTests` everywhere
- Update all `package.json` `test` scripts to `vitest run` (or `vitest --run`).
- Add a root `test:empty-guard` script that fails if any package has zero test files.

#### 4.0.6 Fix CI coverage reporting
- In `ci-slow.yml`, replace the broken `vite-config-path: packages/data/vite.config.ts` with the actual root `vitest.config.ts`.
- Upload coverage artifacts per project.
- Add a coverage summary comment step using `davelosert/vitest-coverage-report-action@v2` with correct config path.

#### Acceptance Criteria for Phase 0
- [ ] `pnpm test` at root runs all projects without `--passWithNoTests`.
- [ ] `@hamafx/test-utils` exists and is imported by at least 5 existing tests.
- [ ] `server-only` is stubbed globally for tests; no test re-implements production logic because of import barriers.
- [ ] CI fast/slow workflows pass on the PR.
- [ ] Coverage report action uses the correct config path.

---

### Phase 1: Package-Level Trust (PR 2)
**Goal:** Make every package have meaningful, deterministic tests and coverage gates.

#### 4.1.1 `packages/shared`
- Add tests for every zod schema:
  - Valid/invalid examples for each schema in `src/schemas/`.
  - Round-trip serialization tests.
  - Regression tests for any schema that has caused a production bug.
- Add tests for `env.ts`, `env-secrets.ts`, `encryption.ts`, `errors.ts`, `logger.ts`.
- Add property-based tests for `encryption.ts` round-trips and redaction patterns.
- Target: 80% line coverage.

#### 4.1.2 `packages/db`
- Expand PGlite-based tests:
  - CRUD tests for every table using real schema migrations.
  - User-scope isolation tests (not just the `withUserScope` helper).
  - Rate-limit counter tests with both postgres-js and PGlite shapes.
  - Migration idempotency tests.
- Add a `test-utils` DB helper that starts PGlite, runs migrations, and provides a transaction-rollback wrapper for test isolation.
- Target: 75% line coverage.

#### 4.1.3 `packages/indicators`
- Already strong; add:
  - Property-based tests for indicator invariants (e.g., RSI always in [0,100], Bollinger bands contain price).
  - Edge cases: empty arrays, single candle, NaN inputs, duplicate timestamps.
- Target: 85% line coverage.

#### 4.1.4 `packages/data`
- Add tests for every provider adapter:
  - `biquote`, `finnhub`, `fred`, `marketaux`, `cftc`, `candles-1m`, `live-ticks`.
  - Use MSW to mock HTTP responses; assert correct mapping to shared schemas.
- Add tests for `circuit-breaker.ts`, `failover.ts`, `health.ts`, `throttle.ts`.
- Add property-based tests for cache key generation and TTL behavior.
- Target: 75% line coverage.

#### 4.1.5 `packages/ai` — Refactor for testability
- **Remove logic duplication in tests:**
  - `fusion.test.ts` currently re-implements `buildOpinionsBlock`. Refactor `DecisionAgent` so the block builder is a pure exported function in `packages/ai/src/multi-agent/agents/decision-formatter.ts` and import it in both source and test.
  - Apply the same pattern to any other test that copies source logic.
- **Add tests for untested core modules:**
  - `agent.ts` — decompose `runChat` into pure planning + execution phases; test the planner with mocked model/tool outputs.
  - `model.ts` — test model resolution, cost estimation, BYOK provider mapping.
  - `cost.ts` — test budget guards, cost estimation, vertex/gateway normalization.
  - `fallback.ts` — test stream error classification and fallback part generation.
  - `retry.ts` — test backoff, jitter, abort signal, retry-on classification.
  - `routing.ts` — already tested; expand with more edge cases and property tests.
  - `verification.ts` — already tested; add property tests for citation regex.
- **Tool tests:**
  - For every tool in `packages/ai/src/tools/`, add a unit test that mocks its dependencies (data, DB, indicators) and asserts:
    - Valid input produces a valid output schema.
    - Invalid input returns a structured error.
    - Telemetry/diagnostic steps are recorded.
  - Start with high-impact tools: `get-price`, `get-candles`, `get-indicators`, `compute-risk`, `verify-call`, `set-alert`, `convene-committee`.
- **LLM replay harness:**
  - Build a deterministic LLM mock in `@hamafx/test-utils/mocks/llm.ts` that records real AI SDK streams to JSON "cassettes" and replays them in tests.
  - Record cassettes for at least 5 representative chat turns and commit them under `packages/ai/test/cassettes/`.
  - Add a test mode `VITE_LLM_REPLAY=read` (default in CI) and `VITE_LLM_REPLAY=record` for local updates.
- Target: 70% line coverage for `packages/ai`.

#### 4.1.6 `apps/worker`
- Add tests for every job in `src/jobs/`:
  - Mock DB and data providers; assert job outputs and side effects.
  - Test idempotency and cron-lock behavior.
- Add tests for `signalr/consumer.ts`, `signalr/reconnect.ts`, `mt5-server.ts` using mocked WebSocket/SSE.
- Target: 70% line coverage.

#### Acceptance Criteria for Phase 1
- [ ] Every package has a coverage threshold enforced in its `vitest.config.ts`.
- [ ] No test re-implements production logic.
- [ ] `packages/ai` has at least 20 cassette-based LLM replay tests.
- [ ] `packages/shared` reaches 80% coverage; `packages/indicators` reaches 85%.
- [ ] All Phase 1 tests pass in CI.

---

### Phase 2: Web App Testing (PR 3)
**Goal:** Bring `apps/web` from ~13 unit tests to a comprehensive test suite covering lib, routes, hooks, components, and E2E.

#### 4.2.1 Lib and utility tests
- Test every file in `apps/web/src/lib/`:
  - `auth.ts` — token signing/verification, secret handling.
  - `session.ts` — session classification boundaries.
  - `thread-export.ts` — already tested; add snapshot tests for complex threads.
  - `fuzzy-match.ts`, `format.ts`, `cn.ts`, `api.ts`, `csrf.ts`, `request-id.ts`, `storage.ts`, `usage-alerts.ts`, `market-client.ts`, `commands.ts`.
- Use `@hamafx/test-utils` factories for data.

#### 4.2.2 Route handler tests
- Use `next-test-api-route-handler` (ntarh) to test every route in `apps/web/src/app/api/`.
- For each route, test:
  - Happy path with valid input.
  - Auth failure (401/403) when session missing.
  - Validation failure (400) with malformed input.
  - Not found (404) for missing resources.
  - User isolation: user A cannot access user B's resources.
- Mock external dependencies (DB via PGlite, AI via LLM replay, data providers via MSW).
- Start with critical routes: `chat/route.ts`, `chat/threads/*/route.ts`, `alerts/route.ts`, `journal/route.ts`, `market/*/route.ts`, `auth/[...nextauth]/route.ts`.

#### 4.2.3 Server Actions tests
- Test `apps/web/src/app/(app)/settings/actions.ts` and any other `actions.ts` files.
- Mock `cookies()`, `headers()`, `redirect()` from `next/headers` and `next/navigation`.
- Assert revalidation paths and error envelopes.

#### 4.2.4 Hook tests
- Add tests for all 8 hooks in `apps/web/src/hooks/` using `@testing-library/react` and `msw`.
- Mock `fetch`, SWR/React Query, and local storage.

#### 4.2.5 Component tests
- Add tests for high-impact components:
  - `components/chat/composer.tsx` — input validation, submit, character count.
  - `components/chat/message-list.tsx` — rendering messages, streaming states.
  - `components/chat/message.tsx` — markdown rendering, tool-call parts.
  - `components/chart/chart.tsx` and `chart-view.tsx` — data transformation, empty/error states.
  - `app/(app)/settings/_components/profile-form.tsx`, `symbols-form.tsx`, `agent-model-override-form.tsx` — form validation, submission.
  - `app/(app)/alerts/_components/alert-form.tsx`, `alert-list.tsx` — CRUD interactions.
- Use React Testing Library. Mock server components by testing the client parts in isolation.

#### 4.2.6 E2E hardening
- Replace `pnpm dev` in Playwright webServer with a production-like build: `pnpm build && pnpm start` in CI, keep `pnpm dev` for local dev.
- Add `test-id` attributes to key UI elements instead of relying on CSS classes.
- Rewrite `chat.spec.ts` to use the real `/api/chat` endpoint with a cassette-backed LLM provider, not a mocked static response.
- Add E2E tests for:
  - Login/logout flow.
  - Creating a thread and sending a message.
  - Multi-user isolation (already exists; harden selectors and assertions).
  - Alert creation and delivery.
  - Chart symbol change and indicator request.
- Run E2E in CI with a seeded PGlite/Postgres test database.

#### Acceptance Criteria for Phase 2
- [ ] `apps/web` has at least 80 unit/integration test files.
- [ ] All 66 API routes have at least one ntarh test.
- [ ] All 8 hooks have tests.
- [ ] At least 20 component tests exist.
- [ ] E2E tests run against a built app and do not mock `/api/chat`.
- [ ] `apps/web` coverage threshold: 60% line coverage (raise in follow-up).

---

### Phase 3: Observability & Debuggability (PR 4)
**Goal:** Make production incidents reproducible and locally debuggable from a trace.

#### 4.3.1 Standardize structured logging
- Audit `packages/shared/src/logger.ts` and `apps/worker/src/log.ts`.
- Ensure every log line includes: `traceId`, `spanId`, `service`, `userId` (when available), `threadId` (when available), `level`, `timestamp`, `message`, `error.code`.
- Add a `debug` mode that pretty-prints traces for local development.
- Add tests that assert log output is JSON-encodable and redacted.

#### 4.3.2 Trace-first debugging contract
- Extend `packages/ai/src/diagnostics/run-context.ts`:
  - Add `parentSpanId` and `spanId` to every step.
  - Record the rendered prompt hash (SHA-256) for every LLM call.
  - Record model name, temperature, max tokens, and actual sampled response.
  - Record tool input/output hashes (not full payloads to avoid PII).
- Add `packages/ai/src/diagnostics/debug-export.ts` that writes a trace to a local JSON file when `DEBUG_TRACE_PATH` is set.
- Add a CLI script `packages/ai/src/diagnostics/replay-trace.ts` that replays a saved trace against `runChat` with mocked LLM cassettes.

#### 4.3.3 Test the telemetry pipeline
- Add tests that verify:
  - `recordToolTelemetry` writes the expected row shape.
  - `withTelemetry` propagates `AbortSignal` and records timing.
  - `recordStep` / `completeStep` / `recordError` produce the expected trace structure.
  - Redaction removes secrets from traces and logs.
- Mock Sentry and Langfuse SDKs; assert they receive the expected events.

#### 4.3.4 Error envelope contract
- Audit `formatErrorResponse` in `packages/shared/src/errors.ts`.
- Ensure every API route uses `formatErrorResponse` and includes `requestId`.
- Add tests that assert error responses contain `code`, `message`, optional `details`, and `requestId`.
- Add a debug endpoint `GET /api/health/debug` (admin-only) that returns the current trace context for the request.

#### 4.3.5 Local debugging runbook
- Create `docs/09-debugging-and-tracing.md` with:
  - How to capture a trace from production.
  - How to replay it locally with `pnpm ai:replay-trace <trace.json>`.
  - How to use Playwright trace viewer for E2E failures.
  - How to enable `DEBUG_TRACE_PATH` and inspect logs.

#### Acceptance Criteria for Phase 3
- [ ] Every log line has `traceId` + `service`.
- [ ] LLM calls record prompt hash + model + sampled response in diagnostics.
- [ ] A saved trace can be replayed locally with deterministic output.
- [ ] Error responses include `requestId` and are tested.
- [ ] `docs/09-debugging-and-tracing.md` is written and reviewed.

---

### Phase 4: Advanced Trust Mechanisms (PR 5)
**Goal:** Prove the tests are actually catching bugs and the system behaves correctly under unusual inputs.

#### 4.4.1 Property-based testing
- Add `fast-check` tests for:
  - `packages/indicators` — indicator invariants across random candle series.
  - `packages/shared` — zod schema round-trips and rejection of invalid data.
  - `packages/ai` — routing classification across random message shapes; citation regex behavior.
  - `packages/data` — cache key collision resistance; failover ordering invariants.
- Keep property tests fast (<1s each). Use `fc.sample` for deterministic seeds in CI.

#### 4.4.2 Mutation testing (optional but recommended)
- Add a nightly CI job that runs `stryker-js` on `packages/indicators` and `packages/shared`.
- Target: kill rate > 70% initially; document surviving mutants.
- Do not gate PRs on mutation testing yet; use it as a guide for test quality.

#### 4.4.3 Contract tests between packages
- Add a test in `packages/ai` that imports every tool output schema from `@hamafx/shared/schemas/tool-outputs/*` and verifies the tool's actual output matches the schema.
- Add a test in `apps/web` that imports every API route's Zod input schema (if any) and verifies the route's `request.json()` parsing matches.
- Add a test in `packages/data` that imports every provider's response schema and verifies the adapter output matches.

#### 4.4.4 Chaos/failure injection
- Add tests that simulate:
  - LLM provider timeout and fallback.
  - DB connection failure in `packages/db` and `apps/web` routes.
  - External data provider 500/429 responses and circuit-breaker behavior.
  - AbortSignal cancellation mid-stream.
- Use `msw` for HTTP failures and `vi.useFakeTimers` for timeouts.

#### 4.4.5 Snapshot tests for stable outputs
- Add snapshot tests for:
  - `thread-export.ts` markdown output.
  - Tool output shapes for deterministic tools (`verify-call`, `get-session-levels`).
  - Error response envelopes.
- Store snapshots in Git and review them in PRs.

#### Acceptance Criteria for Phase 4
- [ ] At least 10 property-based tests added.
- [ ] Stryker mutation testing runs nightly and reports kill rate.
- [ ] Contract tests exist for tool outputs, API inputs, and provider adapters.
- [ ] Chaos tests cover timeout, DB failure, provider 500, and abort signal.

---

### Phase 5: CI/CD & Developer Experience (PR 6)
**Goal:** Make the trusted test system run automatically and give fast feedback.

#### 4.5.1 CI pipeline updates
- `ci-fast.yml`:
  - Keep lint + typecheck + unit tests.
  - Add a `coverage` job that fails if any package drops below its threshold.
  - Add a "test count" check that fails if a package has zero tests.
- `ci-slow.yml`:
  - Fix coverage config path.
  - Run E2E against built app.
  - Run nightly eval harness with cassette mode.
  - Add mutation testing job (optional, nightly).
- Add a new `ci-debug.yml` (manual trigger) that runs the trace replay suite against a saved production trace.

#### 4.5.2 Local dev improvements
- Add `pnpm test` (root), `pnpm test:watch`, `pnpm test:coverage`, `pnpm test:e2e` scripts.
- Add `pnpm test:web` to run only web tests, `pnpm test:ai` for AI tests, etc.
- Add a pre-commit hook (optional) that runs `pnpm lint` and `pnpm test --changed` via `lint-staged`.

#### 4.5.3 Test documentation
- Update `README.md` test badge to reflect real passing test count (not hardcoded 590).
- Add `docs/10-testing-guide.md`:
  - How to write a unit test.
  - How to add a fixture/factory.
  - How to record an LLM cassette.
  - How to run E2E tests locally.
  - Coverage thresholds per package.

#### 4.5.4 Flakiness detection
- Add a CI job that runs the test suite 5 times and reports flaky tests.
- Use Playwright's built-in retry reporting.
- Add a `flaky` marker for known-flaky tests and require an issue link in a comment.

#### Acceptance Criteria for Phase 5
- [ ] CI enforces coverage thresholds per package.
- [ ] E2E runs against built app in CI.
- [ ] Local test commands are documented and fast.
- [ ] README badge reflects live test count.
- [ ] Flaky tests are tracked and marked.

## 5. Key Design Decisions

### 5.1 Testing Boundaries
| Layer | Test With | Mock |
|-------|-----------|------|
| Pure functions | Vitest unit tests | Nothing |
| Package integration | Vitest with `@hamafx/test-utils` | DB (PGlite), HTTP (MSW), LLM (cassettes) |
| Next.js lib/hooks | Vitest + RTL + jsdom | `next/*`, `fetch`, localStorage |
| Next.js API routes | ntarh + Vitest | DB, AI, external APIs |
| Next.js Server Components | Playwright E2E | Real app + mocked external APIs |
| Client Components | Vitest + RTL + jsdom | Server components, fetch, hooks |
| Full user flows | Playwright E2E | External APIs only |

### 5.2 LLM Testing Strategy
- **Never call real LLMs in unit/integration tests.**
- Use deterministic cassettes for AI SDK streams.
- For eval/nightly, use real LLMs with a small fixed prompt set and record results.
- For property tests, mock the AI SDK to return controlled tool-call sequences.

### 5.3 Database Testing Strategy
- **Unit tests:** Use PGlite in-memory with migrations.
- **Integration tests:** Use a transaction wrapper that rolls back after each test.
- **E2E tests:** Use a dedicated test database or PGlite; seed with `@hamafx/test-utils` factories.
- **Production:** Never run tests against production DB.

### 5.4 Time Testing Strategy
- Use `vi.useFakeTimers()` for deterministic time.
- For tests that need real async delays, keep them under 50ms.
- Never rely on `Date.now()` in assertions without freezing time.

## 6. File & Module Map for the Implementing Agent

### New Files
- `packages/test-utils/package.json`
- `packages/test-utils/src/factories/candles.ts`
- `packages/test-utils/src/factories/users.ts`
- `packages/test-utils/src/factories/threads.ts`
- `packages/test-utils/src/mocks/llm.ts`
- `packages/test-utils/src/mocks/db.ts`
- `packages/test-utils/src/mocks/fetch.ts`
- `packages/test-utils/src/helpers/vitest.ts`
- `packages/test-utils/vitest.config.ts`
- `vitest.config.ts` (root projects config)
- `packages/ai/src/multi-agent/agents/decision-formatter.ts`
- `packages/ai/src/diagnostics/debug-export.ts`
- `packages/ai/src/diagnostics/replay-trace.ts`
- `docs/09-debugging-and-tracing.md`
- `docs/10-testing-guide.md`
- `.github/workflows/ci-debug.yml`

### Modified Files
- `pnpm-workspace.yaml` — add `packages/test-utils`.
- All `package.json` files — add `@hamafx/test-utils` dev dependency, update `test` script.
- All `vitest.config.ts` files — extend shared base config, add coverage thresholds.
- `turbo.json` — update `test` outputs to include coverage.
- `.github/workflows/ci-fast.yml` — add coverage + test-count checks.
- `.github/workflows/ci-slow.yml` — fix coverage config, run E2E against built app.
- `apps/web/playwright.config.ts` — use built app in CI, add test-id selectors.
- `apps/web/package.json` — add RTL/jsdom/ntarh dependencies.
- `packages/ai/test/multi-agent/fusion.test.ts` — import formatter instead of copying logic.
- `README.md` — update test badge.

### Files to Delete
- Any duplicated fixture files after moving to `@hamafx/test-utils`.
- `apps/web/test/empty.ts` if the global `server-only` stub replaces it.

## 7. Acceptance Criteria for the Whole Plan

- [ ] `pnpm test` passes locally in under 2 minutes for unit/integration tests.
- [ ] CI `ci-fast.yml` passes and enforces coverage thresholds.
- [ ] CI `ci-slow.yml` passes, including E2E and nightly eval.
- [ ] No package uses `--passWithNoTests`.
- [ ] Every package has a meaningful coverage threshold and meets it.
- [ ] `apps/web` has route-handler tests for all critical routes.
- [ ] `apps/web` has component tests for high-impact UI.
[ ] `packages/ai` has cassette-based LLM replay tests.
- [ ] Every production error response includes `requestId`.
- [ ] A production trace can be downloaded and replayed locally.
- [ ] Mutation testing runs nightly and reports a kill rate.
- [ ] README test badge reflects the actual live test count.

## 8. Risks & Mitigations

| Risk | Mitigation |
|------|------------|
| Refactoring `server-only` files breaks production imports. | Make changes in small, reviewable PRs; keep `server-only` imports in the original entry files and move pure logic to new non-server-only modules. |
| Adding many tests slows CI. | Use Vitest Projects, parallel CI jobs, and keep E2E scoped to critical paths. |
| LLM cassettes become stale. | Record cassettes with a script; review cassette diffs in PRs; re-record monthly. |
| E2E remains flaky. | Use test-id selectors, built app in CI, seeded DB, and retry reporting. |
| Coverage thresholds are too aggressive. | Start with conservative thresholds and raise them incrementally. |
| Mutation testing is too slow. | Run it nightly only; do not gate PRs. |

## 9. Success Metrics

- **Test count:** From ~110 test files to 250+ test files.
- **Coverage:** Every package above its threshold; overall line coverage > 70%.
- **CI time:** Unit/integration tests < 5 minutes; full slow CI < 25 minutes.
- **Flakiness:** < 1% flaky test rate in CI.
- **Incident MTTR:** Reduce by 50% via trace-first debugging (measured anecdotally).
- **Mutation kill rate:** > 70% for `packages/indicators` and `packages/shared`.

## 10. References & Context

- Vitest Projects: https://vitest.dev/guide/projects
- Vitest Test Context / Fixtures: https://vitest.dev/guide/test-context
- Next.js Testing Guide (Vitest + Playwright): https://nextjslaunchpad.com/article/testing-nextjs-app-router-complete-guide-vitest-playwright-server-components
- AI Agent Debugging (trace-first): https://www.respan.ai/articles/agent-debugging
- AI Agent Testing: https://oneuptime.com/blog/post/2026-01-30-agent-testing/view
- Pytest Best Practices (analogous patterns for fixtures/mocks): https://qaskills.sh/blog/pytest-best-practices-2026
- Existing project docs: `BUGFIX_GUIDE.md`, `.hermes/plans/system-upgrades/README.md`, `MIGRATION_V2.md`.

---

*End of plan. Implementing agent: start with Phase 0 and do not skip acceptance criteria.*
