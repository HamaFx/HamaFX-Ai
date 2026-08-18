# Kestrel AI Agent and Mastra Roadmap

**Status:** Planning document  
**Scope:** AI and agent system only  
**Primary market:** XAUUSD  
**Last updated:** 2026-08-18

## 1. Executive decision

Kestrel should use **Mastra as the main AI/agent orchestration layer**, but Mastra should not replace the entire application.

Mastra will manage:

- Agents
- Research workflows
- Tool coordination
- Structured outputs
- Agent memory where appropriate
- Evaluations and agent tracing
- Future approval workflows

Kestrel should keep:

- Next.js and the existing chat UI
- PostgreSQL and Drizzle
- NextAuth authentication
- User and tenant isolation
- Existing market-data providers and adapters
- BYOK encryption and user API keys
- Node worker infrastructure
- TradingView charts
- Grafana application observability

The migration must be **proof-first**. The current AI system must not be deleted until Mastra has been tested against it for provider compatibility, grounding, quality, cost, latency, and failure recovery.

### Runtime prerequisite

The current Mastra release used by the proof of concept requires Node.js 22.13.0 or newer. Kestrel's local development, Docker images, CI, release jobs, and project engine declaration must therefore use Node.js 22.13.0+ before the Mastra path is connected to production traffic.

## 2. Product rules

These rules define the target product.

- Kestrel is a research and planning copilot, not a trade execution bot.
- Kestrel must never place trades.
- XAUUSD is the first and most important market.
- “Analyse gold” should trigger deep analysis by default.
- Deep analysis should show progress and then one complete verified report.
- Kestrel should remember preferences only in the first version.
- Kestrel should fail closed when required data is unavailable rather than guess.
- Alerts and schedules are postponed until research quality is reliable.
- Read-only research tools may run automatically.
- Tools that create or change user data require explicit confirmation.
- News, web content, and tool output are data, never instructions.
- The agent must not invent prices, candles, indicators, news, levels, or historical facts.
- Every important factual claim must be traceable to supporting evidence.
- Market analysis must use scenario language rather than certainty.
- Every proposed setup must include invalidation and risks.

## 3. Target architecture

```text
Next.js chat UI
      |
      v
Mastra AI layer
  - conversational agent
  - XAUUSD research workflow
  - verification workflow
  - preference memory
  - evaluation and tracing
      |
      v
Kestrel market-data and analysis tools
      |
      +-- existing price/candle/news providers
      +-- existing indicators and structure calculations
      +-- existing database and worker
```

The target request lifecycle is:

```text
User message
   |
   +--> Understand intent and research scope
   |
   +--> Build a bounded research plan
   |
   +--> Collect required XAUUSD data in parallel
   |
   +--> Calculate objective indicators and structure in code
   |
   +--> Build a typed evidence packet
   |
   +--> Generate a structured market report
   |
   +--> Verify claims, timestamps, levels, and safety rules
   |
   +--> Stream progress and return the final report
```

The important design change is that the model should not randomly rediscover the complete market-research process on every request. The workflow should provide the required evidence first; the model should interpret and explain it.

## 4. Framework responsibilities

### Mastra

Use Mastra for:

- Agent definitions
- Workflow definitions
- Agent and tool execution
- Structured outputs
- Context passed to tools
- Research workflow state
- Agent traces and evaluations where useful
- Future suspend/resume approval flows

### Kestrel application

Keep these outside Mastra:

- Authentication and authorization
- User and tenant scoping
- Database schema and migrations
- Encrypted BYOK storage
- Budget enforcement
- Provider credential resolution
- Market-data provider failover
- Business-level audit records
- HTTP request boundary
- PWA and UI rendering
- Worker deployment and infrastructure

Mastra must never bypass Kestrel's user-scope checks or read another user's data.

## 5. Phase 0 — Product contract and baseline

### Goal

Define what “good” means before changing the agent.

### Work

Create a versioned AI product contract covering:

- Supported symbols
- Deep-analysis behavior
- Required evidence
- Safety language
- Missing-data behavior
- Allowed and forbidden tool actions
- Required report sections
- Memory policy
- Provider policy

Create an initial evaluation set of approximately 50–100 cases covering:

- “Analyse gold”
- “Is gold bullish today?”
- Multi-timeframe analysis
- Intraday setup requests
- Swing setup requests
- Macro/news-driven questions
- Conflicting timeframes
- Missing price data
- Stale candle data
- Missing news data
- Unsupported assets
- Follow-up questions
- Requests containing malicious instructions in news content
- Requests to create alerts
- Requests that should remain normal conversation

Run those cases against the existing agent and save:

- Final response
- Tool calls
- Tool results
- Model and provider
- Cost
- Latency
- Errors
- Citation/grounding score
- Human quality labels where available

### Exit criteria

- A baseline report exists.
- The current system's failures are measurable.
- The team can compare the current agent with the Mastra agent.
- Market-data tests use fixtures instead of depending only on live providers.

## 6. Phase 1 — Mastra proof of concept

### Goal

Prove that Mastra works with Kestrel's most important requirements before a large migration.

### Proof-of-concept capabilities

Build one isolated XAUUSD agent that can:

1. Receive a user request.
2. Resolve the authenticated user.
3. Use the user's encrypted BYOK provider key.
4. Resolve a selected model.
5. Call one price tool.
6. Call one candle tool.
7. Call one indicator tool.
8. Stream progress and text.
9. Stop on client disconnect.
10. Record model, provider, cost, and tool calls.
11. Respect user and tenant scope.
12. Handle provider errors without leaking secrets.

### Compatibility checks

Test:

- Google models
- Anthropic models
- OpenAI-compatible models
- Per-user API keys
- Provider fallback
- Model override
- Abort signals
- Tool timeout behavior
- Database access through the existing DI boundary
- Daily budget enforcement
- Existing telemetry

### Decision gate

Continue with Mastra only if the proof of concept supports BYOK and user isolation without unacceptable custom work.

If Mastra makes provider-agnostic BYOK unreliable, keep model execution on the existing AI SDK layer and use Mastra only where it provides clear value. Do not sacrifice provider independence for framework consistency.

### Exit criteria

- One Mastra XAUUSD agent works outside production.
- BYOK works for the supported provider registry.
- No cross-user data access is possible.
- Streaming and cancellation work.
- Cost and model data are captured.
- Existing production behavior is unchanged.

## 7. Phase 2 — Tool architecture

### Goal

Turn Kestrel's current tools into reliable, typed agent interfaces.

### Tool groups

#### Read-only market research

- Current price
- Candles
- Indicators
- Market structure
- Session levels
- Volatility
- News
- Economic calendar
- Intermarket data
- Seasonality
- Positioning
- Sentiment

#### Deterministic analysis

- Trend and regime calculation
- Support/resistance calculation
- Swing and structure calculation
- Volatility calculation
- Scenario-level calculations
- Risk-range calculations

#### User data

- Preferences
- Journal entries
- Saved reports

#### Mutations

- Create alert
- Update alert
- Create schedule
- Share report

Mutation tools must be disabled in the initial research workflow.

### Tool contract

Every tool should have:

- A clear name
- A short description
- Strict input validation
- Strict output validation
- An explicit output schema
- Supported symbol information
- Supported timeframe information
- Read-only or mutating classification
- Estimated latency
- Estimated cost
- Freshness expectations
- Provider/source metadata
- Abort support
- Typed error results

Every market-data result should include:

```ts
{
  evidenceId: string,
  symbol: "XAUUSD",
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

### Composite tools

After the individual tools are stable, add bounded composite tools where they reduce unnecessary model decisions:

- `get_xauusd_research_packet`
- `get_xauusd_multi_timeframe_snapshot`
- `get_xauusd_macro_context`

Individual tools should remain available for follow-up questions and data gaps.

### Exit criteria

- Tool inputs and outputs are validated.
- Every important result has provenance.
- Tool results are compact enough for model context.
- Read-only and mutating tools are clearly separated.
- Tool failures are visible and typed.

## 8. Phase 3 — Deep XAUUSD research workflow

### Goal

Make “analyse gold” comprehensive, repeatable, and auditable.

### Default deep-analysis scope

#### Market state

- Current XAUUSD price
- Market timestamp
- Session and liquidity context
- Data freshness
- Provider health

#### Multi-timeframe price analysis

- Daily trend
- 4-hour trend
- 1-hour structure
- 15-minute setup context
- Relevant recent highs and lows
- Volatility by timeframe

#### Technical analysis

- Moving averages
- RSI
- MACD
- ATR
- Bollinger or equivalent volatility bands
- Support and resistance
- Pivots where useful
- Market structure
- Breaks of structure
- Change of character
- Fair-value gaps or equivalent structural zones
- Liquidity sweeps where supported

#### Fundamental and macro analysis

- Upcoming high-impact calendar events
- Recent relevant macro news
- Dollar context
- Interest-rate and yield context where available
- Central-bank context
- Gold-specific catalysts

#### Broader context

- Intermarket relationships
- Seasonality where available
- Positioning or commitment data where available
- Conflicting signals

### Workflow stages

1. Parse the user request.
2. Confirm XAUUSD and the analysis horizon.
3. Select the required research scope.
4. Fetch data in parallel.
5. Mark missing or stale data.
6. Calculate indicators and structure in code.
7. Build the evidence packet.
8. Ask the synthesis agent for a structured report.
9. Run verification.
10. Regenerate or fail closed if verification fails.
11. Stream the final verified report.

### Progress shown to the user

```text
Understanding your request
Collecting gold price and candle data
Checking multi-timeframe structure
Checking indicators and volatility
Checking macro and news context
Building scenarios
Verifying the report
Preparing final answer
```

### Exit criteria

- “Analyse gold” always produces a known research scope.
- Required data collection is visible in traces.
- Missing data is not silently ignored.
- The same fixture produces predictable evidence.
- The report includes all required sections.

## 9. Phase 4 — Structured market report

### Goal

Stop relying on unrestricted financial prose as the primary model output.

The model should produce a validated report similar to:

```ts
{
  symbol: "XAUUSD",
  asOf: string,
  dataQuality: "complete" | "partial" | "degraded",
  bias: "bullish" | "bearish" | "neutral" | "unclear",
  confidence: number,
  regime: string,
  technicalSummary: string,
  fundamentalSummary: string,
  scenarios: Array<{
    name: string,
    trigger: string,
    entryZone?: string,
    invalidation: string,
    targets?: string[],
    risks: string[],
    evidenceIds: string[]
  }>,
  contradictions: string[],
  missingData: string[],
  numericClaims: Array<{
    label: string,
    value: number,
    evidenceId: string,
    tolerance?: number
  }>,
  evidenceIds: string[]
}
```

### Required report sections

- Bottom line
- Analysis timestamp
- Data quality
- Higher-timeframe trend
- Shorter-timeframe structure
- Indicators and volatility
- Fundamental and macro context
- Important levels
- Bullish scenario
- Bearish scenario
- Invalidation conditions
- Risks
- Conflicting signals
- Missing data
- Sources and timestamps

### Exit criteria

- Structured output validates against a schema.
- The UI renderer can display the same report consistently.
- The model cannot omit invalidation from a setup.
- Evidence IDs are present for factual sections.

## 10. Phase 5 — Verification and safety gate

### Numeric verification

Check that:

- Prices exist in the evidence packet.
- Levels exist in the evidence packet.
- Indicator values match deterministic calculations.
- Percentages and ranges are mathematically valid.
- The symbol is correct.
- The timeframe is correct.

### Temporal verification

Check that:

- Current claims use fresh data.
- News includes a publication or event time.
- Historical data is labelled historical.
- Mixed-timeframe analysis is clearly separated.

### Setup verification

Reject or revise reports with:

- No invalidation level
- No trigger condition
- Unsupported entry levels
- Unsupported targets
- Guaranteed language
- Excessive confidence despite degraded data

### Contradiction verification

Require the report to acknowledge meaningful conflicts, such as:

- Daily bullish but 15-minute bearish
- Positive macro but weak technical structure
- Strong trend but unusually high volatility
- Stale data mixed with current data

### Missing-data behavior

The initial product decision is to **stop and explain** when required data is unavailable.

The report should state:

- Which data failed
- Why that data matters
- Whether another analysis type remains possible
- When the user can retry

Kestrel must not fill missing information from model memory.

### Exit criteria

- Unsupported numeric claims are blocked or revised.
- Stale claims are labelled.
- Missing required evidence prevents a misleading final answer.
- Mutation tools cannot run from research content.

## 11. Phase 6 — Chat integration

### Goal

Connect the new Mastra system to the existing chat without losing the current UX.

### Routing

Use separate paths:

- Normal question → conversational agent
- “Analyse gold” → deep research workflow
- Follow-up about the current report → report-aware conversation
- Preference request → preference operation
- Alert request → later approval workflow

### UI behavior

The user should be able to:

- See progress
- Cancel analysis
- See the current stage
- See data warnings
- Expand sources
- See timestamps
- Ask follow-up questions about the same report
- Retry failed research

### Exit criteria

- Progress is streamed correctly.
- Cancellation stops expensive work.
- The final report is only marked complete after verification.
- A failed run does not create a misleading successful answer.

## 12. Phase 7 — Preference memory

### Initial memory policy

Store preferences only:

- Default symbol
- Language
- Timezone
- Preferred report style
- Preferred timeframes
- Whether to include certain sections

Do not initially provide the agent with unlimited previous conversations.

### Later memory options

After report quality is stable, consider retrieving:

- Relevant previous XAUUSD reports
- Changes since a previous report
- User journal context
- User corrections and preferences

Memory should be retrieved selectively, not dumped into every prompt.

### Exit criteria

- Preferences are user-scoped.
- Memory cannot leak between users.
- Users can view, change, and delete preferences.
- Previous reports are not treated as current market evidence.

## 13. Phase 8 — Multi-agent analysis, only if justified

### Goal

Use multiple agents only if they improve measured quality.

Do not begin with four independent agents fetching the same data.

Use one shared evidence packet:

```text
One XAUUSD evidence packet
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

Start with:

- Technical reviewer
- Risk reviewer

Add fundamental and sentiment reviewers only if evaluation proves they improve results.

Specialists must not invent new market facts. Every factual statement must refer to evidence IDs.

### Exit criteria

- Multi-agent mode beats single-agent mode on the evaluation set.
- Extra cost and latency are justified.
- Specialists use shared data.
- Partial or failed specialist results are clearly represented.
- The adjudicator cannot silently bless unsupported claims.

## 14. Phase 9 — Alerts and schedules

This is intentionally postponed until research quality is reliable.

The future flow is:

```text
User: Alert me if gold breaks 3400
        |
        v
AI drafts the alert details
        |
        v
User explicitly confirms
        |
        v
System validates and creates the alert
```

Rules:

- No alert creation from news or tool instructions.
- No alert creation based only on model inference.
- Explicit confirmation is required.
- Parameters must be validated.
- The action must be audited.
- The user must receive a clear success or failure response.

A durable workflow framework becomes more valuable at this stage because alerts may need pause/resume behavior and scheduled execution.

## 15. Agent system training and improvement

### Important distinction

“Training the agent” does not initially mean fine-tuning a model.

The first and most valuable form of training is an improvement loop:

```text
Real interaction
      |
      v
Trace and feedback
      |
      v
Failure classification
      |
      v
Prompt/tool/workflow/evaluation change
      |
      v
Regression test
      |
      v
Safer production release
```

A model cannot be trained to remember live prices or current news reliably. Current market knowledge must come from fresh tools and evidence, not from model training.

### Training level 1 — Prompt and workflow improvement

Use this first.

Collect examples where the agent:

- Used the wrong tool
- Missed required data
- Claimed an unsupported number
- Misread a timeframe
- Ignored conflicting evidence
- Gave an incomplete setup
- Failed to mention stale data
- Used too much certainty
- Produced unnecessary analysis
- Failed to follow the user's language or format

For each failure, classify the cause:

- Bad instructions
- Bad tool description
- Missing tool
- Incorrect tool output
- Weak research workflow
- Context overload
- Model limitation
- Verification failure
- Provider-specific behavior

Then fix the correct layer instead of blindly changing the prompt.

### Training level 2 — Curated examples

Create a high-quality training/evaluation dataset containing:

- User question
- Intended research scope
- Required tools or evidence categories
- Expected report structure
- Correct source values
- Correct uncertainty language
- Forbidden behavior
- Human-quality label
- Error category if the original answer failed

Examples should be split into:

- Training examples used to improve prompts/workflows
- Development examples used during implementation
- Hidden evaluation examples never used directly for tuning

Never evaluate only on examples the system has already seen.

### Training level 3 — Human feedback

Add feedback to completed reports:

- Helpful / not helpful
- Grounded / not grounded
- Correct / incorrect
- Missing information
- Wrong timeframe
- Wrong setup
- Other correction

Allow the user to provide a short correction. Store it with:

- User ID
- Report ID
- Evidence packet ID
- Model and provider
- Workflow version
- Prompt version
- Feedback category

Feedback must be redacted and user-scoped before entering any shared dataset.

### Training level 4 — Automated evaluation

Run evaluations against every important change.

Score separately:

#### Grounding

- Numeric claim precision
- Numeric claim recall
- Evidence ID coverage
- Timestamp coverage
- Unsupported claim rate
- Stale-data claim rate

#### Domain quality

- Trend interpretation
- Structure interpretation
- Indicator interpretation
- Scenario quality
- Invalidation completeness
- Risk completeness
- Contradiction disclosure

#### Agent behavior

- Required tools used
- Unnecessary tools avoided
- Tool errors handled
- Untrusted content ignored
- Mutation tools blocked without approval
- Missing data handled correctly

#### Operations

- Time to first progress event
- Time to final answer
- Total cost
- Tool count
- Provider fallback rate
- Failure rate
- Repeated-run consistency

### Training level 5 — Model comparison

Use the evaluation set to compare:

- Models
- Providers
- Prompts
- Workflow versions
- Single-agent versus multi-agent modes
- Different tool descriptions

A stronger model should only be adopted if its quality improvement justifies its cost and latency.

### Fine-tuning decision

Do not fine-tune at the beginning.

Consider supervised fine-tuning only when:

- The report format is stable.
- A large set of consistently high-quality examples exists.
- Repeated errors are clearly model-behavior problems.
- Prompt, workflow, tool, and verification changes have already been tried.
- The provider supports the required fine-tuning process.
- Privacy and data ownership are understood.
- The fine-tuned model can still use fresh market tools.

Fine-tuning should improve behavior and format, not replace live market data.

### Training release policy

Every agent change should have:

- A version number
- The prompt/workflow/tool changes recorded
- Evaluation results compared with the previous version
- Cost and latency comparison
- Known limitations
- Rollback capability

No model or prompt change should go directly to all users without evaluation.

## 16. Evaluation and test plan

### Unit tests

Test:

- Tool input validation
- Tool output validation
- Evidence envelope creation
- Freshness classification
- Indicator calculations
- Structure calculations
- Report schema validation
- Numeric claim verification
- Timestamp verification
- Setup verification
- User-scope enforcement
- Mutation approval policy

### Integration tests

Test:

- Mastra agent calling Kestrel tools
- BYOK model resolution
- Provider fallback
- Database access
- Abort handling
- Tool timeout handling
- Stream completion
- Failed research runs
- Partial provider outages
- Evidence packet persistence

### End-to-end tests

Test complete user journeys:

- User asks for deep gold analysis.
- Progress is shown.
- Required tools execute.
- A report is generated.
- Verification passes.
- The report is persisted.
- The user asks a follow-up question.
- Required data fails and the system stops clearly.
- The user requests an alert but no alert is created without confirmation.

### Evaluation gates

A release should be blocked when it causes a meaningful regression in:

- Grounding
- Missing-data handling
- User isolation
- Safety behavior
- Report completeness
- Cost budget
- Provider compatibility

## 17. Observability

Every AI run should have one run ID and contain:

- User ID, scoped and redacted where appropriate
- Thread ID
- Workflow version
- Prompt version
- Model and provider
- Tool calls
- Tool results and evidence IDs
- Data freshness
- Token usage
- Cost
- Latency by stage
- Verification result
- Final status
- User feedback if later provided

The observability system should answer:

- Which stage failed?
- Which provider failed?
- Which tool failed?
- Was the answer grounded?
- How much did the run cost?
- Did the user find it useful?
- Did the new version improve quality?

Avoid creating several disconnected tracing systems. Prefer one canonical run envelope and export it to the existing Grafana observability setup.

## 18. Rollout and rollback

### Rollout sequence

1. Build Mastra proof of concept.
2. Run it offline against fixtures.
3. Run it in shadow mode beside the existing agent.
4. Compare reports and metrics.
5. Enable it for internal/admin testing.
6. Enable it behind a feature flag.
7. Gradually increase traffic.
8. Keep the old agent as fallback.
9. Remove old orchestration only after stable production evidence.

### Rollback triggers

Rollback Mastra if there is:

- BYOK failure
- Cross-user data risk
- Grounding regression
- Increased unsupported numeric claims
- Unacceptable cost increase
- Unacceptable latency
- Lost or duplicated messages
- Provider fallback failure
- Verification bypass

## 19. Main risks

### Mastra and BYOK compatibility

This is the first technical unknown. It must be tested before migration.

### Deep-analysis cost

Deep analysis uses many data sources and may be slower or more expensive. The workflow must be bounded and observable.

### Data-source inconsistency

Different providers may report different timestamps or values. Evidence must preserve source and freshness.

### Overengineering again

Mastra should not become another layer of unnecessary wrappers. Use Mastra where it reduces complexity; keep simple deterministic code as ordinary TypeScript.

### False confidence

A polished report can still be wrong. Verification and evaluation are mandatory.

## 20. First implementation milestone

The first coding milestone is not a full rewrite.

Build a Mastra XAUUSD proof of concept that:

- Uses one user's BYOK provider.
- Calls price, candles, and indicators.
- Streams progress.
- Produces a basic structured report.
- Includes source timestamps.
- Stops when required data is missing.
- Records cost and tool calls.
- Runs beside the current agent.

Only after this milestone passes should the full deep-research workflow be implemented.

## 21. Implemented maintainability and observability milestone

The isolated proof of concept now has a guarded development entry point:

```text
POST /api/dev/mastra/xauusd
```

It requires:

- `NODE_ENV=development`
- `ENABLE_MASTRA_POC=true`
- An authenticated user
- A thread owned by that user
- A valid XAUUSD research prompt

The endpoint is intentionally not connected to the production chat route. It is for real BYOK and market-data testing before shadow mode.

The Mastra source is split into focused modules rather than one large implementation file:

- `constants.ts` — agent identity and version
- `stats.ts` — usage normalization and outcome classification
- `run.ts` — BYOK resolution and agent execution
- `run-telemetry.ts` — run lifecycle persistence and metrics
- `tool-telemetry.ts` — tool lifecycle persistence and metrics
- `tool-schemas.ts` — shared input limits and XAUUSD validation
- `price-tool.ts`, `candles-tool.ts`, `indicators-tool.ts` — one tool per file
- `tools.ts`, `telemetry.ts` — small compatibility barrels

This structure is deliberate: future research tools and workflow stages should be added as small modules, not appended to a central agent file.

## 22. Implemented bounded research-packet milestone

The XAUUSD POC now includes a deterministic composite research tool:

```text
get-xauusd-research-packet
```

For broad analysis it collects, in parallel:

- Current XAUUSD price
- Daily candles
- 4-hour candles
- 1-hour candles
- 15-minute candles
- EMA 20 and EMA 50
- RSI 14
- MACD 12/26/9
- ATR 14
- Bollinger Bands 20/2

The model receives this typed packet before explaining the market. It no longer has to rediscover the required technical research sequence on every request.

The packet is split into small modules for maintainability:

- `research-config.ts` — fixed windows and indicator scope
- `research-types.ts` — packet schema and status
- `research-packet-fetch.ts` — parallel data retrieval
- `research-packet-candles.ts` — candle evidence stages
- `research-packet-indicators.ts` — deterministic indicator stages
- `research-packet-assemble.ts` — fail-closed packet assembly
- `research-packet-stages.ts` — diagnostic stage helpers
- `research-packet-tool.ts` — Mastra tool boundary

If required price, candle, or indicator data is unavailable, the packet is marked `blocked`, the missing scope is recorded, and the agent is instructed to stop rather than invent an answer. Macro, news, calendar, dollar, and yield inputs are optional evidence: provider gaps remain typed and visible rather than being filled from model memory.

Additional monitoring metrics:

- `mastra_research_packet_total`
- `mastra_research_packet_blocked_total`

The agent version was `poc-2` for the research behavior and evidence contract milestone.

## 23. Implemented structured-report and verification milestone

The POC now separates the deterministic research stage from the language-model synthesis stage:

```text
Collect packet in TypeScript
        |
        v
Pass trusted packet to Mastra request context
        |
        v
Generate one structured report with no additional tool calls
        |
        v
Verify report schema, evidence IDs, quality, confidence, and scenarios
```

The report requires:

- XAUUSD symbol and analysis timestamp
- Data quality and confidence
- Bias and regime
- Technical and fundamental summaries
- At least bullish and bearish scenarios
- Trigger and invalidation for every scenario
- At least one risk for every scenario
- Evidence IDs and source timestamps
- Contradictions and missing-data disclosure

The verifier rejects:

- Unknown evidence IDs
- Reports claiming complete data when the packet is partial or degraded
- Omitted missing-data warnings
- Excessive confidence with incomplete evidence
- Blocked research packets
- Missing scenario invalidation or risk

When required data is unavailable, the system returns a deterministic explanation and does not call the model to invent a report. The structured-report path remains isolated from production chat.

## 24. Implemented Mastra model-context boundary milestone

The deterministic research packet is intentionally richer than the synthesis model needs. Passing every candle and indicator value directly into the system instructions would increase cost, latency, and context-overflow risk.

The Mastra request-context boundary now creates a compact model evidence context:

- The complete server-side packet remains available for deterministic verification.
- Only the latest 12 candles per timeframe are sent to the synthesis model.
- Only the latest 3 values for each indicator series are sent to the synthesis model.
- Evidence IDs, source, timestamps, freshness, quality, counts, warnings, and missing-data notices are preserved.
- The model context is explicitly marked as a compact view so it cannot be confused with the verification packet.

This is implemented in `packages/ai/src/mastra/model-context.ts` and is covered by deterministic tests. It keeps the Mastra request context useful without allowing the model prompt to grow with the full historical research window.

## 25. Implemented deterministic grounding-evaluation milestone

The structured report now requires explicit `numericClaims`. Each claim contains a label, numeric value, evidence ID, and small optional rounding tolerance. The verifier checks the value against the cited price, candle, or indicator evidence instead of trusting prose alone.

The verifier also rejects or reports:

- Numeric values that do not exist in the cited evidence
- Future report timestamps
- Stale evidence that is not disclosed
- Invalid report structure
- Missing scenario safety requirements

Verification outcomes emit tagged metrics:

- `mastra_report_verification_total`
- `mastra_report_verification_failed_total`

A small offline evaluation helper in `packages/ai/src/mastra/report-evaluation.ts` runs expected-valid and expected-invalid report fixtures without calling an LLM or live provider. This is the first deterministic gate for the Mastra training and regression loop.

## 26. Live provider validation milestone

A local smoke validation was run against the configured Mistral API key without printing or persisting the credential:

- Mistral provider authentication succeeded.
- `mistral-small-latest` successfully generated a structured XAUUSD report from a trusted fixture packet.
- The deterministic report verifier accepted the generated report.
- The live data collection path correctly failed closed when market data was unavailable.

The live XAUUSD packet was blocked because the local `BIQUOTE_BASE_URL` is configured as a placeholder host and the configured Finnhub path returned no candle data. This is an environment/data-provider configuration issue, not a model-grounding failure. Before endpoint testing with live market data, configure a reachable BiQuote endpoint and a Finnhub key/account that returns XAUUSD candles, then rerun the bounded research smoke test.

The authenticated HTTP endpoint was not used to mutate the configured remote database during this validation. Production chat remains unchanged.

## 27. Implemented bounded report-repair milestone

A real Mistral run exposed a valid safety failure: the model omitted a contradiction between timeframe signals. The verifier rejected it as intended. The synthesis path now has a bounded repair policy:

1. Generate the structured report.
2. Verify it deterministically.
3. If verification fails, make one repair request containing only the verifier findings.
4. Verify again.
5. If the only remaining failure is a proven timeframe-conflict disclosure, add a deterministic disclosure sentence and verify once more.
6. Otherwise fail closed.

The repair path never invents prices, levels, indicators, or trading conclusions. It records `mastra_report_repair_total` with `requested`, `passed`, `patched`, or `failed` outcomes and uses agent version `poc-3`.

With the runtime BiQuote URL set to `https://biquote.io`, a real XAUUSD packet and Mistral report completed successfully:

- Research packet: `ready`
- Data quality: `partial` when optional macro providers are not configured
- Model: `mistral-small-latest`
- Verification: passed
- Attempts: 2

The persistent `.env.local` value should be changed from the placeholder BiQuote URL to `https://biquote.io` before normal local-server testing.

## 28. Implemented feature-flagged chat rollout boundary

Mastra XAUUSD analysis can now be exercised through the normal `/api/chat` contract without changing the default production behavior.

The route is eligible only when all of the following are true:

- The `mastra_xauusd_chat` database feature flag is enabled, or `ENABLE_MASTRA_CHAT=true` is explicitly set in non-production development.
- The request uses single-agent mode.
- No explicit model override is selected.
- The prompt is a read-only XAUUSD/gold request.
- The request does not mix symbols, contain prompt-injection markers, or ask for mutations such as trades, alerts, portfolio changes, or journal writes.

The adapter uses the existing daily budget reservation, persists the user and assistant messages with idempotency protection, and emits the existing chat SSE format. The metadata includes the Mastra run, provider, research status, data quality, packet ID, cost, and verified report. It is shown in the chat as a compact report card with bias, confidence, technical/fundamental summaries, scenarios, warnings, and evidence timestamps; malformed metadata is ignored safely on the client.

If the flag lookup fails or the Mastra run fails, the route logs a safe failure reason, records route/fallback metrics, and calls the existing legacy agent. Explicit model overrides and non-XAUUSD requests remain on the legacy path.

Covered by:

- `apps/web/test/mastra-chat-routing.test.ts`
- `apps/web/test/mastra-chat-service.test.ts`
- `apps/web/test/mastra-report-card.test.tsx`
- `apps/web/test/api-chat-route.integration.test.ts`

The next rollout boundary is not a full replacement. It is internal/admin validation of this path, followed by shadow comparison and evaluation against the legacy agent before enabling broader traffic.

## 29. Implemented opt-in shadow-comparison milestone

The normal chat route now supports a separate, disabled-by-default shadow path for comparing the legacy response with Mastra without changing the user's response.

Shadow execution requires the independent feature flag:

```text
mastra_xauusd_shadow
```

For local development, the equivalent opt-in is:

```env
ENABLE_MASTRA_SHADOW=true
```

The shadow path is eligible only for:

- Single-mode requests
- Read-only XAUUSD/gold prompts
- Requests without explicit model overrides
- Requests where Mastra was not already attempted

When the legacy agent is user-facing, the route tees its UI stream and runs Mastra in the background with a 30-second timeout. When Mastra is user-facing, the route instead runs the legacy pipeline in the background with persistence disabled. This means both rollout flags can be enabled together and the two systems are genuinely compared on the same eligible request.

The shadow task:

- Uses the existing user-scoped BYOK resolver.
- Uses the existing daily budget reservation and reconciliation.
- Does not append user or assistant messages or generate titles.
- Uses separate durable telemetry kinds: `mastra_xauusd_shadow`, `mastra_xauusd_shadow_failed`, `legacy_shadow`, and `legacy_shadow_failed`.
- Keeps the current user-facing result unchanged if the comparison provider, parser, budget, or persistence path fails.
- Uses the existing `waitUntil` integration so Vercel can finish the comparison after the response closes.

Comparison telemetry intentionally stores aggregates rather than raw response text:

- Legacy and Mastra character counts
- Shared-token ratio bucket
- Whether Mastra produced a verified report
- Mastra bias and data quality
- Shadow duration and failure/skip reason

New metrics are:

- `mastra_shadow_total`
- `mastra_shadow_failed_total`
- `mastra_shadow_skipped_total`

Both rollout flags are now enabled in the private production environment for direct review. This milestone provides the safe measurement boundary needed to compare quality, cost, latency, grounding, and failure rates at scale without exposing shadow output to the user.

## 30. Implemented comparison dashboard and governed feedback loop

Shadow results are now durable and reviewable rather than existing only as metrics:

- `ai_shadow_comparisons` stores prompt hashes and aggregate comparison fields only; raw prompts and model output are not persisted.
- The admin-only `AI Compare` tab reads `/api/admin/ai-shadow` and shows completion, verification, overlap, latency, cost, and failure summaries.
- The API deliberately omits `userId` and `tenantId` from the client DTO even though the server uses them for persistence and ownership.
- Migration `0080_ai_shadow_comparisons` is idempotent and included in the normal migration chain.

The feedback-to-evaluation path is governed:

- User ratings remain hints and never automatically become pass/fail labels.
- Only reviewer-labelled feedback can enter a governed export.
- Rejected or `needs_review` records are excluded.
- Reviewer notes and issue codes are carried into annotations with redaction.
- Manual admin exports and nightly worker exports share the same annotation resolver and dataset assembly rules.
- Dataset manifests remain content-addressed and do not include raw prompt or assistant text by default.

## 31. Implemented XAUUSD macro evidence milestone

The deterministic research packet now optionally collects, in parallel:

- Gold-relevant news through the existing Finnhub/Marketaux failover adapter.
- Upcoming USD economic events through the existing calendar adapter.
- Broad dollar index observations through FRED `DTWEXBGS`.
- US 10-year real yields through FRED `DFII10`.
- US 10-year breakeven inflation through FRED `T10YIE`.

Macro evidence is one provenance-bearing packet with its own evidence ID. The model receives it through the same compact, trusted request-context boundary, and numeric macro claims can be checked against deterministic values. If a provider is unavailable, the packet remains usable when technical requirements are present but explicitly reports the missing category and marks macro quality as degraded. If all macro sources return no data, the packet contains a typed gap instead of fabricated context.

The macro fetch is still bounded by the existing Mastra run timeout and uses existing provider adapters rather than introducing a second data-access framework. Fixture tests cover complete data, partial provider failure, empty results, timestamp handling, and packet assembly.

## 32. Current review boundary and next decision

The combined milestone is locally validated before deployment. After deployment, review these in the private admin dashboard and normal chat:

1. Send several safe XAUUSD analysis prompts and confirm the report card is useful.
2. Open **Admin → AI Compare** and check that completed and failed comparisons appear.
3. Use the existing helpful/not-helpful control and add reviewer labels in **Admin → Feedback**.
4. Export only after reviewing labels in **Admin → Datasets**.
5. Compare Mastra and legacy on grounding, missing-data disclosure, latency, cost, and user feedback—not token overlap alone.

Do not disable the legacy fallback or add mutation tools yet. The next engineering decision should be based on a meaningful sample of reviewed comparisons: improve the weakest evidence source, report behavior, or workflow stage first; only then consider reducing shadow traffic or removing legacy orchestration.
