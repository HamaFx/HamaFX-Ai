# Kestrel AI Testing, Observability & Training-Readiness Audit

**Audit date:** 2026-08-15  
**Scope:** `packages/ai`, `apps/web`, `apps/worker`, shared data/database packages, CI workflows, evaluation harness, logging, diagnostics, monitoring, and training/feedback readiness.  
**Method:** Static end-to-end code and configuration audit, including test inventory, CI workflow inspection, representative test review, AI/eval flow review, and observability-path review. This audit did not make production calls or use real provider credentials.

---

## 1. Executive verdict

Kestrel has a **strong testing foundation for deterministic application logic** and unusually good beginnings for AI diagnostics: structured logging, trace correlation, persisted diagnostic timelines, tool telemetry, budget telemetry, Sentry integration, OpenTelemetry/Langfuse hooks, Playwright artifacts, and a versioned acceptance-case runner.

It is **not yet fully testable or fully advanced as an AI quality and operations system**. The main limitation is not the number of tests; it is the lack of realistic cross-boundary and model-quality validation:

- AI orchestration is mostly tested with mocked models, mocked data, and mocked persistence.
- The Playwright chat and committee tests mock `/api/chat` and the worker, so they validate UI contracts rather than the real AI path.
- There is no repeatable live staging test that exercises web → database → AI provider → tools → persistence → worker together.
- The nightly eval job is not self-contained: it does not start the app and does not provide the required eval cookie.
- The acceptance dataset contains a contract contradiction with strict Full mode.
- Evaluation measures transport, tool presence, agent lifecycle, and substring presence, but not factual correctness, numeric correctness, citation quality, safety, or trading-domain usefulness.
- There is no implemented human-feedback/annotation loop or training-data curation pipeline.
- Monitoring has good health/SLO building blocks, but alert delivery, metric continuity, privacy governance, and operational runbooks are not enforced as code.

### Overall rating: **5.8 / 10 — good foundation, not production-grade AI assurance yet**

The system is safe to continue improving, but it should not be described as “fully tested,” “fully observable,” or “training-ready” until the P0/P1 items in this report are addressed.

---

## 2. Scorecard

| Area | Rating | Assessment |
|---|---:|---|
| Deterministic unit-test breadth | **8.0/10** | Broad coverage of tools, routing, budgets, persistence helpers, data transforms, auth policies, diagnostics, and UI utilities. |
| AI orchestration contract coverage | **6.5/10** | Good specialist contracts, mode tests, retry/fallback tests, and stream tests; limited real model/route execution. |
| AI/data/database integration realism | **4.5/10** | The principal AI-data integration uses mocked `@kestrel/data` and indicators. Very little validates real package boundaries plus a real database together. |
| Web → AI integration | **4.5/10** | One representative web integration route exists, but the actual chat route is not exercised with the real AI client and persistence chain. |
| Worker/queue integration | **5.5/10** | Worker jobs, scheduler, leases, retries, and analysis logic have unit tests; no durable queue test runs web enqueue, worker claim, completion, and browser polling together. |
| End-to-end UX coverage | **7.0/10** | 20 Playwright specs cover auth, chat UI, modes, isolation, accessibility, PWA, and admin flows. Chat responses and Full-mode jobs are mocked. |
| Failure/chaos/resilience testing | **6.0/10** | Retry, failover, reconnection, budget races, and some worker failures are covered. Provider outages, DB outages, stream truncation, queue duplication, and lease races are not tested as a complete system. |
| CI quality gates | **6.0/10** | PR CI runs lint, typecheck, build, coverage, Playwright, audit, and empty-test guards. Coverage thresholds are low/inconsistent and no changed-line gate or mutation gate exists. |
| Structured logging and trace correlation | **7.5/10** | Pino categories, request/run/trace IDs, redaction, diagnostic context, trace persistence, and an admin explorer are strong. |
| Production monitoring and alerting | **5.5/10** | Health/SLO endpoints and Sentry/Langfuse hooks exist, but metrics, alert rules, dashboards, paging verification, and monitor availability are not fully codified. |
| Privacy and telemetry governance | **5.0/10** | Secret redaction is thoughtful, but raw user/tool metadata and some PII can still enter diagnostic/Sentry paths; retention and access policy are not sufficiently enforced. |
| Model-quality evaluation | **4.0/10** | Acceptance cases test plumbing and coarse behavior, not domain correctness or safety. No robust baseline, judge rubric, or regression threshold exists. |
| Training/feedback readiness | **2.5/10** | Dataset publishing exists, but there is no implemented user feedback, annotation workflow, curated examples store, outcome labeling, or training/export pipeline. |
| Developer test ergonomics | **7.0/10** | Clear package scripts, shared fixtures, Vitest/Playwright setup, artifacts, and test-file guard. Local live-stack setup remains cumbersome. |

### Interpretation

The high unit-test score should not be confused with high AI assurance. For an agentic system, confidence must be weighted toward the real execution graph, model behavior, tool correctness, safety, and production feedback. Those are the current weak points.

---

## 3. Test inventory and architecture

### 3.1 Current breadth

The audited repository contains at least:

- **95 AI test files** under `packages/ai/test/`.
- **91 web unit/component test files** under `apps/web/test/`.
- **20 Playwright E2E specs** under `apps/web/tests/e2e/`.
- **20 worker test files**.
- **21 data test files**.
- **19 database test files**.
- **14 shared-package test files**.

That is at least **280 files across the audited surfaces**, before separately counting indicators and test-utils. The current `docs/09-testing.md` inventory says 207 files and lists older package counts, so the documentation is stale even though the actual repository has grown.

### 3.2 What is covered well

- AI tools have direct execute-function tests.
- Tool output schemas have contract coverage.
- Routing, planner behavior, model resolution, fallback, retry, budget reservation, and citation verification have dedicated tests.
- Multi-agent modes, specialist contracts, context construction, fusion, concurrency, and Full-mode failure behavior have tests.
- Data failover, caching, throttling, provider mapping, reconnect, and selected chaos cases are covered.
- Database migrations and schema drift have unusually strong test attention.
- Auth, CSRF, IDOR, admin authorization, rate limits, and isolation have meaningful coverage.
- Diagnostics, redaction, trace persistence, and telemetry correlation are tested.
- Playwright uses auth setup, retries, traces, screenshots, videos, JUnit, sharding, and multiple browser projects.
- `scripts/check-test-files.mjs` prevents empty test files from silently entering the suite.

### 3.3 Structural testing gaps

The current suite is mainly **inside-out**: it tests individual modules with mocked boundaries. It needs more **outside-in** tests that begin with an HTTP request and traverse the real application composition.

The most important missing test shape is:

```text
browser/API request
  → proxy/auth/CSRF
  → /api/chat
  → runChat or runMultiAgentChat
  → real test LLM adapter
  → real tool registry and tool context
  → PGlite/Postgres
  → telemetry/diagnostic persistence
  → stream or analysis-job result
  → client polling/rendering
```

No existing test suite consistently exercises this entire graph.

---

## 4. Detailed findings

## P0 — Must resolve before claiming full assurance

### P0-1. Nightly eval workflow is not executable as written

**Evidence:** `.github/workflows/ci-slow.yml` runs only `pnpm turbo run eval` on the nightly schedule. The AI package script runs `tsx src/eval/runner.ts --cases`; the runner requires a cookie and defaults to `http://localhost:3000`. The workflow does not start a web server, create a test session, pass `EVAL_COOKIE`, or provide a base URL.

**Impact:** The principal model-regression gate is either guaranteed to fail with “missing cookie” or cannot reach the app. A green nightly pipeline cannot currently be treated as evidence that live evals ran.

**Recommendation:** Create a dedicated `ai-eval` workflow that:

1. boots an isolated Postgres/PGlite-backed test stack;
2. applies migrations and seeds a known test user;
3. starts the built web app and worker when the case requires Full mode;
4. obtains a short-lived test session through a test-only authentication helper;
5. runs `--cases` against that stack;
6. uploads the Markdown/JSON report and raw trace artifacts;
7. fails on transport, assertion, quality, cost, or latency regressions;
8. destroys the environment in an unconditional cleanup step.

Do not put a long-lived production cookie in GitHub Actions.

### P0-2. Acceptance cases contradict strict Full-mode behavior

**Evidence:** `packages/ai/src/eval/cases.json` contains `mode-full-sentiment-degraded`, which expects:

```json
{
  "sentiment": "error",
  "decision": "done"
}
```

The current `packages/ai/src/multi-agent/orchestrator.ts` intentionally implements strict Full mode: when a required specialist fails, it emits an analysis error and throws before Decision-agent fusion. The browser Full-mode degraded test also mocks a completed degraded result instead of exercising this backend contract.

**Impact:** The acceptance dataset can encode behavior that the production orchestrator intentionally forbids. This creates false failures, false confidence, and unclear product semantics.

**Recommendation:** Choose one contract and enforce it everywhere:

- **Strict Full mode:** expect specialist error, Decision error/not-run, no partial result, and test retry/terminal failure.
- **Degraded Full mode:** change the orchestrator to explicitly allow fusion with missing specialists and label the result degraded.

The current architecture and prior audit favor strict Full mode. Update `cases.json`, eval docs, fixtures, and Playwright mocks to match strict behavior, then add a contract test that asserts the same status matrix in orchestrator, worker, transport, and UI.

### P0-3. No deterministic, realistic LLM test adapter for the full agent path

The LLM abstraction (`LlmClient`) is a good seam, but the suite does not use a deterministic scripted client to run the complete `runChat` and committee flows with realistic tool-call sequences, usage, finish reasons, provider errors, stream chunks, and delayed callbacks.

**Impact:** Critical lifecycle bugs can survive: stream callback ordering, duplicate persistence, retry after partial output, tool-loop limits, telemetry flush, budget reconciliation, citation enforcement, and late `onError` behavior.

**Recommendation:** Build a reusable `ScriptedLlmClient` test adapter with scenarios:

- text-only response;
- tool call → tool result → final text;
- multiple tool steps;
- malformed tool arguments;
- provider timeout/429/5xx;
- fallback success;
- stream error after text;
- finish callback after response handoff;
- cancellation during tool execution;
- specialist outputs and Decision output;
- deterministic token/cost usage.

Use it in route-level integration tests against PGlite and assert persisted messages, telemetry, diagnostic events, budget state, and response stream together.

---

## P1 — High-priority production confidence gaps

### P1-1. Playwright chat tests validate mocked UI contracts, not the real AI system

`apps/web/tests/e2e/chat.spec.ts` mocks `/api/chat`. `multi-agent.spec.ts` mocks SSE and `/api/chat/analysis-jobs/*`. These are valuable UI tests, but they do not test the actual route, model, tools, database, worker, or telemetry.

**Recommendation:** Keep the fast mocked suite and add a smaller nightly/staging suite with real app composition and a scripted LLM adapter. Label suites clearly:

- `@ui-contract` — mocked API;
- `@integration` — real route + fake LLM + real test DB;
- `@staging-ai` — real provider, explicitly cost-capped and quarantined;
- `@worker` — real queue/DB worker path.

### P1-2. No web-to-worker durable Full-mode test

Worker tests cover job internals and Playwright tests cover mocked polling, but there is no test that enqueues through `/api/chat`, claims the row with the worker, handles lease/heartbeat/retry, persists the result, and lets the browser poll it.

**Recommendation:** Add a Docker/PGlite integration harness with:

- one web request;
- one real worker process or in-process worker runner;
- real `analysis_jobs` rows;
- duplicate claim attempts;
- lease expiry;
- retryable and permanent errors;
- idempotent assistant persistence;
- final browser-compatible response.

### P1-3. E2E global setup fails open on migration errors

`apps/web/tests/e2e/global-setup.ts` catches migration failures, logs a warning, and continues. This can produce misleading failures or, worse, pass against a stale schema.

**Recommendation:** In CI, migration failure must fail setup. Allow fail-open only behind an explicit local-development flag such as `E2E_ALLOW_STALE_SCHEMA=1`. Add a schema-version assertion before tests.

### P1-4. Coverage thresholds are too low and inconsistent for an AI safety boundary

Current global thresholds include approximately:

- AI: 49% statements/branches/functions/lines;
- Web: 50% across all four;
- Worker: 38% statements/lines but 70% branches and 74% functions;
- DB: 43% statements with different branch/function targets;
- Other packages vary from 50% to 65%.

The CI invokes coverage, but there is no changed-line coverage gate, per-critical-module minimum, mutation testing, or coverage trend budget.

**Recommendation:** Do not solve this by blindly raising one global number. Add tiered gates:

- critical AI orchestration, budget, auth, persistence, and safety modules: 80%+ branches and 90%+ statements where practical;
- ordinary application code: 70%+;
- changed lines: 80%+ diff coverage;
- mutation score target for budget, auth, retry, and tool-guard modules;
- explicit justified exclusions reviewed in code owners.

### P1-5. No test of actual provider/model compatibility matrix

Most model tests mock `ai` and provider modules. This verifies configuration logic but not actual provider request shapes, tool-call serialization, usage fields, streaming protocol, abort behavior, or fallback compatibility across the BYOK registry.

**Recommendation:** Add a low-cost provider contract suite using recorded HTTP fixtures or provider sandbox keys. Run it nightly and on provider-adapter changes. Test at minimum:

- text generation;
- streaming;
- tool calling;
- structured JSON output;
- abort/timeout;
- usage extraction;
- rate-limit headers;
- fallback classification.

Never use production user keys in CI.

### P1-6. Evaluation is plumbing-focused, not quality-focused

The eval runner scores transport success, expected tool names, forbidden tools, agent lifecycle, and case-insensitive substring presence. It does not assess:

- whether price/risk calculations are numerically correct;
- whether the answer is grounded in tool output;
- citation completeness and precision;
- unsafe or unauthorized mutation behavior;
- hallucinated market facts;
- correct handling of missing/stale data;
- multilingual intent quality;
- latency and cost budgets per case;
- consistency across repeated runs;
- output usefulness to a trader.

**Recommendation:** Add layered oracles:

1. **Deterministic domain oracle:** parse structured claims and compare prices, risk, levels, symbols, and units with tolerances.
2. **Tool trace oracle:** validate tool inputs and outputs, not just tool names.
3. **Safety oracle:** mutation authorization, confirmation, prompt injection, secret exfiltration, and unsupported-claim checks.
4. **Citation oracle:** every numeric/event claim must map to an appropriate tool result.
5. **Rubric judge:** use a separately versioned judge prompt/model for clarity, completeness, and decision quality; never let it replace deterministic checks.
6. **Performance oracle:** TTFT, total latency, token count, cost, retries, and fallback thresholds.
7. **Stability oracle:** repeated seeded runs and variance tracking.

### P1-7. No explicit feedback or annotation loop

The repository has Langfuse instrumentation and dataset publishing, but the application search did not identify an implemented user feedback path that sends a trace-linked rating, correction, or annotation to the evaluation system.

**Impact:** Production outputs cannot be systematically labeled as useful, wrong, unsafe, or incomplete. There is no reliable source for improving prompts, tools, routing, or future training data.

**Recommendation:** Add:

- thumbs up/down plus optional reason;
- “wrong price,” “wrong symbol,” “unsafe action,” “missing context,” and “other” labels;
- optional expert correction for trading outputs;
- trace ID, message ID, model version, prompt version, and case context on every feedback event;
- privacy-safe feedback storage in the application DB;
- export to Langfuse scores and an internal annotation queue;
- deduplication and abuse/rate limiting.

### P1-8. Telemetry privacy is not yet sufficiently governed

Secret redaction is strong for key-shaped values, but `withTelemetry` records tool `input` in diagnostic metadata and traces can contain user prompts, financial setups, symbols, and tool results. Sentry calls in authentication actions include normalized email in `extra` fields. The logger’s redaction configuration does not automatically guarantee Sentry payload redaction.

**Recommendation:**

- remove email from Sentry extras or hash it with a documented one-way identifier;
- classify telemetry fields as public, pseudonymous, sensitive, or prohibited;
- allow only an explicit safe-field schema for tool/agent metadata;
- never store raw tool input by default; store shape, size, symbol, and hashed identifiers;
- make prompt/output capture opt-in per environment and per approved dataset;
- define retention, deletion, access, and export policies for `diagnostic_traces`, telemetry, Langfuse, and Sentry;
- add tests that scan emitted logger/Sentry payloads for email, API keys, cookies, account values, and raw credentials.

---

## P2 — Important maturity improvements

### P2-1. Monitoring has building blocks but not a complete alerting product

Strengths include `/api/health/public`, authenticated health, the SLO alert contract, admin SLI cards, Sentry, healthchecks.io worker heartbeats, and Langfuse/OpenTelemetry hooks. However:

- alert rules and thresholds are mostly external/operator configuration;
- dashboard definitions are not versioned;
- there is no automated “alert fired and was received” test;
- no clear metric continuity guarantee exists across Vercel serverless instances;
- the public health endpoint checks DB reachability only;
- Langfuse exporter failure is intentionally non-fatal, so missing traces can remain invisible except for logs;
- the admin SLO view says some error rates are tracked via Sentry rather than measuring them in the same durable SLI source.

**Recommendation:** Define and version a monitoring contract containing:

- metric name and labels;
- source of truth;
- SLO target and window;
- alert threshold and severity;
- owner and runbook link;
- test procedure.

Add synthetic probes for chat, Full-mode queue completion, provider fallback, and worker freshness. Alert on missing telemetry as well as bad telemetry.

### P2-2. Observability event taxonomy is not fully enforced

`packages/shared/src/observability.ts` defines stable event names, but many call sites still use free-form `recordStep('...')` names such as `chat_turn_start`, `shared_context`, and `stream_text`. This reduces cross-run aggregation and makes dashboards dependent on string conventions.

**Recommendation:** Use a typed event builder for every lifecycle event, with required correlation and optional structured dimensions. Keep arbitrary debug steps separate from operational events.

### P2-3. The diagnostic trace is a timeline, not a complete causal graph

The trace has steps and errors, and database explorer rows correlate trace/request/run/job/thread/message IDs. It lacks consistently structured parent/child span IDs, attempt IDs, queue wait duration, provider request ID, model version, prompt version, tool-call ID, and outcome classification.

**Recommendation:** Add a span/event envelope with:

```text
traceId, spanId, parentSpanId, requestId, runId, jobId,
threadId, messageId, attempt, provider, model, promptVersion,
operation, start, end, status, errorCode, cost, tokens
```

This will make one chat turn queryable as a causal graph rather than a list of rows.

### P2-4. Some asynchronous telemetry paths are intentionally fire-and-forget

Several `recordTelemetry` calls are prefixed with `void`, and direct fallback tool telemetry also runs without awaiting. The persistence outbox improves recovery, but failures can still be invisible to the caller until later logging, and test coverage does not verify every fire-and-forget path under process termination.

**Recommendation:** Use a bounded telemetry queue with explicit flush semantics at stream completion, worker completion, and shutdown. Record a counter for dropped/expired telemetry. Add process-lifecycle tests.

### P2-5. No mutation testing or fault injection at the orchestration boundary

There are useful retry/chaos tests, but no automated mutation score for conditions such as budget release, strict Full-mode gating, ownership checks, citation enforcement, and fallback suppression.

**Recommendation:** Introduce targeted mutation testing for the highest-risk modules, or a smaller custom fault-injection matrix if mutation runtime is too high.

### P2-6. Time, market data, and model nondeterminism are not standardized

The domain is time-sensitive and provider data changes continuously. Tests use a mixture of `Date.now()`, fixtures, and mocks. Eval prompts contain prices and market assumptions that can age. There is no universal clock, market snapshot ID, or fixture timestamp policy.

**Recommendation:** Add a `TestClock`, versioned market snapshots, deterministic random seeds, and case metadata:

```text
marketSnapshotId, asOf, timezone, locale, modelId, promptVersion, toolFixtureVersion
```

A live case and a replayable case should be distinct types.

### P2-7. Test documentation is behind the codebase

`docs/09-testing.md` reports older file counts and says 16 E2E specs while the repository currently contains 20. It also describes the eval harness as manual even though CI has a nightly eval job, although that job is currently incomplete.

**Recommendation:** Generate an inventory summary from the filesystem in CI or update the document after the testing redesign. Document suite tags, environment requirements, data reset rules, ownership, and expected runtime.

---

## 5. What “fully testable” should mean for Kestrel

A fully testable AI system should provide these independent confidence layers:

### Layer 1 — Pure deterministic tests

- schemas, parsers, indicators, risk math, routing rules, redaction, cost calculation;
- no network, no wall-clock dependency, no real provider.

### Layer 2 — Component contract tests

- every tool against input/output schemas;
- every provider adapter against a common provider contract;
- every BaseAgent against the specialist contract;
- every persistence writer against idempotency and ownership contracts;
- every stream adapter against the UI-message protocol.

### Layer 3 — AI orchestration integration tests

- deterministic scripted LLM;
- real tool registry;
- real tool context and abort signals;
- PGlite/Postgres persistence;
- exact budget, telemetry, diagnostics, retry, and citation assertions.

### Layer 4 — Web/worker system tests

- real HTTP route;
- real auth/CSRF in an isolated test environment;
- real queue row lifecycle;
- worker claim/lease/retry/completion;
- browser polling and rendering.

### Layer 5 — Staging provider tests

- opt-in, cost-capped, nightly or release-gated;
- provider matrix, model matrix, tool calls, streaming, usage, fallback;
- no production data or user keys.

### Layer 6 — Model-quality evals

- deterministic domain oracles;
- safety/citation oracles;
- rubric judge;
- regression baseline and statistical variance;
- latency/cost budgets;
- human review for ambiguous cases.

### Layer 7 — Production feedback and replay

- every run has a trace and version identifiers;
- user feedback links to the trace;
- failures are replayable from a redacted fixture;
- incident traces can be promoted into permanent regression cases.

---

## 6. Recommended target architecture

```text
                    ┌────────────────────────────┐
                    │ Versioned test/eval registry│
                    │ prompts, fixtures, rubrics │
                    └──────────────┬─────────────┘
                                   │
          ┌────────────────────────┼────────────────────────┐
          │                        │                        │
   deterministic suite      scripted-LLM suite       staging provider suite
   pure logic/contracts      route + DB + worker      real model, capped cost
          │                        │                        │
          └────────────────────────┼────────────────────────┘
                                   │
                    ┌──────────────▼─────────────┐
                    │ Unified run envelope        │
                    │ trace/span/version/cost/SLO │
                    └──────────────┬─────────────┘
                                   │
          ┌────────────────────────┼────────────────────────┐
          │                        │                        │
      CI gates                dashboards/alerts       feedback/annotation
      regression              SLO + drift              human labels
                                   │
                    ┌──────────────▼─────────────┐
                    │ Curated replay/training set │
                    │ approved, redacted, labeled │
                    └────────────────────────────┘
```

The important design choice is one shared run envelope. The same `traceId`, model/prompt version, fixture version, cost, latency, tool events, and result status should be available to tests, production traces, eval reports, and feedback records.

---

## 7. Training-readiness assessment and roadmap

Kestrel is **not training-ready today** in the ML/data sense. It is observability-ready enough to begin building the data plane, but raw traces must not be treated as training data automatically.

### Required data lifecycle

1. **Capture:** redacted trace, prompt, context summary, tool inputs/outputs, model output, versions, cost, latency.
2. **Filter:** remove secrets, PII, credentials, raw account identifiers, and disallowed external content.
3. **Label:** user rating, expert outcome, factual correctness, safety, citation quality, and trade-result outcome where appropriate.
4. **Review:** human approval for examples used in prompt/model improvement.
5. **Version:** dataset version, schema version, rubric version, model version.
6. **Split:** train/tune, validation, regression, and holdout sets with leakage prevention.
7. **Replay:** every accepted bad trace becomes a deterministic regression case.
8. **Monitor:** detect drift by symbol, language, mode, provider, model, and market regime.

### Training-specific guardrails

- Do not train on user conversations by default.
- Require explicit consent or an operationally approved data policy.
- Keep financial/account data out of model-improvement exports unless explicitly anonymized and approved.
- Separate synthetic examples from real user examples.
- Store labels and corrections separately from raw model output.
- Keep a held-out set that agents and prompt authors cannot inspect during tuning.

---

## 8. Prioritized implementation plan

### Phase A — Make the current gates real (1–2 weeks)

1. Fix nightly eval workflow: isolated app, DB, worker, session, artifacts, cleanup.
2. Resolve strict Full-mode acceptance-case contradiction.
3. Make E2E migration setup fail closed in CI.
4. Update testing documentation and file counts.
5. Add CI annotations/tags distinguishing mocked UI tests from real integration tests.

**Exit criteria:** nightly eval demonstrably runs against a fresh environment and fails on a deliberately broken case.

### Phase B — Build the scripted system harness (2–4 weeks)

1. Implement `ScriptedLlmClient`.
2. Add route-level single-agent tests with PGlite.
3. Add route-to-worker Full-mode tests with real job lifecycle.
4. Assert persisted messages, idempotency, telemetry, traces, budgets, retries, and streams.
5. Add provider contract fixtures and abort/error scenarios.

**Exit criteria:** one deterministic test can replay a complete chat turn and one complete Full-mode job without network access.

### Phase C — Upgrade eval quality (2–4 weeks)

1. Add structured domain oracles for prices, indicators, risk, and symbols.
2. Add citation and unsupported-claim scoring.
3. Add safety and mutation-intent cases.
4. Add prompt-injection, multilingual, stale-data, provider-failure, and malformed-output suites.
5. Add cost/latency/retry/fallback budgets.
6. Store machine-readable JSON results in addition to Markdown.

**Exit criteria:** a model change can be blocked for quality, safety, cost, or latency regression—not merely transport failure.

### Phase D — Production observability and alerting (2–3 weeks)

1. Standardize typed event/span envelopes.
2. Add durable counters/histograms for AI and worker SLIs.
3. Version alert rules and dashboard queries.
4. Add synthetic chat and Full-mode probes.
5. Verify alert delivery in a non-production channel.
6. Add missing-telemetry alerts and retention/access controls.
7. Remove PII from Sentry extras and restrict raw trace metadata.

**Exit criteria:** an operator can follow one trace from request to model/tool/queue/persistence and receive an actionable alert when the path degrades.

### Phase E — Feedback and training data plane (3–6 weeks)

1. Add trace-linked user feedback.
2. Add admin annotation/review queue.
3. Add redacted export and dataset versioning.
4. Add expert labels for correctness, safety, citation, and usefulness.
5. Add holdout regression sets and experiment comparisons.
6. Add drift reports by mode/model/provider/market regime.

**Exit criteria:** every approved training example has provenance, consent/policy status, labels, redaction status, and reproducible evaluation results.

---

## 9. Immediate action list

If only ten changes can be made next, do these in order:

1. Repair the nightly eval workflow so it actually runs.
2. Align `cases.json`, worker, orchestrator, transport, and UI with strict Full-mode semantics.
3. Add a deterministic scripted LLM client.
4. Add a real `/api/chat` + PGlite integration test.
5. Add a real enqueue → worker → poll Full-mode integration test.
6. Add deterministic numeric/citation/safety eval oracles.
7. Make E2E migrations fail closed in CI.
8. Remove email and raw sensitive payloads from Sentry/diagnostic metadata.
9. Add typed production metrics and monitor missing telemetry.
10. Add trace-linked user feedback and a reviewed annotation queue.

---

## 10. Final assessment

Kestrel is ahead of a typical application in deterministic test breadth and has a credible foundation for operational diagnostics. The architecture already contains many of the right primitives: DI seams, PGlite, persistence outbox, trace IDs, structured logs, tool telemetry, SLO calculations, Sentry, Langfuse, and Playwright artifacts.

The central risk is **false confidence from mocked boundaries and coarse eval assertions**. The next maturity step is not adding hundreds more unit tests. It is creating a deterministic full-system harness, making the live eval gate executable, resolving behavioral contract drift, and building a governed feedback/data loop.

After Phases A–C, the rating should reasonably rise to **7.5–8.0/10**. After Phases D–E, with verified alerting, privacy controls, replayability, and human-labeled evaluation data, the system could qualify as a genuinely advanced AI testing, debugging, monitoring, and training platform.
