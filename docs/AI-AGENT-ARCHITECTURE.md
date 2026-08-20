# Kestrel AI Agent Architecture

**Status:** Current implementation reference — Mastra production orchestration cutover complete  
**Last reviewed:** 2026-08-20  
**Scope:** AI runtime, research workflows, evaluation, persistence, and deployment boundaries

> This document describes what is implemented now. For planned work and decision gates, see the [AI and Mastra roadmap](AI-AGENT-MASTRA-ROADMAP.md). For the complete legacy-to-Mastra parity matrix, see the [migration inventory](AI-AGENT-MASTRA-MIGRATION-INVENTORY.md). For dated implementation and validation evidence, see the [validation log](AI-AGENT-VALIDATION-LOG.md).

## 1. Executive summary

Kestrel is a chat-driven market-research copilot for gold, forex, and supported crypto instruments. The application uses Mastra as the canonical production agent/orchestration layer while retaining AI SDK-compatible model and provider transports underneath.

The current architecture is deliberately split by responsibility:

- **Mastra** owns production agent execution, workflows, tool coordination, structured synthesis, request context, and AI-bearing background paths.
- **Kestrel** owns authentication, authorization, tenancy boundaries, provider credentials, budgets, persistence, market-data adapters, durable jobs, and the user-facing application boundary.
- The former Kestrel agent remains only as an isolated shadow/evaluation comparator until the final comparison archive is preserved; it is not a production fallback or public orchestration entrypoint.

This replaces the old agent system without unnecessarily replacing the provider/model compatibility layer.

## 2. Supported product boundary

The public open-source runtime currently supports:

- Single-user self-hosted deployments
- Owner-first registration
- User-scoped application data
- Encrypted BYOK provider keys
- Local PGlite development
- Full Docker/PostgreSQL deployments
- Read-only and planning-oriented market research

The current OSS runtime intentionally rejects:

- Shared multi-user PostgreSQL mode
- `MULTI_USER_ENABLED=1`
- `KESTREL_ENABLE_RLS=1`
- Open registration without complete tenant isolation

Tenant columns, tenant triggers, RLS migrations, and admin database paths exist because the hosted/future architecture has broader requirements. Their presence must not be interpreted as a claim that shared multi-user OSS deployment is currently supported.

Kestrel is a research and planning copilot. It must not place trades. Mutation tools such as alerts, schedules, journal changes, or portfolio changes require their own authorization and confirmation boundaries.

## 3. Repository topology

```text
Browser / PWA
    |
    v
apps/web
  Next.js App Router
  Auth.js, proxy, API routes, chat UI, server actions
    |
    +-->  packages/ai
    |      Mastra agents/workflows, compatibility transports, tools, budgets, telemetry
    |
    +--> packages/data
    |      Market providers, failover, caching, normalized data
    |
    +--> packages/db
    |      Drizzle schema, PostgreSQL/PGlite clients, migrations, queries
    |
    +--> packages/shared
           Zod contracts, env validation, encryption, logging, errors

apps/worker
  Live ticks, candle aggregation, scheduled jobs, analysis-job consumer
```

Dependency direction:

```text
config → shared → db + indicators → data → ai → web + worker
```

## 4. Request boundary

Browser requests pass through the web request proxy before reaching application routes. The boundary is intentionally lightweight and does not perform database work.

The request boundary provides:

1. Request IDs
2. CSRF protection for state-changing API requests
3. Auth.js session handling
4. Signed user-header defense in depth
5. Content Security Policy nonces
6. Route-specific authentication and authorization
7. Body-size, timeout, and schema validation in the route
8. Thread ownership checks before AI work
9. Rate limiting and cost-budget enforcement downstream

The client transcript is not authoritative model context. Chat routes and workers reload persisted history under the authenticated user and thread scope.

## 5. Compatibility and comparison plane

The old Kestrel orchestration is no longer a production execution plane. Its remaining implementation is isolated to the admin shadow/evaluation comparator, which is retained temporarily to produce a final regression archive. It is not imported by the main `@kestrel/ai` barrel and is not reachable from production chat, worker, bot, Telegram, briefing, title, or journal-review entrypoints.

The retained AI SDK v5 boundary is intentionally lower-level and includes:

- `LanguageModel` provider adapters and BYOK resolution
- The `LlmClient` compatibility wrapper for UI-message streaming and embeddings/vision integrations
- Provider-key health probes
- Gateway-only or compatibility-only generation branches
- The isolated shadow comparator

Mastra owns all production agent/tool orchestration. Kestrel still owns budgets, persistence, retries around durable jobs, and business-level telemetry.

## 6. Mastra execution plane

### 6.1 Scope

The validated Mastra deep-report and conversational path remains limited to eligible, read-only XAUUSD/gold requests. In addition, a generalized technical packet and Quick/Standard/Full mode foundation now supports the 18 canonical symbols behind separate feature flags. Deterministic routing keeps the model from deciding whether it is allowed to route itself, and the generalized modes remain rollout-gated pending quality evaluation.

Mastra is rejected or bypassed for:

- Other symbols or mixed-symbol prompts on the XAUUSD report/conversation path; generalized mode routing accepts only one canonical symbol from the catalog
- Mutations, trades, alerts, schedules, journal, or portfolio operations
- Prompt-injection-like requests
- Explicit model overrides
- Unsupported report follow-ups
- Disabled feature flags

### 6.2 Current implementation

The core Mastra agent is an `Agent.generate()` implementation using:

- `@mastra/core/agent`
- Mastra `RequestContext`
- A typed XAUUSD request context
- The existing Kestrel `LanguageModel` resolver
- Existing encrypted BYOK/provider selection
- Read-only XAUUSD tools
- A typed capability policy for symbol, mode, mutation, evidence, timeout, and cancellation boundaries
- A conversational Single-mode runner that uses a trusted packet and plain-text generation
- A generalized symbol-research packet for all 18 canonical symbols
- Quick and Standard bounded mode runners over one shared packet
- A Full-mode runner that can execute inside Kestrel's durable worker job boundary
- A structured research runner that uses the verified report contract

The guarded development endpoint is:

```text
POST /api/dev/mastra/xauusd
```

It is a development-only diagnostic endpoint for authenticated, owned-thread XAUUSD checks; production chat does not depend on it.

A typed capability registry now defines the server-side Mastra boundary in `packages/ai/src/mastra/capabilities.ts`. The `xauusd-research` and `xauusd-conversation` capabilities allow only XAUUSD Single/Auto read-only execution. The `symbol-research` capability allows one canonical symbol from the 18-symbol catalog in Quick/Standard/Full read-only mode, with required evidence, bounded steps, and cancellation. Production web routing and the durable worker now invoke these Mastra capabilities directly without rollout flags or legacy fallback. Unknown capabilities, unsupported modes/symbols, and mutation requests fail closed before model execution; synchronous model overrides are validated by the Mastra resolver, while Full jobs reject overrides until durable persistence carries them. This registry is the extension point for full chat parity; adding a capability will be a deliberate policy change rather than an accidental tool exposure.

The validated XAUUSD Mastra agent exposes nineteen read-only tools: the bounded research packet, price, candles, indicators, the original ten XAUUSD follow-up tools, and adapters for seasonality, COT, intermarket resonance, bounded web search, and untrusted knowledge retrieval. Conversational XAUUSD turns allowlist these narrow adapters; deep structured reports remain packet-backed and do not receive this conversational tool loop. The structure/session/technical adapters reuse existing deterministic calculations, read candle metadata through `getCandlesWithMeta`, preserve the authenticated Mastra request context and abort signal, and return evidence envelopes with fresh/stale state, provider source, produced-at time, latest candle time, short-window warnings, and partial-timeframe failures. Historical seasonality, COT, and resonance are explicitly historical/contextual rather than forecasts. Web and knowledge results are marked untrusted and are never instructions. Composite or cached legacy providers that do not expose complete ingestion/freshness metadata report that limitation explicitly as degraded/unknown rather than inferring freshness. The combined fundamental tool aggregates macro provider gaps and social-sentiment availability into one bounded quality/missing-data result.

The generalized mode path is separate from that XAUUSD tool loop. `collectSymbolResearchPacket` supports the 18 canonical symbols, computes bounded technical evidence, and exposes an explicit optional-context gap. `runMastraMode` uses one packet for Quick, Standard, and Full: one technical specialist for Quick; technical plus fundamental plus fusion for Standard; and four specialists plus fusion for Full. Web Quick/Standard and the Full worker are now Mastra-only inside their existing persistence, lease, retry, and budget boundaries.

Mastra memory/context remains opt-in through `ENABLE_MASTRA_MEMORY=true`; it loads only authenticated recent-thread messages and user-scoped historical recall, labeled as historical data rather than current evidence. Worker-owned AI tasks use `runMastraBackgroundText` with the same BYOK resolver and run telemetry. Briefings, titles, bot, and Telegram paths now use Mastra directly, with Kestrel persistence, budget, and idempotency boundaries retained. The old orchestration remains only in the isolated shadow/evaluation harness.

The mutation capability is defined but disabled by default. `mutation-workflows` describes alerts, journal writes, share links, and operator actions, while `mutation-policy.ts` requires both an operator flag and an explicit server-side confirmation. No research agent exposes a mutation tool, and external content cannot satisfy the approval boundary.

### 6.3 Research pipeline

```text
User request
    |
    v
Deterministic route eligibility check
    |
    v
Resolve existing Kestrel BYOK model
    |
    v
Collect bounded XAUUSD research packet in TypeScript
    |
    v
Create compact trusted model context
    |
    v
Generate structured report
    |
    v
Run deterministic verification
    |
    +--> repair once when allowed
    |
    +--> fail closed when verification remains invalid
    |
    v
Return report metadata and user-facing text
```

### 6.4 Research packet

The current technical packet collects, in parallel:

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

Optional macro evidence can include:

- Gold-relevant news
- Upcoming USD economic events
- Dollar index observations
- US real yields
- US breakeven inflation

Required technical data fails closed. Optional macro gaps remain typed and visible rather than being filled from model memory.

The full packet remains server-side for verification. The synthesis model receives a compact view with bounded candle and indicator history plus provenance, timestamps, freshness, quality, and missing-data warnings.

### 6.5 Structured report and verification

The report schema includes:

- Symbol and analysis timestamp
- Data quality
- Bias and confidence
- Regime
- Technical and fundamental summaries
- Bullish and bearish scenarios
- Triggers and invalidation conditions
- Risks
- Contradictions
- Missing data
- Evidence IDs and source timestamps
- Explicit numeric claims

The verifier checks:

- Schema validity
- Evidence ID existence
- Numeric claim values against packet evidence
- Stale and future timestamps
- Data-quality disclosure
- Scenario safety requirements
- Confidence consistency
- Missing-data behavior

The verifier also scans narrative report fields. Every numeric value there must match a verified `numericClaims` entry; structural notation such as `1h`, `15-minute`, `EMA 20`, and `MACD 12/26/9` is allowed. The parser remains intentionally conservative and should gain regression cases whenever new report vocabulary is introduced.

## 7. Production chat and shadow comparison

Production chat routing is Mastra-only. The route handles verified XAUUSD research, canonical read-only chat, supported symbol modes, and durable Full jobs through Mastra without a legacy fallback. Capability and mutation policies fail closed before model execution.

The isolated shadow comparison remains separately controlled by the database shadow setting and its non-production equivalent:

```text
mastra_xauusd_shadow
ENABLE_MASTRA_SHADOW=true
```

Shadow comparison:

- Uses the authenticated user's existing provider resolution
- Uses the daily budget reservation path
- Has a bounded timeout
- Does not append duplicate chat messages
- Does not generate titles
- Does not expose shadow output to the user
- Persists aggregate comparison data rather than raw response text
- Records completion, verification, overlap, latency, cost, and failure information

The shadow response is never exposed to the user, and shadow failures cannot affect the Mastra response.

## 8. Multi-agent and background planes

Mastra is canonical for production AI-bearing paths:

- Quick: one technical specialist over one generalized packet
- Standard: technical and fundamental specialists plus fusion over one shared packet
- Full: four specialists plus fusion inside the worker's durable lease/retry/budget boundary
- Briefings, weekly reviews, title generation, bot, Telegram, semantic routing, journal review, thread summaries, and chart-image analysis use Mastra-backed runners or deterministic fail-closed behavior
- Mutation capabilities remain approval-gated and disabled by default

The mode runners avoid duplicate market fetches by sharing one deterministic packet. The worker and application retain ownership of durable persistence, leases, retries, budgets, and idempotency. The shadow comparator is the only remaining old-orchestration execution and is isolated from user-facing traffic.

## 9. Data, persistence, and user scope

Kestrel keeps these concerns outside Mastra:

- Authentication and authorization
- User and tenant scoping
- Database schema and migrations
- Encrypted BYOK storage
- Budget enforcement
- Provider credential resolution
- Market-data failover
- Business audit records
- HTTP request handling
- UI rendering
- Worker deployment and scheduling

Inside `packages/ai`, database and model dependencies follow the typed DI boundary. Application and worker composition edges use the supported database access convention.

Every user-owned operation should carry an authenticated user ID. Hosted/future multi-tenant paths additionally require tenant context and RLS; the current OSS runtime refuses to enable those paths until coverage is complete.

## 10. Observability

AI runs should have one canonical run identity containing:

- User and thread scope
- Workflow/agent version
- Prompt version where applicable
- Model and provider
- Tool calls and evidence IDs
- Freshness and data quality
- Token usage and cost
- Per-stage latency
- Verification result
- Final status
- Later feedback and review labels

Current systems include structured shared logging, diagnostic traces, metrics, AI shadow persistence, feedback review, regression cases, and governed dataset export. New instrumentation should extend these systems rather than create an independent trace format.

## 11. Deployment paths

### OSS self-hosted path

- Single-user by default
- PGlite Simple mode or PostgreSQL Full mode
- BYOK keys stored encrypted by the instance
- Worker available in Full mode
- No supported shared multi-user runtime

### Hosted/future multi-tenant path

The hosted path may use Vercel, managed PostgreSQL, separate worker infrastructure, billing, tenant context, and RLS. The repository contains supporting infrastructure, but the current open-source runtime does not claim that all user-data queries, worker jobs, caches, and routes are ready for unrestricted shared deployment.

Before enabling shared mode, every query, cache key, route, background job, and administrative operation must establish and verify tenant scope, with real database-role/RLS tests in staging.

## 12. Known architectural pressure points

- Legacy AI SDK, multi-agent SSE, and background-job stream protocols overlap.
- The codebase contains more AI features and integrations than the primary XAUUSD research promise requires.
- Multiple schedulers can own different classes of jobs.
- Tenant/RLS infrastructure exists alongside an intentionally disabled OSS runtime.
- TradingView and local chart-data paths coexist.
- Optional observability systems must not duplicate sensitive AI payloads.
- Public chat-image storage should be replaced with private storage and short-lived signed URLs.

These are simplification and release-correctness concerns, not reasons to replace the core framework stack.

## 13. Source map

| Concern                    | Primary locations                                                                    |
| -------------------------- | ------------------------------------------------------------------------------------ |
| Isolated legacy comparator | `packages/ai/src/agent.ts` / `apps/web/src/lib/services/mastra-shadow-comparison.ts` |
| AI routing                 | `packages/ai/src/routing.ts`, `packages/ai/src/model-resolution.ts`                  |
| Tool registry              | `packages/ai/src/tools/`                                                             |
| Mastra capability policy   | `packages/ai/src/mastra/capabilities.ts`, `mutation-policy.ts`                       |
| Mastra background runner   | `packages/ai/src/mastra/background-text.ts`                                          |
| Mastra memory context      | `packages/ai/src/mastra/memory-context.ts`, `packages/ai/src/rag.ts`                 |
| Mastra agent               | `packages/ai/src/mastra/agent.ts`                                                    |
| Mastra execution           | `packages/ai/src/mastra/run.ts`                                                      |
| Research packet            | `packages/ai/src/mastra/research-packet*.ts`                                         |
| Report generation          | `packages/ai/src/mastra/report-generation.ts`                                        |
| Report verification        | `packages/ai/src/mastra/report-verifier.ts` and related verifier modules             |
| Chat routing               | `apps/web/src/lib/services/mastra-chat-routing.ts`                                   |
| Shadow comparison          | `apps/web/src/lib/services/mastra-shadow-comparison.ts`                              |
| Chat route                 | `apps/web/src/app/api/chat/route.ts`                                                 |
| Mastra development route   | `apps/web/src/app/api/dev/mastra/xauusd/route.ts`                                    |
| Database schema            | `packages/db/src/schema/`                                                            |
| Migrations                 | `packages/db/drizzle/`                                                               |
| Worker                     | `apps/worker/src/`                                                                   |
| Evaluation                 | `packages/ai/src/eval/`                                                              |
| Admin comparison           | `apps/web/src/app/api/admin/ai-shadow/` and related admin UI                         |

## 14. Related documents

- [AI and Mastra roadmap](AI-AGENT-MASTRA-ROADMAP.md)
- [Mastra migration inventory](AI-AGENT-MASTRA-MIGRATION-INVENTORY.md)
- [AI validation log](AI-AGENT-VALIDATION-LOG.md)
- [General architecture](01-architecture.md)
- [Security guide](10-security.md)
- [OSS release checklist](14-oss-release-checklist.md)
- [Testing guide](09-testing.md)
