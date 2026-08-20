# Kestrel AI and Mastra Migration Inventory

**Status:** Mastra production orchestration cutover complete — isolated evaluator retirement pending
**Last reviewed:** 2026-08-20
**Scope:** Legacy Vercel AI SDK orchestration surface and the Mastra parity work required before cutover

> This document records the completed production cutover and the remaining validation needed before the isolated legacy evaluator can be deleted. AI SDK-compatible provider/model transport remains intentionally below Mastra.
>
> For the current runtime, see [AI Agent Architecture](AI-AGENT-ARCHITECTURE.md). For sequencing and decisions, see the [AI and Mastra Roadmap](AI-AGENT-MASTRA-ROADMAP.md). For dated evidence, see the [Validation Log](AI-AGENT-VALIDATION-LOG.md).

## 1. Executive conclusion

Kestrel does not need to replace the Vercel AI SDK as a provider compatibility layer. Mastra can become the canonical **agent/orchestration layer** while Kestrel continues to use AI SDK-compatible `LanguageModel` objects, provider adapters, and the existing UI-message transport where that remains useful.

The replacement target is therefore:

```text
Replace:
  legacy runChat(), planner, tool loop, multi-agent orchestrator,
  legacy mode routing, and legacy agent-specific background flows

Keep:
  Next.js, Auth.js, Drizzle/Postgres/PGlite, market-data adapters,
  BYOK encryption/resolution, budget enforcement, worker infrastructure,
  UI components, and AI SDK provider/model compatibility
```

The current Mastra implementation has a validated bounded read-only XAUUSD path plus a rollout-gated generalized mode foundation:

- Nineteen Mastra read-only tool definitions exist: research packet, price, candles, indicators, market structure, session levels, multi-timeframe technical analysis, correlation, intermarket context, volatility forecasting, news, economic calendar, social sentiment, combined fundamental context, seasonality, COT, intermarket resonance, bounded web search, and untrusted knowledge retrieval.
- Deep analysis uses `Agent.generate()` with structured report output and deterministic verification.
- Ordinary eligible Single/Auto explanations use a separate plain-text conversational runner over the trusted packet.
- `collectSymbolResearchPacket` supports all 18 canonical symbols with strict symbol extraction, required-data blocking, freshness/provenance, and cancellation.
- Quick and Standard use `runMastraMode` over one shared packet and persist through the existing budget/message boundary; Full runs in the durable worker through the same Mastra mode runner.
- Production chat routing is Mastra-only: specialized XAUUSD, canonical symbol-free chat, symbol-scoped modes, and durable Full jobs have no legacy fallback.
- Legacy orchestration remains only in the isolated shadow/evaluation harness, not in user-facing production routing.
- Memory/context, worker text generation, and bot/Telegram paths reuse Mastra while Kestrel retains persistence, budgets, and idempotency.
- Mutation workflows have a typed capability and server-side approval policy but remain disabled and are not exposed by research agents.

The production orchestration cutover is complete across the supported read-only chat, mode, worker, bot, Telegram, briefing, title, routing, memory-context, persistence, budget, transport, and telemetry paths. Remaining work is release validation and deliberate expansion of deferred mutation/committee/RAG parity, not restoring the old production agent.

## 2. Source-of-truth inventory

| Surface                | Current source                                                       | Current role                                           | Mastra replacement status                                                                                              |
| ---------------------- | -------------------------------------------------------------------- | ------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------- |
| Broad chat entrypoint  | `packages/ai/src/agent.ts`                                           | Historical `runChat()` request lifecycle               | Removed from production; retained only by isolated shadow/evaluation harness                                           |
| Model/domain routing   | `packages/ai/src/routing.ts`, `chat/resolve-model.ts`                | Domain classification, model tier, overrides, fallback | Partially reused by Mastra; not replaced                                                                               |
| Legacy tool registry   | `packages/ai/src/tools/index.ts`, `registry.ts`                      | Registers 33 AI SDK tools                              | Legacy-only                                                                                                            |
| Domain tool policy     | `packages/ai/src/tools/by-domain.ts`                                 | Filters tools by routing domain and plan               | Must become an explicit Mastra capability policy                                                                       |
| Planner                | `packages/ai/src/planner.ts`                                         | Plan-then-act for selected domains                     | Mastra structured execution by default; deterministic fallback and provider transport compatibility retained           |
| Single-agent tool loop | `packages/ai/src/chat/attempt.ts`                                    | Historical AI SDK `streamText()` execution             | Removed from production; retained only through the isolated shadow comparator                                          |
| Retry/fallback         | `packages/ai/src/chat-retry-loop.ts`                                 | Historical provider retry/fallback chain               | Durable Kestrel job retries and Mastra/provider errors are handled by current boundaries; old chat loop is shadow-only |
| Multi-agent modes      | `packages/ai/src/mastra/mode-runner.ts`                              | Quick, Standard, Full specialists and fusion           | Mastra canonical; legacy specialist/orchestrator implementation removed                                                |
| Durable Full jobs      | `packages/ai/src/analysis-jobs/`, web route, worker jobs             | Queue, leases, retries, polling                        | Mastra-only worker execution inside the existing durable boundary                                                      |
| Thread compaction      | `packages/ai/src/memory/thread-summary.ts`                           | Rolling summary                                        | Kestrel-owned; Mastra receives optional bounded context                                                                |
| Mastra memory context  | `packages/ai/src/mastra/memory-context.ts`, `packages/ai/src/rag.ts` | Selective recent/history recall                        | Implemented opt-in; full compaction/RAG parity pending                                                                 |
| RAG and memory         | `packages/ai/src/rag/`, `memory/`, `embeddings.ts`                   | News, journal, briefings, thread recall                | Not migrated                                                                                                           |
| Briefings              | `packages/ai/src/briefings/`, `apps/worker/src/jobs/briefings.ts`    | Scheduled LLM summaries                                | Mastra background runner with central budget admission; deterministic fallback only                                    |
| Title generation       | `packages/ai/src/title.ts`, `packages/ai/src/chat/auto-title.ts`     | Background/secondary generation                        | Mastra text/background runner with budget boundary; deterministic fallback only                                        |
| Semantic routing       | `packages/ai/src/semantic-routing.ts`                                | Optional classification model                          | Mastra structured execution; keyword routing remains the deterministic failure path                                    |
| Vision path            | `packages/ai/src/tools/analyze-chart-image.ts`                       | Image analysis                                         | Mastra text runner with the existing resolved vision model and typed fallback shape                                    |
| Report verification    | `packages/ai/src/mastra/report-*`                                    | Mastra structured report gate                          | Exists for XAUUSD only                                                                                                 |
| Mastra runtime         | `packages/ai/src/mastra/`                                            | Bounded XAUUSD agent and packet                        | Partial replacement                                                                                                    |
| Chat adapter           | `apps/web/src/lib/services/mastra-chat*.ts`                          | Canonical Mastra routing and response adaptation       | Production Mastra path for verified research, canonical chat, and supported symbol modes                               |
| UI transport           | `apps/web/src/lib/chat-transport.ts`, chat components                | SSE/UI message rendering and job polling               | Must remain compatible or be canonically replaced                                                                      |

## 3. Legacy tool matrix

All names below are the canonical identifiers from `packages/shared/src/ai/tool-names.ts` and the registration categories under `packages/ai/src/tools/`.

### Status key

- **M0 — Inventory:** contract and dependency mapping only.
- **M1 — Adapter:** Mastra schema/execute wrapper with scope, abort, telemetry, and typed errors.
- **M2 — Workflow:** included in a bounded Mastra workflow or capability policy.
- **M3 — Parity:** behavior, persistence, UI parts, failure handling, and evaluation match legacy.
- **M4 — Cutover:** enabled as the canonical path with legacy fallback only during canary.
- **Deferred:** intentionally excluded until a later product decision.

### 3.1 Market and research tools

| Tool                        | Safety                            | Dependencies                                  | Current legacy use                | Mastra phase                       | Cutover requirement                                                                                                                                                                   |
| --------------------------- | --------------------------------- | --------------------------------------------- | --------------------------------- | ---------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `get_price`                 | Read-only market data             | `@kestrel/data`, provider failover, freshness | Price checks and research         | **M1; generalized packet uses it** | Complete direct conversational adapter parity for every catalog symbol                                                                                                                |
| `get_candles`               | Read-only market data             | `@kestrel/data`, timeframe/symbol validation  | Candle lookup and analysis inputs | **M1; generalized packet uses it** | Complete direct conversational adapter parity for every catalog symbol/timeframe                                                                                                      |
| `get_indicators`            | Deterministic read-only analysis  | candles, `@kestrel/indicators`                | EMA/RSI/MACD/ATR/Bollinger reads  | **M1; generalized packet uses it** | Version calculations, validate output, cover all legacy indicator options                                                                                                             |
| `get_market_structure`      | Deterministic read-only analysis  | candles, structure calculations               | Trend/structure/levels            | **M1 adapter; XAUUSD scoped**      | Generalize symbols and bind every level to evidence IDs                                                                                                                               |
| `get_session_levels`        | Read-only derived data            | candles/session/timezone rules                | Session highs/lows and levels     | **M1 adapter; XAUUSD scoped**      | Preserve timezone/session semantics and add broader provider failure tests                                                                                                            |
| `get_correlation`           | Read-only derived data            | multi-symbol prices/candles                   | Cross-asset correlation           | **M1 adapter; XAUUSD scoped**      | Normalize multi-symbol provenance, preserve explicit two-leg DXY-proxy labeling, and remove degraded/unknown freshness only after source metadata is available                        |
| `get_intermarket`           | Read-only external/derived data   | market providers, symbol mapping              | Dollar/yield/intermarket context  | **M1 adapter; XAUUSD scoped**      | Normalize per-symbol provenance, preserve partial-result behavior and proxy warnings, and avoid claiming freshness not exposed by the composite legacy tool                           |
| `get_intermarket_resonance` | Read-only derived data            | resonance table, DB, macro inputs             | Gold/macro divergence reads       | **M1**                             | Enforce user/tenant read scope and historical freshness semantics                                                                                                                     |
| `get_seasonality`           | Read-only historical analysis     | historical candles/database                   | Seasonal context                  | **M1**                             | Define minimum sample size, historical labels, and confidence limits                                                                                                                  |
| `get_cot`                   | Read-only external data           | CFTC/provider data and cache                  | Positioning context               | **M1**                             | Preserve release dates, source, missing-week behavior, and symbol mapping                                                                                                             |
| `get_news`                  | Read-only untrusted external data | news providers, RAG/cache                     | Headlines and article context     | **M1 adapter; XAUUSD scoped**      | Mark titles/summaries as untrusted, preserve publication timestamps, disclose pipeline-pending state, and add ingestion freshness metadata before parity                              |
| `get_calendar`              | Read-only untrusted external data | economic calendar provider/database           | Upcoming and historical events    | **M1 adapter; XAUUSD/USD scoped**  | Mark titles/source labels as untrusted, preserve event times and actual/forecast/previous fields, disclose pipeline-pending state, and add ingestion freshness metadata before parity |
| `get_social_sentiment`      | Read-only untrusted external data | sentiment provider/cache                      | Retail/social positioning         | **M1 adapter; XAUUSD scoped**      | Preserve `available/degraded` semantics, fetch timestamps, cancellation, and never treat posts or positioning data as instructions                                                    |
| `web_search`                | Read-only untrusted external data | Exa/Tavily/Brave adapters, cache              | Fundamental web research          | **M1**                             | Add strict domain/query/time limits, provenance, content isolation, and SSRF/security tests                                                                                           |

**Composite research decision:** The existing `get-xauusd-research-packet` should remain the default bounded path for broad XAUUSD research. The individual equivalents above are for narrow follow-ups and explicitly requested data gaps; they should not reintroduce unconstrained tool discovery.

### 3.2 Deterministic analysis and user-context tools

| Tool                      | Safety                             | Dependencies                              | Current legacy use                            | Mastra phase                              | Cutover requirement                                                                                                                                                                           |
| ------------------------- | ---------------------------------- | ----------------------------------------- | --------------------------------------------- | ----------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `analyze_technical`       | Read-only deterministic projection | candles, indicators, structure            | Multi-timeframe technical summary             | **M1 adapter; XAUUSD scoped**             | Build on shared evidence packet, generalize symbols, and complete schema/evidence parity                                                                                                      |
| `analyze_fundamental`     | Read-only synthesis input          | calendar/news/macro providers             | Fundamental event/news summary                | **M2 workflow; XAUUSD equivalent exists** | Keep collection separate from interpretation, aggregate provider gaps, preserve untrusted-content boundaries, and generalize symbols before parity                                            |
| `forecast_volatility`     | Read-only derived analysis         | candles/ATR/volatility model              | Volatility forecast                           | **M1 adapter; XAUUSD scoped**             | Version the model, preserve the missing-live-price behavior, expose event/candle/provider provenance, and remove degraded/unknown freshness only after its multi-source metadata is available |
| `compute_risk`            | Read-only calculation              | symbol pip size, user inputs              | Position sizing and R calculation             | **M1**                                    | Validate units and bounds; no trade execution; evidence-free calculations clearly labelled                                                                                                    |
| `compute_position_health` | User-scoped read                   | journal entries, live prices              | Open-position P/L and stop/target distance    | **M1**                                    | Enforce user scope, partial price failures, and no cross-user rows                                                                                                                            |
| `replay_setup`            | Read-only historical simulation    | candles, indicators, replay rules         | Backtest/replay setup behavior                | **M1/M2**                                 | Label historical results, prevent look-ahead, define thin-sample behavior, evaluate claims                                                                                                    |
| `verify_call`             | Read-only safety/grounding check   | live price/data provider                  | Verifies a proposed call against current data | **M1/M2**                                 | Make verification a mandatory workflow gate, not merely an optional model tool                                                                                                                |
| `get_journal_stats`       | User-scoped read                   | journal persistence and aggregate queries | Win rate, R, trade history stats              | **M1**                                    | Enforce authenticated scope and date/symbol filters                                                                                                                                           |
| `get_portfolio_snapshot`  | User-scoped read                   | portfolio/risk persistence                | Portfolio exposure and risk view              | **M1**                                    | Audit all account/user fields, define sensitive output policy                                                                                                                                 |
| `search_knowledge`        | User-scoped + untrusted data       | RAG, memory index, embeddings, news       | News/journal/briefing/thread recall           | **M1/M2**                                 | Separate current evidence from memory, scope every query, isolate external text                                                                                                               |
| `summarize_thread`        | User-scoped write/side effect      | thread history, model, persistence        | Explicit thread summarization                 | **M1/M2**                                 | Replace with governed memory operation; preserve idempotency and budget behavior                                                                                                              |

### 3.3 Visual and chart tools

| Tool                  | Safety                          | Dependencies                           | Current legacy use                      | Mastra phase | Cutover requirement                                                                                                      |
| --------------------- | ------------------------------- | -------------------------------------- | --------------------------------------- | ------------ | ------------------------------------------------------------------------------------------------------------------------ |
| `analyze_chart_image` | Read-only vision analysis       | chat image parts, DB, vision model     | User-attached screenshot interpretation | **M1/M2**    | Private image handling, signed/short-lived access, model capability routing, structured levels with evidence limitations |
| `annotate_chart`      | Read-only/rendering side effect | chart overlay schema, UI part renderer | Produces chart annotations/overlays     | **M1/M2**    | Define whether persistence is allowed, scope overlay data, parity-test UI rendering                                      |

### 3.4 Mutating and operator tools

| Tool                | Safety                          | Dependencies                                          | Current legacy use          | Mastra phase                   | Cutover requirement                                                                                                     |
| ------------------- | ------------------------------- | ----------------------------------------------------- | --------------------------- | ------------------------------ | ----------------------------------------------------------------------------------------------------------------------- |
| `set_alert`         | User mutation                   | alert schema, persistence, scheduler, explicit intent | Creates one-shot alert      | **M1 after approval workflow** | Draft → explicit user confirmation → server validation → audited write; never initial research capability               |
| `log_journal`       | User mutation                   | journal persistence, user scope, explicit intent      | Creates trade journal entry | **M1 after approval workflow** | Confirmation and idempotent write; validate all numeric fields and ownership                                            |
| `share_snapshot`    | User mutation/public disclosure | snapshot persistence, HMAC signing, public route      | Creates signed share link   | **M1 after privacy review**    | Explicit confirmation, expiry, redaction, private source policy, audit trail                                            |
| `run_system_action` | Admin/operator mutation         | admin role, FRED, DB writes, abort                    | Resonance historical sync   | **M1 after operator workflow** | Admin authorization, explicit intent, dry run, audit, idempotency, isolated capability not exposed to ordinary research |

The existing `assertMutationIntent()` checks are useful defense in depth but are not a complete approval workflow. Mastra must not call these tools merely because an external article, news result, calendar event, memory result, or model-generated scenario suggests doing so.

### 3.5 System and nested orchestration tools

| Tool                     | Safety                       | Dependencies                                                               | Current legacy use                                    | Mastra phase                                                                                                                                | Cutover requirement                                                                                                         |
| ------------------------ | ---------------------------- | -------------------------------------------------------------------------- | ----------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------- |
| `get_system_diagnostics` | Sensitive read/admin-aware   | DB table counts, spend, worker state                                       | Operational status in chat                            | **M1 after capability policy**                                                                                                              | Redact sensitive details, restrict by role/feature, test no tenant leakage                                                  |
| `convene_committee`      | Nested multi-agent execution | AI SDK `generateText`, specialist tools, Vertex search, budgets, telemetry | In-tool Economist/Technician/Risk/Moderator committee | No-tool personas use Mastra text; Google-grounded persona remains on the tool-capable AI SDK fallback; shared-packet redesign still pending | Replace nested SDK calls with one shared Mastra packet and explicit specialists; prove quality/cost benefit before enabling |

## 4. Chat mode and orchestration parity

### 4.1 Mode mapping

| Current mode | Current implementation                                            | Behavior that must be preserved                                                   | Mastra replacement                                                                                                      |
| ------------ | ----------------------------------------------------------------- | --------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------- |
| `single`     | `runChat()` → `streamText()` with domain-filtered tools           | Normal conversation, tool loop, streaming, retry/fallback, persistence, telemetry | Mastra conversational agent with explicit capability policy and compatible UI stream                                    |
| `quick`      | `runMultiAgentChat()` → technical specialist                      | Technical-only specialist behavior, budget reservation, progress, persistence     | **Implemented foundation:** Mastra bounded technical workflow over a shared generalized packet; gated by `mastra_modes` |
| `standard`   | Technical + Fundamental specialists + fusion                      | Partial specialist behavior, fusion, progress, cost attribution                   | **Implemented foundation:** Mastra shared-packet reviewers + fusion; gated by `mastra_modes`                            |
| `full`       | Four specialists + Decision agent; durable job path in web/worker | Strict failure semantics, leases, retries, polling, no partial final answer       | **Implemented foundation:** Mastra runner inside the Kestrel durable worker boundary; gated by `ENABLE_MASTRA_FULL`     |
| `auto`       | `autoDetectMode()` then single/multi path                         | Deterministic mode selection and safe defaults                                    | Keep deterministic classification outside the model; route into Mastra capabilities                                     |

Mastra should not inherit the legacy behavior where every mode can access a broad implicit tool menu. Capability selection must be explicit, typed, and auditable per route and mode.

### 4.2 Legacy orchestration dependencies to replace or wrap

1. **Request setup:** authenticated user, owned thread, user settings, display name, persisted history.
2. **Context:** live snapshot, rolling compaction, custom instructions, report context, prior messages.
3. **Routing:** keyword/semantic domain, model tier, explicit override policy, supported-symbol checks.
4. **Budget:** atomic reservation, monthly/provider threshold checks, reconciliation, release on every failure path.
5. **Planning:** optional plan-then-act step and visible plan event.
6. **Tool policy:** domain filtering, plan tier gating, mutation capability isolation.
7. **Execution:** tool loop, max steps, timeout, abort, retries, provider fallback.
8. **Persistence:** user message, assistant message, tool telemetry, opinions, analysis jobs, idempotency.
9. **Verification:** citations, numeric claims, safety, report completion state.
10. **Transport:** progress events, UI message stream, errors, cancellation, full-mode polling.
11. **Observability:** diagnostic trace, cost, model/provider, stages, tool calls, final status.

A Mastra agent that only generates better prose does not satisfy this parity list.

## 5. Non-tool AI paths and retained transport boundaries

Replacing the 33 tools does not replace these independent SDK calls:

| Path                   | Current source                                         | Why it matters                                               | Current Mastra/SDK boundary                                                                            |
| ---------------------- | ------------------------------------------------------ | ------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------ |
| Planner                | `packages/ai/src/planner.ts`                           | Visible plans and plan persistence are part of chat behavior | Mastra structured branch behind `ENABLE_MASTRA_TEXT`; AI SDK fallback retained                         |
| Semantic routing       | `packages/ai/src/semantic-routing.ts`                  | Optional model-based intent classification                   | Mastra structured branch behind `ENABLE_MASTRA_TEXT`; AI SDK fallback retained                         |
| Thread compaction      | `packages/ai/src/memory/thread-summary.ts`             | Long-thread cost and context behavior                        | Mastra text branch behind `ENABLE_MASTRA_TEXT`; Kestrel owns persistence and deterministic fallback    |
| Title generation       | `packages/ai/src/title.ts`                             | Post-turn UX and background model usage                      | Mastra text/background branch with budget boundary; AI SDK fallback retained                           |
| Briefings              | `packages/ai/src/briefings/generate.ts`                | Scheduled pre/post-event and weekly summaries                | Mastra background runner with central budget admission; AI SDK fallback retained                       |
| Chart image analysis   | `packages/ai/src/tools/analyze-chart-image.ts`         | Vision model and image data handling                         | Mastra text runner supports resolved vision models; AI SDK fallback retained                           |
| Nested committee calls | `packages/ai/src/tools/convene-committee.ts`           | Four-plus model calls hidden inside one tool                 | No-tool personas use Mastra text; Google-grounded persona stays on the tool-capable AI SDK path        |
| Specialist agents      | `packages/ai/src/multi-agent/agents/`                  | Quick/Standard/Full analysis behavior                        | Mastra text branch adapts selected read-only tools into genuine Mastra tools; AI SDK fallback retained |
| Decision fusion        | `packages/ai/src/multi-agent/agents/decision-agent.ts` | Streaming adjudication and strict Full behavior              | Mastra bounded text branch for fusion; AI SDK streaming fallback retained                              |
| Provider tester        | `packages/ai/src/provider-tester.ts`                   | Settings/provider validation experience                      | Mastra text branch behind `ENABLE_MASTRA_TEXT`; AI SDK fallback retained                               |
| Journal review         | `packages/ai/src/journal/review.ts`                    | AI-assisted user journal review                              | Mastra text branch behind `ENABLE_MASTRA_TEXT`; AI SDK fallback retained                               |
| Bot/Telegram commands  | `packages/ai/src/bot/`, `telegram/webhook.ts`          | Non-browser entrypoints calling `runChat()`                  | Mastra background branch behind `ENABLE_MASTRA_BOT_AI`; legacy fallback retained                       |

Each path is now either Mastra-backed orchestration or an explicitly retained Kestrel-owned transport/provider utility. The remaining direct SDK calls were audited and are not unreviewed production orchestration bypasses.

## 6. Background and durable execution parity

The worker currently owns live data plus scheduled jobs. Mastra should not replace the worker's market-data responsibilities. The migration must define the boundary for AI-bearing jobs:

### Keep as Kestrel worker jobs

- SignalR/Binance consumers
- Tick buffering and candle aggregation
- Database writes for market snapshots
- Cron locking, scheduling, health checks, and tenant partitioning
- Deterministic retention and persistence maintenance

### Migrate or wrap with Mastra

- Multi-agent analysis jobs
- Pre/post-event briefings
- Weekly journal reviews
- Any future approval workflow requiring pause/resume
- AI dataset/evaluation jobs only where Mastra tracing adds measurable value

For every AI job, preserve:

- Durable job ID and idempotency key
- Lease/claim semantics
- Retry count and terminal failure state
- Abort/timeout behavior
- User/tenant scope
- Budget reservation and reconciliation
- Progress events or pollable status
- Final report/message persistence
- Re-run safety

A Mastra workflow may run inside the existing worker/job boundary. Moving code into Mastra does not remove the need for durable ownership and retry controls.

## 7. Required Mastra capability contract

Before broad routing, define one typed capability descriptor for each Mastra agent/workflow:

```ts
type AgentCapability = {
  id: string;
  version: string;
  allowedSymbols: readonly string[];
  allowedModes: readonly string[];
  readOnly: boolean;
  tools: readonly string[];
  requiresConfirmation: boolean;
  supportsStreaming: boolean;
  supportsAbort: boolean;
  maxSteps: number;
  maxDurationMs: number;
  evidencePolicy: 'required' | 'optional' | 'none';
};
```

The route boundary should validate the capability before model execution. The model must not be trusted to decide its own symbol, mutation, tenant, budget, or approval permissions.

Every migrated tool should expose an equivalent contract:

- Input schema
- Output schema
- Symbol/timeframe limits
- Source/provenance
- Freshness and quality
- Abort signal
- Typed error code
- Scope requirement (`none`, `user`, `tenant`, `admin`)
- Mutation/confirmation policy
- Telemetry metadata

## 8. Migration phases and exit gates

### Phase A — Contract freeze and adapters

- [ ] Freeze the 33-name registry and output contracts.
- [ ] Add a machine-readable inventory test ensuring every legacy name has a migration record.
- [ ] Define Mastra tool IDs and legacy-to-Mastra mapping.
- [ ] Define common evidence, error, scope, abort, and telemetry envelopes.
- [ ] Decide which AI SDK usage remains intentionally below Mastra.

**Exit gate:** all legacy capabilities are classified; no unknown SDK call or tool is outside the inventory.

### Phase B — Read-only market parity

- [ ] Migrate market-data tools in groups: price/candles/indicators, structure/session, macro/news, intermarket/positioning, sentiment/seasonality.
- [ ] Preserve provider failover and source freshness.
- [ ] Add fixture-based parity tests against the same inputs.
- [ ] Make shared evidence packets the default for broad research.

**Exit gate:** all read-only market requests have a Mastra path with matching typed outputs, scope, failure, and freshness behavior.

### Phase C — Conversational parity

- [ ] Replace `runChat()` for eligible read-only requests.
- [ ] Migrate deterministic routing and capability filtering.
- [ ] Migrate planner/visible progress where product behavior requires it.
- [ ] Preserve model override, BYOK, budget, retry, fallback, and cancellation behavior.
- [ ] Preserve UI-message stream compatibility or ship an equivalent transport adapter.

**Exit gate:** Single and Auto read-only chat journeys pass hidden regression and E2E suites with no meaningful transport, safety, grounding, cost, or latency regression.

### Phase D — Context, memory, and vision

- [ ] Migrate thread compaction with user scope and deterministic fallback.
- [x] Add opt-in preference/thread/report-aware memory context with user-scoped historical recall and current-vs-historical evidence separation.
- [x] Add typed Mastra adapters for news/knowledge retrieval with external-content isolation; full RAG parity and ingestion metadata remain pending.
- [ ] Migrate chart-image analysis and chart annotation rendering.

**Exit gate:** memory cannot leak users, previous reports cannot masquerade as current data, and image flows use private/signed access with equivalent UX.

### Phase E — Multi-agent and durable workflows

- [x] Implement Quick and Standard Mastra workflows around one shared generalized packet, with route flags, budgets, cancellation, persistence, and SSE-compatible responses.
- [x] Implement the Full-mode foundation inside the existing durable worker boundary, preserving strict specialist-failure semantics, leases, retries, and idempotent writes.
- [ ] Prove specialist value through quota-clean and hidden evaluation before enabling broad production traffic.
- [ ] Replace nested `convene_committee` SDK calls or explicitly retire the tool.

**Exit gate:** hidden evaluations show quality improvement or parity that justifies added calls, latency, and complexity; durable retries do not duplicate messages or spend.

### Phase F — Mutations and approvals

- [x] Implement the disabled-by-default Mastra mutation capability and server-side approval policy.
- [ ] Implement suspend/resume or Kestrel-owned confirmation state.
- [ ] Migrate alerts, journal writes, share links, and admin actions one at a time.
- [ ] Add explicit confirmation, validation, audit, idempotency, and rollback/expiry where applicable.

**Exit gate:** no mutation can execute from untrusted content or an unconfirmed model suggestion; authorization and audit tests pass.

### Phase G — Non-chat and operations

- [x] Make Mastra-backed text runners canonical for briefings, weekly review, title generation, and bot/Telegram entrypoints; retain deterministic fail-closed behavior and the isolated shadow comparator only.
- [ ] Migrate journal review and remaining AI-bearing entrypoints fully.
- [x] Preserve provider tests, operator diagnostics, user scope, and existing persistence boundaries in the foundation.
- [x] Add unified Mastra run IDs to the new web/worker/bot/background foundation paths.

**Exit gate:** an inventory scan reports no unclassified production AI SDK orchestration path.

### Phase H — Canary and evaluator retirement

- [ ] Run quota-clean Mastra-versus-legacy comparisons.
- [ ] Complete human quality review and provider validation.
- [ ] Enable internal/admin canary.
- [ ] Increase traffic by capability, not globally.
- [x] Freeze legacy production behavior; no production route invokes it.
- [ ] Preserve the final shadow archive, then remove the isolated comparator and its package export.

**Exit gate:** all required capabilities have a Mastra owner, production evidence, rollback plan, and no unresolved safety or isolation findings.

## 9. Release gates for declaring the SDK orchestration replaced

Do not declare replacement complete until all of these are true:

### Functional parity

- [ ] Supported symbols and all promised analysis modes are mapped.
- [ ] Every production AI entrypoint is Mastra-backed or explicitly deterministic/non-orchestration.
- [ ] Tool outputs, UI parts, reports, and persistence are compatible.
- [ ] Follow-ups, image requests, bots, briefings, and background jobs are covered.

### Safety and scope

- [ ] Read-only and mutating capabilities are separated by route and workflow.
- [ ] Explicit confirmation is enforced server-side for every mutation.
- [ ] User and tenant scope tests pass for tools, memory, cache, jobs, and admin paths.
- [ ] External content is isolated as data and cannot trigger actions.
- [ ] No trade execution capability exists.

### Reliability

- [ ] Cancellation reaches the model, tools, workflows, and worker jobs.
- [ ] Timeouts and retries are bounded and idempotent.
- [ ] Provider fallback preserves the same capability contract.
- [ ] Budget reservations reconcile or release on every path.
- [ ] No duplicate messages, jobs, or mutations occur on retry.

### Quality and operations

- [ ] At least 20 successful verified comparison cases are human-reviewed for the initial XAUUSD gate.
- [ ] Hidden regression cases pass without grounding/safety regression.
- [ ] Cost and latency remain within declared limits.
- [ ] Provider compatibility is validated for the supported registry.
- [ ] Run IDs, model/provider, tool calls, evidence, cost, latency, verification, and feedback are observable.
- [ ] Rollback has been exercised, not only documented.

### Removal

- [ ] Legacy traffic is zero or intentionally limited to documented deterministic utilities.
- [ ] Legacy persistence formats have a read/migration plan.
- [ ] The old tool registry and orchestration code are no longer imported by production paths.
- [x] Worker, bot, Telegram, briefing, title, and cron-backed AI paths no longer call legacy orchestration.
- [ ] The final removal is a separate reviewed change; do not delete the fallback during an evaluation change.

## 10. Immediate next implementation tasks

These are local code/documentation tasks and do not require Gemini quota:

1. Add a machine-readable migration map test covering all 33 tool names.
2. Inventory all remaining production `generateText`, `generateObject`, and `streamText` call sites and mark each as Mastra migration, retained provider utility, or deferred.
3. Generalize the current XAUUSD conversational adapters beyond XAUUSD only after symbol, timeframe, and evidence contracts are defined; the generalized packet and remaining read-only adapters now exist but still need parity evaluation.
4. Add ingestion and multi-source metadata to composite context adapters so degraded/unknown freshness can be reduced without inference.
5. Complete parity tests and ingestion metadata for the remaining read-only adapters; their bounded Mastra contracts now exist.
6. Evaluate the generalized Quick/Standard/Full paths and the new background flags against fixtures before enabling production traffic.
7. Implement the confirmation-state and persistence layer for mutations; keep execution disabled until reviewed.
8. Keep live Gemini comparison, production model verification, provider validation, and key rotation as operational gates after quota reset.

## 11. Explicit non-goals

This inventory does not authorize:

- Removing the isolated comparison evaluator before its final evidence is preserved
- Removing the AI SDK dependency now
- Enabling all 33 legacy tools in the current Mastra XAUUSD route
- Enabling mutations in the research workflow (the approval policy exists, but execution remains disabled)
- Enabling shared multi-user OSS mode
- Running live provider calls or production migrations

Those require the roadmap gates and, where applicable, explicit operational approval.
