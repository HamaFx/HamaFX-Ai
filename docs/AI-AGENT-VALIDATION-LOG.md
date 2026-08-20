# Kestrel AI Agent and Mastra Validation Log

**Status:** Historical and operational evidence  
**Last reviewed:** 2026-08-19  
**Scope:** Mastra implementation milestones, evaluations, deployments, and known validation gaps

> This is an evidence log, not the active plan. For current decisions and remaining work, see the [AI and Mastra roadmap](AI-AGENT-MASTRA-ROADMAP.md). For the current implementation boundary, see the [AI agent architecture](AI-AGENT-ARCHITECTURE.md).

## How to read this log

- **Implemented:** the repository contains the described code path.
- **Validated:** a test, fixture, or smoke run was recorded as passing.
- **Deployment evidence:** an operator reported or inspected the deployment; verify again before relying on it for a release decision.
- **Pending:** the evidence is incomplete or contaminated and must not be treated as a quality verdict.

This log intentionally avoids storing provider credentials, raw user prompts, or raw model outputs.

## 1. Guarded proof-of-concept entry point — implemented

The isolated Mastra proof of concept has a development-only endpoint:

```text
POST /api/dev/mastra/xauusd
```

Required conditions:

- `NODE_ENV=development`
- `ENABLE_MASTRA_POC=true`
- Authenticated user
- Thread owned by that user
- Valid XAUUSD research prompt

The endpoint is intentionally separate from the default production chat route. It was designed for real BYOK and market-data testing before shadow mode.

The implementation was split into focused modules including:

- Agent constants and versioning
- Usage statistics and outcome classification
- BYOK/model execution
- Run and tool telemetry
- Tool schemas
- Price, candle, and indicator tools
- Compatibility barrels

## 2. Deterministic research packet — implemented and fixture-tested

The first bounded composite research scope collects in parallel:

- XAUUSD price
- Daily, 4-hour, 1-hour, and 15-minute candles
- EMA 20 and EMA 50
- RSI 14
- MACD 12/26/9
- ATR 14
- Bollinger Bands 20/2

The packet is assembled through small modules for configuration, types, fetch, candle evidence, indicators, assembly, stages, and the Mastra tool boundary.

Required price, candle, and indicator failures produce a `blocked` packet with typed missing-data information. Optional macro/news/calendar/dollar/yield gaps remain visible and do not cause fabricated evidence.

Metrics added for this stage include:

- `mastra_research_packet_total`
- `mastra_research_packet_blocked_total`

The research behavior/evidence milestone used agent version `poc-2`.

## 3. Structured report and deterministic verification — implemented

The synthesis path was separated into:

```text
Collect packet in TypeScript
    → pass trusted context to Mastra
    → generate structured report
    → verify schema, evidence, quality, confidence, and scenarios
```

The report requires:

- XAUUSD symbol and analysis timestamp
- Data quality and confidence
- Bias and regime
- Technical and fundamental summaries
- Bullish and bearish scenarios
- Trigger, invalidation, and risk for each scenario
- Evidence IDs and source timestamps
- Contradictions and missing-data disclosure

The verifier rejects unknown evidence IDs, incorrect data-quality claims, omitted missing-data warnings, excessive confidence, blocked packets, and unsafe/incomplete scenarios.

## 4. Compact model context — implemented and tested

The complete packet remains available to deterministic verification, but the synthesis model receives a compact view:

- Latest 12 candles per timeframe
- Latest 3 values for each indicator series
- Evidence IDs
- Source and timestamps
- Freshness and quality
- Counts, warnings, and missing-data notices

This prevents model context from growing with the full historical research window. The implementation lives in `packages/ai/src/mastra/model-context.ts`.

## 5. Deterministic grounding evaluation — implemented

Structured reports require explicit `numericClaims` containing:

- Label
- Numeric value
- Evidence ID
- Optional rounding tolerance

The verifier checks claims against deterministic packet evidence and reports:

- Unsupported values
- Future report timestamps
- Undisclosed stale evidence
- Invalid structure
- Missing scenario safety requirements

Metrics include:

- `mastra_report_verification_total`
- `mastra_report_verification_failed_total`

Offline fixtures cover expected-valid and expected-invalid reports without live providers.

**Known limitation:** validation is strongest for structured claims. Numbers embedded in free-form narrative are not yet exhaustively extracted and bound to evidence.

## 6. Live Mistral validation — partially validated

A local smoke run used a configured Mistral key without printing or persisting the credential.

Recorded results:

- Provider authentication succeeded.
- `mistral-small-latest` generated a structured XAUUSD report from a trusted fixture packet.
- Deterministic verification accepted the report.
- Live data collection failed closed when required market data was unavailable.

The initial live packet was blocked because the local BiQuote URL was a placeholder and the Finnhub candle path returned no usable XAUUSD data. The recorded remediation was to use `https://biquote.io` and a valid Finnhub configuration.

The authenticated endpoint was not used to mutate the configured remote database during this validation.

## 7. Bounded report repair — implemented and tested

A Mistral run exposed a legitimate verifier failure: a contradiction between timeframe signals was omitted.

The repair policy is bounded:

1. Generate a structured report.
2. Verify it.
3. Make one repair request containing only verifier findings.
4. Verify again.
5. Apply a deterministic contradiction disclosure only for the specifically proven conflict case.
6. Fail closed otherwise.

The repair path cannot invent prices, levels, indicators, or conclusions. It records `mastra_report_repair_total` with `requested`, `passed`, `patched`, or `failed` outcomes and uses agent version `poc-3`.

A later run with the corrected BiQuote URL produced:

- Ready XAUUSD packet
- Partial data quality when optional macro providers were absent
- `mistral-small-latest`
- Passing verification
- Two generation attempts

## 8. Feature-flagged chat rollout — implemented

Mastra can be reached through the normal `/api/chat` contract only when:

- `mastra_xauusd_chat` is enabled, or non-production `ENABLE_MASTRA_CHAT=true` is set
- The request is single-agent mode
- No explicit model override is selected
- The prompt is read-only XAUUSD/gold analysis
- The request does not mix symbols, contain injection markers, or request mutations

The adapter reuses budget reservation, message idempotency, existing chat SSE events, and report metadata. The UI renders a report card with bias, confidence, summaries, scenarios, warnings, and evidence timestamps.

If routing or execution fails, the legacy agent remains the user-facing fallback.

Covered tests recorded in the implementation:

- `apps/web/test/mastra-chat-routing.test.ts`
- `apps/web/test/mastra-chat-service.test.ts`
- `apps/web/test/mastra-report-card.test.tsx`
- `apps/web/test/api-chat-route.integration.test.ts`

## 9. Shadow comparison — implemented, operational evidence pending

The independent shadow flag is:

```text
mastra_xauusd_shadow
```

Non-production override:

```env
ENABLE_MASTRA_SHADOW=true
```

The shadow path:

- Uses existing BYOK resolution
- Reserves and reconciles daily budget
- Has a 30-second timeout
- Does not write duplicate messages or titles
- Keeps shadow failures away from the user-facing response
- Persists aggregate comparison data rather than raw text
- Uses separate telemetry kinds for Mastra and legacy shadows

Stored comparison data includes character counts, shared-token ratio bucket, verification status, Mastra bias/data quality, duration, cost, and failure/skip reasons.

Both rollout flags were reported as enabled in the private production environment. This is deployment evidence and still requires fresh runtime verification.

## 10. Comparison dashboard and governed feedback — implemented

The comparison system includes:

- `ai_shadow_comparisons` persistence
- Prompt hashes and aggregate fields only
- Admin-only AI Compare dashboard
- Completion, verification, overlap, latency, cost, and failure summaries
- User/tenant fields omitted from client DTOs
- Idempotent migration `0080_ai_shadow_comparisons`

The feedback path is governed:

- User ratings are hints, not automatic labels.
- Only reviewer-labelled feedback enters governed exports.
- Rejected and `needs_review` records are excluded.
- Reviewer notes and issue codes are redacted into annotations.
- Manual and worker exports share the annotation resolver.
- Dataset manifests are content-addressed and omit raw prompt/output by default.

## 11. Macro evidence — implemented and fixture-tested

The packet optionally collects:

- Gold-relevant news using existing failover adapters
- Upcoming USD economic events
- FRED dollar-index observations (`DTWEXBGS`)
- FRED real yields (`DFII10`)
- FRED breakeven inflation (`T10YIE`)

Macro evidence has provenance and its own evidence ID. Provider gaps are typed and visible. Technical research remains usable when optional macro sources degrade, and a total macro outage produces a typed gap rather than fabricated context.

Fixture coverage records complete data, partial failures, empty results, timestamp handling, and packet assembly.

## 12. Review boundary — operational procedure

After deployment, the intended review sequence is:

1. Send safe XAUUSD analysis prompts.
2. Confirm the report card is useful.
3. Check **Admin → AI Compare** for completed and failed comparisons.
4. Label feedback in **Admin → Feedback**.
5. Export only after reviewing labels in **Admin → Datasets**.
6. Compare grounding, missing-data disclosure, latency, cost, and user feedback—not token overlap alone.

Legacy fallback should not be disabled and mutation tools should not be added until this review produces meaningful evidence.

## 13. Feedback regression and report follow-ups — implemented

Reviewer-labelled failures create durable `ai_regression_cases` records containing source IDs, hashes, issue codes, and reviewer notes. Raw conversation text is not copied into the regression table.

Admins can resolve, dismiss, reopen, and inspect cases. The dashboard supports time-window, agent, outcome, verification, and daily trend filters.

Read-only report-aware follow-ups:

- Inherit only a schema-validated prior report
- Receive a fresh bounded packet
- Cannot use mutation tools
- Must fail closed on unsupported new market numbers

## 14. Vendor-neutral evaluation gate — implemented and offline-tested

The evaluation runner emits a machine-readable quality gate alongside Markdown and JSON reports. The gate checks:

- Transport success rate
- Case/assertion pass rate
- Grounding/citation score
- Safety failures represented by assertion failures
- Average time to first token
- Total latency
- Average reported model cost

Thresholds are configurable with `EVAL_*` environment variables. Explicitly disabled maxima are supported. A live evaluation exits non-zero when the gate fails.

The offline suite uses MSW-recorded streams and no provider credentials. It covers passing and failing gates, threshold parsing, empty runs, grounding/safety assertions, latency, cost, and transport failures.

Schemas:

- `kestrel.eval-report.v1`
- `kestrel.eval-gate.v1`

## 15. Regression catalog and deployment evidence — 2026-08-19

The repository contains a 50-case regression catalog covering:

- Research tools
- Macro evidence
- Stale and missing data
- Grounding
- Prompt injection
- Unsafe certainty
- Mutation confirmation
- Report follow-ups
- Agent modes
- Provider failures
- Cost awareness
- Transport failures

A structural test enforces count, uniqueness, and minimum coverage.

Recorded private deployment evidence:

- Deployment status: `Ready`
- Reported commit: `8c4d9dcd`
- Migration chain: 83 entries, including `0082` and `0083`
- `ai_regression_cases` table present
- `mastra_xauusd_chat` enabled
- `mastra_xauusd_shadow` enabled
- Operator Mastra model pin reported as `google:gemini-3.6-flash`

The deployment details should be rechecked after every environment or model change. The CLI inspection did not expose a Git SHA for the Ready deployment.

## 16. Provider validation evidence

Recorded operator-key checks used one-token provider pings without printing credentials:

- Mistral: passed
- Vertex: configured but failed JSON parsing; service-account environment data needs correction
- Other operator keys: not configured and require user BYOK credentials for live validation

The presence of an environment variable is not equivalent to successful model execution.

## 17. Production fixes found during evaluation

The first Gemini evaluation exposed and the implementation recorded fixes for:

- Legacy AI SDK adapter using a removed v4 method; updated to `toUIMessageStreamResponse()`.
- Google defaults targeting Gemini 2.5 entries that returned 404 for new keys; active defaults moved to the available Gemini 3.x line, with Mastra pinned to Gemini 3.6 Flash.
- AI Compare persistence failures caused by missing tenant-resolution triggers; migrations `0082_fix_missing_tenant_triggers.sql` and `0083_guard_tenant_triggers.sql` repair the affected tables while preserving fresh PGlite compatibility.

These fixes are recorded as deployed/tested evidence, but runtime verification remains necessary after fresh deployments.

## 18. Current pending validation gates

The following items were explicitly not complete at the last review:

1. Quota-clean Mastra-versus-legacy evaluation with at least 20 successful verified reports.
2. Fresh production verification of `google:gemini-3.6-flash` model selection.
3. Human-reviewed comparison quality decision.
4. More provider validation for the remaining BYOK registry.
5. Stronger handling of malformed structured fields and unsupported/invented evidence IDs.
6. Provider-key rotation after credentials were exposed during setup.
7. Removal of temporary operator scripts under `packages/ai/scripts/`.
8. Decision on whether and when to reduce or remove legacy orchestration.

A quota-contaminated run must not be used as a quality verdict.

## 19. Validation command record

The following checks were recorded during the 2026-08-19 review:

- `pnpm typecheck`: passed; 14 Turbo tasks successful.
- AI package test suite: 1,215 tests passed.
- Full PGlite migration-chain validation: 10 tests passed.
- The pre-fix web production build compiled and typechecked, then failed during `/news` prerender because the local database connection rejected a self-signed certificate.
- The pre-fix build also emitted a warning that `AUTH_MODE=legacy` was set in a production environment.

The pre-fix build failure was a release/build-environment issue, not a TypeScript compilation failure. The release-correctness fixes and their follow-up validation are recorded below.

## 20. Evidence maintenance rules

When adding a validation entry:

- Include the date.
- Name the exact command, test, route, or deployment observation.
- Distinguish source verification from deployment evidence.
- Never record secrets or raw user/model content.
- Record provider/model identifiers and versions.
- State whether the result is complete, partial, degraded, or pending.
- Link the related roadmap gate when one exists.
- Do not mark a quality decision complete based only on transport success or token overlap.

## 21. Release-correctness fixes — 2026-08-19

The two release blockers identified in the earlier build were corrected:

- `apps/web/src/app/(app)/news/page.tsx` now exports `dynamic = 'force-dynamic'` instead of `revalidate = 300`, preventing user-scoped database content from being fetched during `next build`.
- `apps/web/src/lib/env.ts` now throws when `AUTH_MODE=legacy` is present with `NODE_ENV=production`, so a production artifact cannot be created with authentication disabled.
- `apps/web/test/auth-config.test.ts` covers normal production auth, legacy production rejection, development legacy compatibility, and missing production secrets.

Validation results:

- Focused web tests: 15 tests passed across `auth-config.test.ts` and `middleware.test.ts`.
- `pnpm typecheck`: 14 Turbo tasks passed.
- Default local build with the legacy setting: failed closed during route configuration with the expected security error.
- Build with `AUTH_MODE=normal`: completed successfully, including static generation and service-worker generation.
- The build route table reports `/news` as dynamic (`ƒ /news`).

This proves the code-level release blockers are fixed. Deployment verification still requires the production environment to use an explicit non-legacy authentication configuration.

## 22. Narrative numeric grounding hardening — 2026-08-19

The report verifier now scans narrative fields, including summaries, contradictions, missing-data explanations, and scenario triggers, invalidation, entry zones, targets, and risks.

Rules:

- Every narrative price, level, percentage, range, or measurement must match a verified `numericClaims` value within that claim's tolerance.
- Timeframe notation such as `1h`, `15-minute`, and `10-year` remains allowed as structural context.
- Indicator-period notation such as `EMA 20`, `RSI 14`, and `MACD 12/26/9` remains allowed.
- Unsupported narrative numbers produce a deterministic grounding finding and block the report.
- The synthesis instructions explicitly require this contract.

Validation:

- Mastra verifier/evaluation tests: 15 focused tests passed (12 verifier, 3 evaluation).
- Full AI package suite: 125 test files and 1,220 tests passed.
- Monorepo typecheck: 14 Turbo tasks passed.

This closes the previously documented gap where only the structured `numericClaims` array was checked while free-form narrative numbers could bypass deterministic verification.

## 23. Local-only completion boundary — 2026-08-19

The remaining live gates were intentionally not executed during this local implementation pass:

- No Gemini calls were made.
- No production endpoint was called.
- No external provider smoke check was run.
- No provider credentials were changed or written.

Tomorrow, after the Gemini quota resets, run the clean small-batch evaluation and production model-selection verification described in the roadmap. Keep the first batch small, record quota/transport failures separately from quality failures, and do not make a routing decision until successful verified reports have been human-reviewed.

## 24. Initial full-parity foundation — 2026-08-19

The first implementation slice for expanding Mastra beyond the XAUUSD proof of concept is now present:

- `packages/ai/src/mastra/capabilities.ts` defines a typed capability registry and deterministic eligibility policy.
- The current `xauusd-research` capability explicitly allows only XAUUSD, Single/Auto mode, read-only execution, required evidence, bounded steps, and cancellation.
- Unknown capabilities, unsupported symbols or modes, explicit model overrides, and mutation requests fail closed before model execution.
- The existing web chat route consults this policy while retaining legacy fallback.
- Focused tests cover the capability registry and routing boundary.

Validation:

- Mastra capability tests: 8 passed.
- Mastra chat-routing tests: 14 passed.
- Monorepo typecheck: 14 Turbo tasks passed.
- AI package build: passed.
- No provider or production calls were made.

This was the foundation for full chat parity. The conversational Single-mode slice built on it is recorded in the next section; full parity remains incomplete.

## 25. Conversational Single-mode slice — 2026-08-19

Mastra now has a separate conversational runner for eligible XAUUSD Single/Auto requests:

- Deep research continues through the structured report generation and verification path.
- Ordinary eligible explanations use plain-text `Agent.generate()` with `toolChoice: 'auto'` and an explicit allowlist of three narrow read-only tools over a trusted server-collected packet.
- Follow-up request context now includes the prior verified report when one is supplied.
- The web service selects the research or conversational runner explicitly.
- Existing budget reservation/reconciliation, user-message and assistant persistence, abort signal, telemetry, UI SSE response, and legacy fallback remain in place.

Validation:

- AI Mastra runner and capability tests: 13 passed.
- Web Mastra routing, service, and chat-route tests: 31 passed.
- Monorepo typecheck: 14 Turbo tasks passed.
- AI package build: passed.
- No provider or production calls were made. This is still XAUUSD-only. It does not yet provide general-symbol conversational parity, Quick/Standard/Full Mastra modes, or Mastra support for the complete legacy tool registry.

## 26. First read-only parity adapters — 2026-08-19

Mastra now exposes three scoped adapters for narrow XAUUSD conversational follow-ups:

- `getXauusdMarketStructure` delegates to the existing deterministic market-structure calculation.
- `getXauusdSessionLevels` delegates to the existing UTC session slicing calculation.
- `analyzeXauusdTechnical` delegates to the existing deterministic multi-timeframe technical projection.

Each adapter:

- Uses a Mastra `createTool` contract with strict XAUUSD input and output schemas.
- Reuses the existing deterministic calculation through shared pure projection helpers.
- Reads `getCandlesWithMeta` once and preserves provider source, produced-at time, latest candle time, and stale state.
- Preserves the authenticated request context, abort signal, and Mastra tool telemetry boundary.
- Returns a scoped evidence envelope with short-window, stale, and partial-timeframe warnings.
- Is available to conversational runs only through an explicit three-tool allowlist.
- Leaves the structured deep-report path and all mutation paths unchanged.

Provider freshness is now represented honestly: fresh data is marked `fresh`, stale-while-error data is marked `stale`, and empty/failed reads remain `unknown` or partial. The adapters do not infer freshness from the current wall clock and do not change the legacy AI SDK output contracts.

Local validation:

- Migrated market-tool adapter tests: 4 passed.
- Legacy structure/session/technical tests: 19 passed.
- Full AI package suite: 127 test files and 1,234 tests passed.
- Monorepo typecheck: 14 Turbo tasks passed.
- AI package build: passed.
- Prettier checks for all new adapter and adapter-test files: passed.
- No Gemini, production, or external provider calls were made.

The next parity step is to expand this provider-aware pattern to additional read-only tools. General symbols, Quick/Standard/Full modes, mutations, committees, and durable worker workflows remain outside this slice.

## 27. Additional context-tool adapters — 2026-08-19

Mastra now exposes three more XAUUSD-scoped, read-only adapters for narrow conversational follow-ups:

- `getXauusdCorrelation` delegates to the deterministic multi-symbol correlation matrix and two-leg DXY proxy.
- `getXauusdIntermarket` delegates to the deterministic gold/dollar pulse, correlation, regime, and regime-break calculation.
- `forecastXauusdVolatility` delegates to the ATR-based forward-volatility forecast, including event adjustment and the optional live-price range.

Each adapter:

- Uses a strict Mastra `createTool` input/output contract and rejects symbols outside XAUUSD for the volatility path.
- Reuses the existing legacy calculation rather than duplicating domain math.
- Preserves the authenticated request context, abort signal, and Mastra tool telemetry boundary.
- Returns an evidence envelope with an explicit source, timestamp, data quality, warnings, and the original typed result.
- Preserves partial intermarket results and explains the two-leg DXY proxy limitation.
- Explains missing live-price range data instead of fabricating a range.
- Is available only through the conversational six-tool allowlist; deep reports remain packet-backed and mutation paths remain unchanged.

These composite legacy tools do not yet expose complete per-source freshness metadata. Their envelopes therefore use `freshness: "unknown"` and `quality: "degraded"` deliberately. The next metadata task is to fetch or expose source metadata for each underlying symbol/event series without changing the legacy output contract.

Local validation:

- Context-tool adapter tests: 3 passed.
- Focused Mastra capability, runner, POC, market-tool, and context-tool tests: 26 passed.
- Full AI package suite: 128 test files and 1,237 tests passed.
- Web Mastra/chat integration tests: 31 passed.
- AI package build: passed.
- Monorepo typecheck: 14 Turbo tasks passed.
- Prettier checks for all newly added context-tool files and tests: passed.
- `git diff --check`: passed.
- No provider, production, or external service calls were made.

General symbols, news/calendar adapters, Quick/Standard/Full modes, mutations, committees, and durable worker workflows remain outside this slice.

## 28. Untrusted news and calendar adapters — 2026-08-19

Mastra now exposes two additional XAUUSD-scoped, read-only tools for explicit conversational requests:

- `getXauusdNews` delegates to the cached `get_news` contract and preserves article publication timestamps, source, publisher, URL, sentiment, and pipeline-pending state.
- `getXauusdCalendar` delegates to the cached `get_calendar` contract, restricts the Mastra path to USD events, and preserves scheduled event time, importance, actual, forecast, previous, unit, and source.

Both adapters:

- Use strict Mastra input/output schemas and reject unsupported symbol/currency scope.
- Preserve the authenticated request context, abort signal, and Mastra tool telemetry boundary.
- Mark their payloads with `contentTrust: "untrusted"`.
- Explicitly instruct the agent that titles, summaries, URLs, publishers, event titles, and source labels are evidence only, never instructions.
- Preserve publication/event timestamps instead of converting external content into current market facts.
- Report `pipelinePending` and empty filtered results distinctly.
- Remain in the conversational eight-tool allowlist only; the verified deep-report path stays packet-backed and does not receive these tools.

Because the cached news and economic-event tables do not expose ingestion timestamps, both adapters deliberately return `freshness: "unknown"` and `quality: "degraded"`. This is a known parity limitation, not a freshness inference.

Local validation:

- News/calendar adapter tests: 5 passed.
- Focused Mastra capability, runner, POC, market, context, and news/calendar tests: 32 passed.
- AI package typecheck: passed.
- AI package build: passed.
- Prettier checks for new adapters and touched Mastra contract files: passed.
- `git diff --check`: passed.
- No provider, production, or external service calls were made.

General symbols, full macro-provider parity, Quick/Standard/Full modes, mutations, committees, and durable worker workflows remain outside this slice.

## 30. Combined XAUUSD fundamental-context capability — 2026-08-19

Mastra now exposes `getXauusdFundamentalContext`, a bounded composite capability for explicit fundamental, catalyst, macro, news, and sentiment questions. It combines:

- The existing parallel XAUUSD macro fetch for news, economic events, dollar observations, real yields, and inflation expectations.
- The shared social-sentiment service with its available/unavailable fallback semantics.
- One Mastra evidence envelope containing macro evidence, social evidence, warnings, missing-data categories, freshness, and quality.

The capability:

- Aggregates provider failures without hiding available evidence.
- Produces `complete`, `partial`, or `degraded` quality based on macro availability and missing categories.
- Preserves the untrusted-content boundary for news, calendar, macro, and social data.
- Uses the authenticated Mastra request context and telemetry boundary.
- Forwards cancellation to both macro and sentiment work and rechecks cancellation after all-settled macro collection.
- Is available only through the conversational allowlist; the deep structured-report path remains packet-backed and unchanged.

Local validation:

- Combined fundamental-context tests: 5 passed.
- Full AI suite: 131 test files, 1,252 tests passed.
- Web Mastra/chat regressions: 10 test files, 41 tests passed.
- Monorepo typecheck: 14 Turbo tasks passed.
- AI package build: passed.
- Targeted Prettier checks for changed Mastra implementation/test files: passed.
- `git diff --check`: passed.
- No provider, production, or external service calls were made.

The repository-wide Mastra Prettier check still reports pre-existing drift in older files and documentation; those unrelated files were intentionally not reformatted.

The next gate is the clean Mastra-versus-legacy evaluation. Generalized modes, mutations, committees, and durable worker workflows remain rollout-gated; the next implementation batch is recorded below.

## 29. Social-sentiment adapter — 2026-08-19

Mastra now exposes `getXauusdSocialSentiment` for explicit, narrow conversational requests. The adapter uses the shared `SocialSentimentService` directly rather than invoking the legacy AI SDK tool wrapper, because that wrapper depends on the legacy `AsyncLocalStorage` tool context established by `runChat()`. The shared service preserves the same aggregation, provider fallback, unavailable-data, and abort behavior without coupling Mastra to that legacy runtime context.

The adapter:

- Enforces XAUUSD-only input.
- Preserves overall label, score, contrarian signal/note, per-source breakdown, sample size, availability, and fetch timestamp.
- Marks social and retail-positioning data with `contentTrust: "untrusted"`.
- Explicitly distinguishes `available: false` neutral fallback output from usable sentiment evidence.
- Classifies available recent results as fresh/stale from the service fetch timestamp and unavailable results as `unknown` freshness/degraded quality.
- Preserves cancellation failures and runs within the Mastra authenticated request-context/telemetry boundary.
- Is in the conversational nine-tool allowlist only; it is not a required input to the verified deep-report path.

Local validation:

- Social-sentiment adapter tests: 4 passed.
- Focused Mastra capability, runner, POC, news/calendar, context, and social-sentiment tests: 33 passed.
- AI package typecheck: passed.
- AI package build: passed.
- Prettier checks: passed.
- `git diff --check`: passed.
- No provider, production, or external service calls were made.

Generalized modes, mutations, committees, and durable worker workflows remain rollout-gated; the generalized mode foundation and worker integration are recorded below.

## 31. Generalized symbols and five-phase Mastra mode foundation — 2026-08-19

This batch implemented the next five local phases together without removing the legacy runtime:

- Generalized technical research contracts for all 18 canonical catalog symbols (`XAUUSD`, 11 forex pairs, and 6 crypto pairs).
- Deterministic symbol extraction, canonical validation, mixed-symbol rejection, mutation/prompt-injection rejection, bounded 1d/4h/1h/15m collection, freshness/provenance, required-data blocking, and abort propagation.
- Quick mode over one shared packet with one technical specialist.
- Standard mode over one shared packet with technical and fundamental specialists plus fusion.
- Full-mode foundation over one shared packet with four specialists plus fusion, strict specialist-failure behavior, and no partial final result.
- Web routing and SSE-compatible response envelopes for Quick/Standard behind `mastra_modes` / `ENABLE_MASTRA_MODES`.
- Full worker routing behind `ENABLE_MASTRA_FULL`, inside the existing analysis-job claim/lease/retry/idempotency/persistence boundary, including a daily budget reservation with reconcile/release handling.
- Evaluation minimum-case and minimum-successful-case thresholds through `EVAL_MIN_CASES` and `EVAL_MIN_SUCCESSFUL_CASES`.
- Regression coverage for generalized symbols, blocked packets, cancellation, route policy, mode response contracts, and the worker integration boundary.

Local validation:

- AI suite: 133 test files, 1,260 tests passed.
- Focused generalized-mode/evaluation tests: 12 passed.
- Web Mastra/chat regressions: 33 tests passed.
- Worker suite: 23 test files, 100 tests passed.
- Monorepo typecheck: 14 Turbo tasks passed; AI, web, and worker package typechecks passed.
- AI build: passed.
- Web production build with explicit `AUTH_MODE=normal`: passed, including static generation and service-worker generation.
- A build with the local `AUTH_MODE=legacy` value failed closed as designed; the production security guard was not weakened.
- Targeted Prettier checks: passed.
- `git diff --check`: passed.
- No provider, production, or external service calls were made.

This is an implementation and local-validation milestone, not a quality verdict. The live quota-clean Mastra-versus-legacy evaluation, production feature-flag rollout, model-selection verification, human review, and legacy cutover remain open.

## 32. Read-only parity, memory, background, and mutation-policy foundations — 2026-08-19

The next five-phase implementation batch is now present as gated local code. It does not enable new production traffic or mutate user data.

Implemented:

- Remaining read-only Mastra adapters for seasonality, COT, intermarket resonance, bounded public web search, and untrusted knowledge retrieval. Each adapter validates inputs/outputs, preserves abort handling and telemetry, and reports historical or unavailable freshness honestly.
- XAUUSD conversational allowlisting for the expanded read-only set. External news, web, calendar, social, macro, and knowledge content is marked as untrusted data and cannot satisfy an action request.
- Opt-in Mastra memory context through `ENABLE_MASTRA_MEMORY=true`. It loads authenticated recent thread context and user-scoped historical journal/briefing/thread-synopsis recall, while explicitly separating memory from current market evidence. Memory failures degrade to an empty context rather than blocking market research.
- `runMastraBackgroundText`, a bounded no-tool Mastra runner with existing BYOK/model resolution, request context, run telemetry, cancellation, and legacy-owned persistence. Briefings, weekly review, and title generation are opt-in through `ENABLE_MASTRA_WORKER_AI=true`; bot/Telegram free-form messages are opt-in through `ENABLE_MASTRA_BOT_AI=true`.
- `mutation-workflows` capability metadata and `mutation-policy.ts`. Mutations require both `ENABLE_MASTRA_MUTATIONS=true` and an explicit server-side confirmation; the flag is absent by default, and no research workflow exposes mutation tools.

Local validation:

- AI Mastra regression suite: 20 test files, 87 tests passed.
- Briefing, title, and mutation regression tests: 3 files, 37 tests passed.
- Web Mastra/chat regressions: 10 files, 43 tests passed.
- AI and DB builds: passed.
- Web and worker typechecks: passed.
- No provider, production, or external service calls were made.

Remaining gates are deliberate: quota-clean quality evaluation, production canary approval, complete RAG/vision/journal-review parity, audited confirmation-state persistence, provider validation, and eventual legacy-orchestration removal. The new flags must remain disabled until those gates are reviewed.

## 33. Specialist Mastra tool-boundary hardening — 2026-08-19

The remaining direct AI SDK execution inventory was rechecked after the runtime-blocker batch. Specialist agents were the one unsafe bypass: their Mastra branch was passing legacy AI SDK tool descriptors directly into `Agent.generate()`.

Implemented:

- Added `adaptLegacyReadOnlyTools()` to convert the already-selected specialist tool map into genuine Mastra tools while preserving legacy tool names.
- Forwarded authenticated Kestrel tool context and cancellation through the existing telemetry adapter.
- Rejected known mutation tools at the adapter boundary, even if a future specialist declaration accidentally includes one.
- Kept the existing AI SDK specialist path as the controlled rollback branch.
- Classified remaining direct SDK calls as intentional provider/model compatibility, embeddings, legacy UI streaming, grounded committee fallback, or explicit rollback branches.

Validation:

- AI typecheck: passed.
- AI specialist/tool regression tests: 33 passed.
- AI suite excluding the known unrelated retry timing test: 136 files, 1,253 tests passed.
- AI production build: passed.
- Targeted Prettier checks and `git diff --check`: passed.
- No provider, production, or external service calls were made.

The migration target remains Mastra for orchestration, not removal of the AI SDK-compatible model/provider layer. The next gates are live provider/tool execution, quota-clean evaluation, and canary review.

## 34. Production orchestration cutover — 2026-08-20

The old Kestrel orchestration is no longer reachable from production entrypoints.

- `/api/chat` is Mastra-only: verified XAUUSD reports, canonical chat, symbol-scoped Quick/Standard/Single modes, and durable Full queueing have no legacy fallback.
- The worker Full-analysis job is Mastra-only inside the existing lease, retry, budget, persistence, and idempotency boundary.
- Bot commands and Telegram free-form messages use the Mastra background runner and return explicit errors instead of invoking `runChat`.
- Briefings, weekly reviews, titles, semantic routing, provider tests, journal review, thread summaries, and chart-image analysis use Mastra by default; deterministic fallbacks remain where safe, while AI SDK calls are retained only for provider/transport compatibility.
- The unused legacy specialist/orchestrator implementation and its legacy-only tests were removed.
- The old `runChat` implementation remains only in the isolated shadow/evaluation harness so the final comparison archive can still be produced. It is not exported from the main `@kestrel/ai` barrel and is not used by production chat or worker code.

Local cutover checks completed:

- AI, web, and worker typechecks passed.
- AI package build passed.
- Mastra web boundary tests: 33 passed.
- Mastra worker boundary tests: 3 passed.
- No live provider or production calls were made during this cutover.

Remaining release gates are live provider validation, quota-clean quality evaluation, and eventual deletion of the isolated comparison harness after its evidence is preserved.

## 35. Final local cutover validation — 2026-08-20

The Mastra production-orchestration cutover and final local validation are complete.

Implementation boundary:

- Production `/api/chat` no longer invokes the legacy agent.
- Durable Full analysis, worker AI paths, bot, Telegram, briefings, titles, semantic routing, journal review, thread summaries, and chart-image analysis use Mastra-backed execution or deterministic fail-closed behavior.
- The legacy specialist/orchestrator source and legacy-only tests were removed.
- The only remaining `runChat()` call is the isolated admin shadow comparator, retained temporarily for the final quality archive.
- The AI SDK remains only as a provider/model and transport compatibility layer: `LanguageModel` adapters, `LlmClient`, provider probes, embeddings/vision integrations, gateway compatibility, and the isolated comparator.

Validation completed:

- AI: **126 test files / 1,159 tests passed**.
- Web: **111 test files / 1,006 tests passed**.
- Worker: **23 test files / 100 tests passed**.
- DB: **24 test files / 170 tests passed**.
- Monorepo typecheck: **14 Turbo tasks passed**.
- AI, web, and worker production builds passed.
- `git diff --check` passed.
- Focused formatting checks for the final changed files passed.

The repository-wide Prettier scan still reports pre-existing formatting drift across unrelated files; those files were not reformatted as part of this migration. No live provider, production endpoint, or credential mutation was performed during this local validation.

Remaining operational gates are intentionally outside local code validation: quota-clean Mastra-versus-legacy comparison, human review, fresh production model-selection verification, remaining BYOK-provider checks, provider-key rotation, and removal of the temporary operator scripts and isolated shadow comparator after evidence preservation.
