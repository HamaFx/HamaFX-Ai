# Kestrel AI Agent and Mastra Roadmap

**Status:** Mastra production orchestration cutover complete; validation and evaluator retirement remain
**Scope:** AI and agent system only  
**Primary market:** XAUUSD  
**Last updated:** 2026-08-20

## Document navigation

This roadmap is the active plan and decision record. It intentionally does not contain the complete historical implementation diary.

- [Current AI architecture](AI-AGENT-ARCHITECTURE.md) — what is implemented now
- [Mastra migration inventory](AI-AGENT-MASTRA-MIGRATION-INVENTORY.md) — legacy parity matrix and cutover gates
- [Validation log](AI-AGENT-VALIDATION-LOG.md) — dated milestones, tests, deployment evidence, and known gaps
- [General architecture](01-architecture.md)
- [Security guide](10-security.md)
- [Testing guide](09-testing.md)
- [OSS release checklist](14-oss-release-checklist.md)

## 1. Executive decision

Kestrel should use **Mastra where it reduces AI orchestration complexity**, but Mastra should not replace the entire application or be adopted for framework consistency alone.

Mastra is the intended home for:

- Agent definitions
- Bounded research workflows
- Tool coordination
- Structured synthesis
- Request context
- Agent evaluations and traces where useful
- Future suspend/resume approval workflows

Kestrel remains responsible for:

- Next.js and the existing chat UI
- Authentication and authorization
- PostgreSQL, Drizzle, and PGlite
- User and tenant isolation boundaries
- Existing market-data providers and failover
- BYOK encryption and provider credential resolution
- Budget enforcement and business audit records
- Node worker infrastructure
- TradingView and application UI concerns
- Grafana/application observability integration

The migration is **proof-first**. Mastra now owns production orchestration. The former agent is retained only in the isolated shadow/evaluation comparator until quota-clean quality evidence is preserved; it is not a production fallback. AI SDK-compatible provider/model transport remains intentionally underneath Mastra.

## 2. Current implementation status — 2026-08-19

A checked item means that the code path exists and has been validated at the stated level. It does not mean the whole Mastra migration is complete.

### Implemented

- [x] Guarded Mastra XAUUSD proof of concept using the existing Kestrel BYOK/model resolver.
- [x] Deterministic XAUUSD research packet with price, multi-timeframe candles, indicators, optional macro/news evidence, provenance, freshness, and fail-closed required-data handling.
- [x] Structured XAUUSD report generation with schema, grounding, temporal, scenario-safety, confidence, and missing-data verification.
- [x] Bounded report repair and verification telemetry.
- [x] Mastra is the sole production chat orchestration path: specialized XAUUSD reports, canonical chat, symbol modes, and durable Full worker jobs no longer fall back to the legacy agent.
- [x] Mastra report metadata and report card in the existing chat UI.
- [x] Mastra-versus-legacy shadow comparison, aggregate persistence, admin dashboard, feedback workflow, regression queue, and governed dataset export.
- [x] Vendor-neutral offline evaluation quality gate.
- [x] Gemini 3.x catalog support and an operator Mastra model pin mechanism.
- [x] AI SDK v5 legacy stream-adapter repair and AI Compare tenant-trigger repairs.
- [x] Release-correctness fixes: `/news` is runtime-rendered and production `AUTH_MODE=legacy` fails closed during build/startup.
- [x] Typed Mastra capability policy for staged expansion, covering validated XAUUSD Single/Auto and rollout-gated generalized Quick/Standard/Full symbol research.
- [x] Separate Mastra conversational Single/Auto runner for ordinary eligible XAUUSD explanations, while deep analysis retains the verified structured-report runner.
- [x] First provider-aware read-only parity adapters for XAUUSD market structure, session levels, and multi-timeframe technical analysis, with scoped evidence envelopes and conversational tool allowlisting.
- [x] Additional XAUUSD conversational adapters for correlation, intermarket context, and ATR-based volatility forecasting, with explicit proxy, partial-data, and degraded-freshness warnings.
- [x] Isolated XAUUSD news and USD economic-calendar adapters with publication/event timestamps, untrusted-content markers, pipeline-pending handling, and abort propagation.
- [x] XAUUSD social-sentiment adapter using the shared service, with available/unavailable semantics, untrusted-content markers, freshness classification, and cancellation propagation.
- [x] Combined XAUUSD fundamental-context capability aggregating macro evidence and social sentiment with complete/partial/degraded quality states and provider-gap aggregation.
- [x] Generalized technical research packet contracts for all 18 canonical gold, forex, and crypto symbols, with canonical-symbol extraction, mixed-symbol rejection, required-data blocking, freshness metadata, and cancellation.
- [x] Mastra Quick and Standard mode runners using one shared packet, bounded specialist calls, deterministic capability policy, budget/persistence integration, and SSE-compatible responses.
- [x] Mastra Full mode is the only durable analysis-job worker implementation, preserving leases, retries, strict specialist-failure semantics, idempotent message persistence, and terminal no-partial-result behavior.
- [x] Evaluation quality gates now reject undersized runs through minimum case and successful-case thresholds, configurable through environment variables.
- [x] Remaining read-only Mastra adapters for seasonality, COT, intermarket resonance, bounded web search, and untrusted knowledge retrieval, with provenance, freshness limitations, abort handling, and content-trust markers.
- [x] Selective Mastra memory/context loading for recent authenticated thread context and user-scoped historical recall, explicitly separated from current market evidence and disabled by default.
- [x] Mastra background text execution owns briefings, weekly reviews, title generation, and bot/Telegram messages; failures use deterministic or explicit error handling rather than the legacy agent.
- [x] Disabled-by-default mutation capability and server-side approval policy covering alerts, journal writes, share links, and operator actions; no mutation tool is exposed by the research workflows.

See the [validation log](AI-AGENT-VALIDATION-LOG.md) for implementation evidence, commands, and deployment notes.

### Not complete

- [ ] A quota-clean Mastra-versus-legacy comparison with enough successful verified cases for a quality decision.
- [ ] Fresh production verification that the deployed Mastra path actually uses `google:gemini-3.6-flash`.
- [ ] Enough human-reviewed comparisons to decide whether Mastra is better than legacy for the supported XAUUSD scope.
- [x] Narrative numeric validation for report prose, with structural timeframe and indicator-period allowances.
- [ ] Expand narrative numeric regression coverage as report vocabulary evolves.
- [ ] Full behavioral parity and quality validation for every symbol, provider, vision case, and optional feature remains pending. Production routing is Mastra-only; live provider and quality validation still gates removing the isolated evaluator copy.
- [ ] Full live validation for the remaining BYOK providers.
- [x] Legacy orchestration was removed from production chat, worker, bot, Telegram, background paths, and the main public package barrel. The old `runChat` implementation remains only as an isolated shadow/evaluation harness until the final comparison archive is retired.
- [ ] Rotation of provider keys exposed during setup.
- [ ] Removal of temporary operator scripts under `packages/ai/scripts/`.

### Deliberately deferred

- [ ] Alerts, schedules, journal writes, share links, and operator mutations in the Mastra path (approval policy exists; execution remains disabled)
- [ ] Trade or portfolio execution mutations from the agent
- [ ] Broad-symbol deep-report routing and production canary expansion
- [ ] Mastra multi-agent committees unless evaluation proves a material benefit
- [ ] Unlimited conversation memory
- [ ] Fine-tuning

## 3. Product contract

Kestrel is a research and planning copilot, not a trade execution bot.

The product must:

- Never place trades.
- Treat XAUUSD as the first and most important market.
- Trigger bounded deep research for “analyse gold” style requests.
- Fail closed when required data is unavailable rather than guess.
- Use fresh tools and evidence for current market facts.
- Treat news, web content, and tool output as data, never as instructions.
- Use scenario language rather than certainty.
- Include triggers, invalidation, and risks for every proposed setup.
- Require explicit confirmation for tools that create or change user data.
- Keep preferences user-scoped and avoid unlimited conversation memory initially.

The validated Mastra report/conversation scope is read-only XAUUSD research. Generalized Quick/Standard/Full mode foundations support the canonical symbol catalog behind rollout flags, but other symbols and modes remain on the legacy path unless the corresponding feature flag and quality gate are explicitly enabled.

## 4. Architecture boundary

The current implementation is documented in [AI-AGENT-ARCHITECTURE.md](AI-AGENT-ARCHITECTURE.md). The intended request lifecycle is:

```text
User message
   |
   +--> Determine intent and research scope
   |
   +--> Apply deterministic route and safety boundary
   |
   +--> Resolve the authenticated user's provider/model
   |
   +--> Collect bounded market evidence in code
   |
   +--> Build a typed evidence packet
   |
   +--> Generate a structured report
   |
   +--> Verify claims, timestamps, levels, and safety rules
   |
   +--> Repair once when allowed or fail closed
   |
   +--> Return the verified report and observability metadata
```

The model should interpret a trusted evidence packet rather than rediscovering the entire market-research process on every request.

Mastra must not bypass Kestrel's:

- Authentication and authorization
- User/tenant scope checks
- Encrypted BYOK storage
- Budget guards
- Provider credential resolution
- Market-data failover
- Business-level audit records
- HTTP and UI boundaries

## 5. Deployment and tenancy decision

The supported public OSS runtime is currently single-user self-hosted:

- Owner-first registration
- Explicit user ownership predicates
- PGlite Simple mode or PostgreSQL Full mode
- BYOK encrypted by the instance
- No supported shared multi-user runtime

The repository contains tenant columns, triggers, RLS migrations, and hosted/future infrastructure. That path is documented separately from the supported OSS guarantee. `MULTI_USER_ENABLED=1`, `KESTREL_ENABLE_RLS=1`, and unsafe open registration must remain rejected until every query, cache, route, worker job, and administrative path establishes tenant context and passes real isolation tests.

This decision prevents the project from claiming multi-user guarantees that the current open-source runtime does not yet provide.

## 6. Phase 0 — Product contract and baseline

### Goal

Define “good” and measure the current legacy system before changing routing or orchestration.

### Work

Maintain a versioned evaluation set covering:

- “Analyse gold” and current-bias questions
- Multi-timeframe, intraday, and swing analysis
- Macro/news questions
- Conflicting timeframes
- Missing and stale data
- Unsupported symbols
- Report follow-ups
- Prompt injection inside external content
- Alert/mutation requests
- Normal conversation that should not trigger deep research

Record for each run:

- Final response and terminal status
- Tool calls and typed results
- Provider and model
- Cost and latency
- Errors and fallback behavior
- Grounding/citation assertions
- Human quality labels where available

Keep live-provider tests separate from fixture-based deterministic tests.

### Exit criteria

- Legacy baseline results are reproducible.
- Failures are classified by layer.
- Mastra and legacy can be compared on the same prompts and evidence conditions.
- Hidden evaluation cases are not used as prompt-training examples.

## 7. Phase 1 — Mastra proof of concept

### Goal

Prove that Mastra can work with Kestrel's most important requirements without sacrificing BYOK or user isolation.

Required capabilities:

1. Resolve the authenticated user.
2. Resolve the user's encrypted BYOK provider key.
3. Resolve a valid model through the existing Kestrel resolver.
4. Call bounded read-only market tools.
5. Handle cancellation and tool timeouts.
6. Record model, provider, cost, and tool calls.
7. Respect user scope.
8. Handle provider errors without leaking secrets.
9. Preserve existing production behavior when the path is disabled.

### Decision gate

Continue expanding Mastra only if provider-agnostic BYOK, cancellation, user scope, telemetry, and failure behavior work without unacceptable custom infrastructure.

If Mastra makes provider-independent model execution unreliable, keep model execution on the existing AI SDK layer and use Mastra only for orchestration that provides measurable value.

## 8. Phase 2 — Tool architecture

Every research tool should have:

- A clear name and concise description
- Strict input and output schemas
- Supported symbols and timeframes
- Read-only or mutating classification
- Freshness expectations
- Provider/source metadata
- Estimated latency and cost
- Abort support
- Typed error results
- A stable evidence envelope

A market-data result should preserve:

```ts
{
  evidenceId: string,
  symbol: string,
  timeframe?: string,
  value: unknown,
  source: string,
  fetchedAt: string,
  dataAsOf: string,
  freshness: "fresh" | "stale" | "unknown",
  quality: "complete" | "partial" | "degraded",
  calculationVersion?: string,
  warnings: string[]
}
```

Use composite tools when they reduce unnecessary model decisions:

- `get_xauusd_research_packet`
- `get_xauusd_multi_timeframe_snapshot`
- `get_xauusd_macro_context`

Keep individual tools available for narrow follow-ups and explicit data gaps. Mutation tools remain outside the initial research workflow.

## 9. Phase 3 — Deep XAUUSD research workflow

### Goal

Make “analyse gold” comprehensive, repeatable, bounded, and auditable.

The default scope should cover:

- Current price, timestamp, session, provider health, and freshness
- Daily, 4-hour, 1-hour, and 15-minute context
- Trend, structure, highs/lows, and volatility
- Moving averages, RSI, MACD, ATR, and volatility bands
- Support/resistance and supported market-structure concepts
- Relevant macro events and gold-related news
- Dollar, yields, inflation expectations, and central-bank context where available
- Intermarket, seasonality, positioning, and sentiment where data quality justifies them
- Meaningful conflicting signals

Stages:

1. Parse the request and horizon.
2. Apply the deterministic scope and route boundary.
3. Fetch required data in parallel.
4. Mark missing/stale/degraded data.
5. Calculate objective indicators and structure in code.
6. Assemble the evidence packet.
7. Generate a structured report.
8. Verify the report.
9. Repair once where permitted or fail closed.
10. Return the verified result and trace metadata.

## 10. Phase 4 — Structured market report

The report should contain:

- Symbol and analysis timestamp
- Bottom line
- Data quality
- Higher-timeframe trend
- Shorter-timeframe structure
- Indicator and volatility summary
- Fundamental/macro context
- Important levels
- Bullish and bearish scenarios
- Trigger and invalidation conditions
- Risks
- Contradictions
- Missing data
- Sources and timestamps
- Numeric claims bound to evidence IDs

The UI should render the schema consistently. The report should not be considered complete until verification passes.

## 11. Phase 5 — Verification and safety gate

Verification must check:

### Grounding

- Numeric values exist in cited evidence.
- Levels and indicator values match deterministic calculations.
- Evidence IDs exist and belong to the correct symbol/timeframe.
- Unsupported claims are blocked or revised.
- Numeric values embedded in prose are either bound to structured claims or rejected.

### Time

- Current claims use fresh evidence.
- News has publication time.
- Historical data is labelled historical.
- Mixed timeframes are clearly separated.

### Scenarios

- Every setup has a trigger.
- Every setup has invalidation.
- Every setup has risks.
- Entry levels and targets are supported.
- Guaranteed language is rejected.
- Confidence is appropriate for data quality.

### Missing data

When required evidence is unavailable, the system must state:

- What failed
- Why it matters
- Whether a narrower analysis remains possible
- When the user can retry

It must not fill the gap from model memory.

## 12. Phase 6 — Chat integration

Routing remains separate:

- Normal question → legacy conversational agent
- Eligible XAUUSD deep research → Mastra path when enabled
- Unsupported or mutating request → legacy path or explicit confirmation workflow
- Report follow-up → narrowly scoped report-aware path
- Preference operation → user-scoped preference service
- Alert request → future approval workflow

The UI should support:

- Progress stages
- Cancellation
- Current stage
- Data warnings
- Sources and timestamps
- Follow-up questions about the same report
- Retry after failed research

A failed Mastra run must not appear as a successful verified report.

## 13. Phase 7 — Preference memory

Initial memory is limited to user preferences:

- Default symbol
- Language
- Timezone
- Report style
- Preferred timeframes
- Optional report sections

Do not provide unlimited prior conversation history to the agent. Later retrieval of previous reports, journal context, or corrections requires explicit relevance and freshness rules. Previous reports must never be treated as current market evidence.

## 14. Phase 8 — Multi-agent analysis only if justified

Do not begin with multiple agents independently fetching the same data. If evaluation justifies it, use one shared packet:

```text
One evidence packet
        |
        +--> Technical reviewer
        +--> Risk reviewer
        +--> Fundamental reviewer, if justified
        +--> Sentiment reviewer, if justified
                    |
              Structured adjudicator
                    |
              Verification gate
```

Specialists must refer to shared evidence IDs and must not create new market facts.

Exit criteria:

- Multi-agent mode beats single-agent mode on hidden evaluation cases.
- Additional cost and latency are justified.
- Partial specialist failure is visible.
- The adjudicator cannot silently approve unsupported claims.

## 15. Phase 9 — Alerts and schedules

Alerts and schedules remain postponed until research quality is reliable.

Future flow:

```text
User requests an alert
        |
        v
Agent drafts validated parameters
        |
        v
User explicitly confirms
        |
        v
System validates, audits, and creates it
```

No alert may be created from external content, unsupported inference, or an unconfirmed model suggestion.

## 16. Improvement and training policy

“Training” initially means an improvement loop, not fine-tuning:

```text
Interaction
    → trace and feedback
    → failure classification
    → prompt/tool/workflow change
    → regression test
    → evaluated release
```

Classify failures before changing prompts:

- Instructions
- Tool description
- Missing tool
- Incorrect tool output
- Workflow weakness
- Context overload
- Model limitation
- Verification failure
- Provider-specific behavior

Curated datasets must separate development, improvement, and hidden evaluation cases. Shared datasets must be redacted, user-scoped, reviewer-governed, and provenance-aware.

Fine-tuning is deferred until the report format is stable, a large high-quality dataset exists, repeated errors are clearly model-behavior errors, and workflow/verification changes have already been exhausted.

Every agent change requires:

- Version identifier
- Prompt/workflow/tool change record
- Evaluation comparison with the previous version
- Cost and latency comparison
- Known limitations
- Rollback path

## 17. Evaluation plan

### Unit tests

Cover:

- Tool schemas and evidence envelopes
- Freshness and provenance
- Indicator and structure calculations
- Report schema
- Numeric and timestamp verification
- Scenario safety
- User scope
- Mutation approval
- Repair behavior

### Integration tests

Cover:

- Mastra agent and Kestrel tools
- BYOK model resolution
- Provider fallback
- Database access boundaries
- Abort and timeout behavior
- Stream completion
- Failed and partial research
- Evidence persistence
- Shadow comparison isolation

### End-to-end tests

Cover:

- Deep XAUUSD request
- Visible progress
- Verified report card
- Cancellation
- Follow-up against a prior report
- Required data failure
- Mutation request without confirmation
- Legacy fallback after Mastra failure

### Release gates

Block releases with meaningful regressions in:

- Grounding
- Missing-data handling
- User isolation
- Safety
- Report completeness
- Provider compatibility
- Cost
- Latency
- Transport reliability

Transport success alone is not a quality verdict. Token overlap is diagnostic only, not semantic evaluation.

## 18. Observability contract

Every AI run should expose one canonical run ID containing:

- User and thread scope
- Agent/workflow version
- Prompt version where applicable
- Model and provider
- Tool calls and evidence IDs
- Data freshness and quality
- Token usage and cost
- Stage-level latency
- Verification result
- Final status
- Later feedback and reviewer labels

The system should answer:

- Which stage failed?
- Which provider or tool failed?
- Was the answer grounded?
- What did it cost and how long did it take?
- Did users find it useful?
- Did the new version improve quality?

Extend existing shared logging, diagnostics, metrics, comparison, and evaluation systems rather than creating disconnected tracing formats.

## 19. Rollout and rollback

### Rollout

1. Maintain the legacy baseline.
2. Run Mastra offline against fixtures.
3. Run Mastra in shadow mode.
4. Review quality, cost, latency, and failure metrics.
5. Enable for internal/admin users.
6. Enable behind a feature flag.
7. Increase traffic gradually.
8. Keep legacy fallback.
9. Remove legacy orchestration only after stable evidence.

### Roll back Mastra for

- BYOK failures
- Cross-user data risk
- Grounding regression
- Increased unsupported numeric claims
- Unacceptable cost or latency
- Lost/duplicated messages
- Provider fallback failure
- Verification bypass

## 20. Migration inventory and replacement boundary

The complete legacy-to-Mastra parity inventory is maintained in [AI-AGENT-MASTRA-MIGRATION-INVENTORY.md](AI-AGENT-MASTRA-MIGRATION-INVENTORY.md). It covers all 33 registered tools, legacy routing and mode behavior, non-tool SDK call sites, worker/background execution, approval workflows, and the release gate for removing legacy orchestration.

The typed capability policy in `packages/ai/src/mastra/capabilities.ts` establishes the server-side contract for validated XAUUSD report/conversation paths and rollout-gated generalized Quick, Standard, and Full capabilities.

The inventory makes an important distinction: replacing the legacy **orchestration** does not require removing AI SDK-compatible provider/model adapters. The dependency should remain below Mastra wherever it is still the stable BYOK/provider or UI transport compatibility layer.

## 21. Immediate implementation sequence

The code cutover is complete. The remaining work is verification and cleanup:

1. Run the full AI/web/worker/database regression suites and production builds.
2. Run a quota-clean live provider evaluation and verify the deployed Mastra model selection.
3. Review grounding, missing-data honesty, scenario usefulness, latency, cost, and feedback.
4. Validate remaining BYOK providers, vision inputs, bot/Telegram behavior, and worker retries.
5. Rotate any provider credentials exposed during setup.
6. Retire the isolated legacy shadow/evaluation harness only after its final comparison archive is preserved.
7. Expand mutation workflows only through explicit approval-state design; research agents remain read-only.

## 22. Deferred scope

The following remain intentionally outside the current Mastra migration:

- Alerts and schedules (approval policy exists; Mastra execution remains disabled)
- Trade execution or portfolio mutations
- Broad-symbol deep-report routing and production canary expansion
- Unbounded memory
- Fine-tuning
- Mastra committees without measured benefit
- Unsupported shared multi-user OSS deployment

## 23. Documentation and status policy

This file contains current decisions, active phases, gates, and pending work.

Dated test results, deployment observations, milestone details, and historical discoveries belong in the [validation log](AI-AGENT-VALIDATION-LOG.md). Current implementation boundaries belong in [AI-AGENT-ARCHITECTURE.md](AI-AGENT-ARCHITECTURE.md).

When updating this roadmap:

- Update `Last updated`.
- Mark a gate complete only with reproducible evidence.
- Distinguish code existence from production validation.
- Do not record credentials or raw user/model content.
- Keep the legacy fallback status explicit.
- Keep the supported OSS tenancy boundary explicit.
