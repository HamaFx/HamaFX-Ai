# SOLID Audit — Findings (Read-Only Pass)

> **Audit stance:** Pragmatic senior-engineer cost/benefit review, not a purity
> audit. A SOLID violation is only "Worth Fixing" if the fix buys real
> flexibility or clarity that outweighs its indirection/ceremony cost. Nitpicks
> that cost nothing either way are deliberately skipped (and listed at the end
> as evidence this isn't dogmatic).
>
> **Scope of this pass:** read-and-think only. No code was changed. Line
> numbers are from the tree at clone time (commit `ff58ae2`).

---

## Stack & Architecture (context)

- **Monorepo:** pnpm workspaces + Turbo. TypeScript 5.7 across the board.
- **Apps:**
  - `apps/web` — Next.js 15 App Router (~66k LOC). API routes, server
    actions, React UI, NextAuth, NOWPayments billing.
  - `apps/worker` — long-running Node worker (~6.8k LOC): SignalR + Binance
    WS tick consumers, 1 Hz flush loop, cron scheduler.
- **Packages:**
  - `packages/ai` (~38k LOC) — the core: chat agent (`agent.ts`), multi-agent
    deliberation, BYOK LLM provider registry, tools plugin registry, planner,
    memory, persistence.
  - `packages/data` (~7.7k LOC) — market-data providers (biquote, finnhub,
    binance, live-ticks, plus news/macro/COT sources) behind cache+failover
    adapters.
  - `packages/db` (~10k LOC) — Drizzle ORM schema, queries, migrations.
  - `packages/shared` — cross-cutting types, encryption, billing features, and
    a lightweight DI `Container`.
  - `packages/indicators`, `packages/config` — TA indicators, shared config.
- **Domain:** multi-tenant AI trading copilot. BYOK (bring-your-own-key) LLM
  routing across 10 providers; pluggable market-data providers; multi-agent
  (technical / fundamental / risk / sentiment → decision) deliberation;
  crypto-payment billing with plan-gated features.

**Most important context for this audit:** the repo has *already* been through a
self-described SOLID/architecture pass (see `architecture-audit/` and git log:
"comprehensive SOLID audit fixes", "full DI roll-out", "SRP + ISP
improvements"). As a result, the richest findings are **half-applied fixes** —
abstractions introduced but only partially adopted, or introduced in parallel
with the thing they were meant to replace. Those inconsistencies now cost more
clarity than either the old or the new state alone would.

Legend — **Severity** (if left unfixed): Critical / Moderate / Minor.
**Verdict:** ✅ Worth Fixing / ⛔ Not Worth It.

---

## 1. Single Responsibility Principle (SRP)

### SRP-1 — `runChatInner` is a ~640-line orchestration god-function
**Where:** `packages/ai/src/agent.ts:132-776` (the function body runs ~132→776).
**What's wrong:** A single function owns: budget reservation
(`tryReserveBudget`), user-settings loading, user-message persistence,
history+snapshot loading, rolling-summary compaction, system-message filtering,
UIMessage→ModelMessage conversion, model routing, BYOK key decryption, a 5-attempt
retry/fallback loop with per-provider budget-alert checks, streaming, and
end-of-turn telemetry reconciliation. At least 8 distinct responsibilities live
in one lexical scope with shared mutable locals (`attempts`, `lastError`,
`currentModelOverride`, `nonEssentialDisabled`, `checkedProviders`).
**Why it matters:** This is the hottest code path in the product. Any change to
retry policy, budgeting, or routing means reading the whole function to be sure
you didn't perturb a shared local. It's also nearly impossible to unit-test a
single concern (e.g. the fallback loop) in isolation.
**Severity:** Moderate.
**Verdict:** ✅ Worth Fixing — but *surgically*. Extract the retry/fallback loop
and the budget-reserve/reconcile pair into named collaborators; leave the linear
"turn setup" prose as-is. Do **not** shatter it into 12 micro-functions — the
top-level narrative is genuinely sequential and readable.

### SRP-2 — `getCandles` mixes cache orchestration, provider selection, and DTO mapping
**Where:** `packages/data/src/adapters/candles.ts:108-267`.
**What's wrong:** One `fetchWithMeta` closure hardcodes *which* providers to try
(`if (tf==='1m')`, `if (isCrypto)`, `if (def.category!=='crypto' && tf!=='1w')`,
`if (keys.finnhub)`), *and* inlines the raw-bar→`Candle` mapping four separate
times (lines ~131, ~157, ~189, ~215), each a near-identical `CandleSchema.parse`
block. Provider-selection policy and per-provider response mapping are the same
responsibility repeated per branch.
**Why it matters:** The duplicated mapping is a bug magnet (fix a field once, miss
it in three places). It also couples the adapter to the exact provider set —
see OCP-1, this is the same code from the OCP angle.
**Severity:** Moderate.
**Verdict:** ✅ Worth Fixing — folds into the OCP-1 plan (make candles
registry-driven + extract one shared `toCandle` mapper). Not a separate effort.

### SRP-3 — `signIn` callback embeds user-provisioning/account-linking business logic in the auth config
**Where:** `apps/web/src/auth.ts:366-474` (the `async signIn(...)` callback, ~108
lines), typed `{ user: any; account: any; profile: any }`.
**What's wrong:** The NextAuth config file also carries impersonation
challenge generation/verification (`auth.ts:80`, `:96`) and a large `signIn`
callback that performs account linking and user provisioning inline. Auth wiring
and user-lifecycle business rules are two responsibilities; the `any` typing
means none of it is type-checked.
**Why it matters:** Auth is a high-blast-radius, likely-to-change area (new
providers, new linking rules). Provisioning logic buried in a framework callback
can't be unit-tested without booting NextAuth, and the `any` types hide breakage.
**Severity:** Moderate.
**Verdict:** ✅ Worth Fixing — extract a typed `provisionUserOnSignIn(...)`
service the callback delegates to. Keep the callback as thin glue (framework
idiom stays intact).

---

## 2. Open/Closed Principle (OCP)

### OCP-1 — `candles.ts` hardcodes providers while `price.ts` already uses the plugin registry
**Where:** `packages/data/src/adapters/candles.ts:111-238` (hardcoded `if`
branches + direct `import * as biquote/binance/finnhub` at `:42-48`), vs.
`packages/data/src/adapters/price.ts:~44-52` which builds attempts from
`marketDataProviders.list()` (`provider-adapters` side-effect import + registry).
**What's wrong:** The provider-plugin registry (`provider-registry.ts`) was
introduced explicitly so that "adding a new market data provider means
registering a plugin — no adapter code changes (OCP)" (its own header comment).
`price.ts` was migrated; **`candles.ts` was not.** Adding Polygon/Alpha Vantage
today still requires editing the `candles.ts` branch ladder by hand.
**Why it matters:** "New providers" is called out as a likely future change. The
OCP win exists but is only half-collected — and the split (one adapter open, one
closed) is more confusing than if neither had been migrated, because a
contributor reasonably assumes the registry is the way and gets surprised.
**Severity:** Moderate.
**Verdict:** ✅ Worth Fixing — extend the registry's plugin contract to cover
candle fetch and drive `candles.ts` attempts from `marketDataProviders.list()`.
Highest-leverage item for the stated future direction.

### OCP-2 — Two parallel `MarketDataProvider` abstractions; every provider implemented twice
**Where:**
- Fat interface: `packages/data/src/providers/market-data-provider.ts:19-33`
  (`id`, `displayName`, `testConnection`, required `fetchTick`, required
  `fetchCandles`) — implemented in
  `packages/data/src/providers/market-data-providers.ts` as `biquoteProvider`,
  `finnhubProvider`, `liveTicksProvider`, `binanceProvider` +
  `MARKET_DATA_PROVIDERS` map (only consumed by
  `apps/web/src/app/api/settings/test-market-provider/route.ts:37`).
- Thin interface: `packages/data/src/providers/provider-registry.ts:46-67`
  (`name`, `label`, `pinned`, `fetchPrice`, optional `fetchCandles`) —
  implemented **again** for the same four providers in
  `packages/data/src/providers/provider-adapters.ts:40-115`.
**What's wrong:** The same four providers are defined twice against two
different-shaped interfaces that model the identical concept. `testConnection`
lives only on the fat one; the registry/failover path uses the thin one.
**Why it matters:** Adding one new provider means writing two adapters against
two interfaces and remembering to register it in both places, or silently losing
`testConnection` support / registry participation. This directly taxes the
"new provider" path and is a live DRY/OCP hazard.
**Severity:** Moderate.
**Verdict:** ✅ Worth Fixing — consolidate to one provider contract (add optional
`testConnection` + `fetchCandles` capability methods to the registry plugin) and
delete the duplicate. Pairs naturally with OCP-1.

**Not flagged here (good OCP):** the BYOK LLM provider registry
(`packages/ai/src/_providers/registry.ts` + `types.ts:ByokProviderSpec` with a
`factory`) and the tool plugin registry (`packages/ai/src/tools/registry.ts`)
are clean, extension-friendly designs. Adding a model provider is a spec file +
one map entry — appropriate, not worth "improving."

---

## 3. Liskov Substitution Principle (LSP)

### LSP-1 — `DecisionAgent` is registered as a `BaseAgent` but cannot be substituted for one
**Where:** `packages/ai/src/multi-agent/orchestrator.ts:44-49`
(`AGENT_FACTORIES: Record<AgentName, () => BaseAgent>` includes
`decision: () => new DecisionAgent()`), vs. `decision-agent.ts:30` (extends
`BaseAgent`), whose real entrypoint is `fuse(...)` at `decision-agent.ts:80`,
not the inherited `run(ctx)`.
**What's wrong:** `DecisionAgent` inherits `BaseAgent` for code reuse but breaks
the base contract: `tools()` returns `{}` (`decision-agent.ts:69`) and
`parseOutput()` is a degenerate keyword-sniffer (`:72`). Calling the base
contract method `run()` on it — which every other entry in `AGENT_FACTORIES`
supports — produces meaningless output (no opinions block, no synthesis). The
orchestrator only works because it *manually* special-cases decision: specialists
are `.run()` in a loop (`orchestrator.ts:128,142`) while decision is constructed
separately and `.fuse()`-d (`:174,177`). The `Record<AgentName, () => BaseAgent>`
type therefore lies — it advertises substitutability the subtype doesn't honor.
**Why it matters:** A future contributor iterating `AGENT_FACTORIES` (e.g. to add
a new specialist, run all agents generically, or build a registry) will call
`.run()` on the decision entry and get silently-wrong deliberation output — a
subtle, hard-to-spot bug in the product's headline feature.
**Severity:** Moderate.
**Verdict:** ✅ Worth Fixing — lift `DecisionAgent` out of the specialist
hierarchy/type. It's a *synthesizer*, not a specialist; give it its own type and
keep only genuine specialists in the `() => BaseAgent` map (share code via a
helper or a narrow mixin, not inheritance).

### LSP-2 — `live-ticks` provider throws instead of honoring the `fetchCandles` contract
**Where:** `packages/data/src/providers/market-data-providers.ts:159-161`
(`fetchCandles` throws `'live-ticks provider only supports 1m timeframe'` for any
`tf !== '1m'`), against the interface at `market-data-provider.ts:27-32` whose
`fetchCandles` promises `Promise<Candle[]>` for any `Timeframe`.
**What's wrong:** A caller holding a `MarketDataProvider` cannot substitute the
`live-ticks` instance for another and expect the declared contract to hold —
`fetchCandles(sym, '1h', n)` throws where others return data. The registry
variant models this correctly (optional `fetchCandles` returning `Candle[] |
null`, `provider-registry.ts:66`), which is further evidence the fat interface's
mandatory `fetchCandles` is the wrong shape.
**Why it matters:** Modest today (call sites know to route 1m only), but it's a
latent substitutability trap and disappears for free once OCP-2 consolidates on
the capability-based (optional/nullable) contract.
**Severity:** Minor.
**Verdict:** ✅ Worth Fixing — but only as a rider on OCP-2 (make candle support
a declared optional capability). Not worth a standalone change.

**Not flagged here (good LSP):** the four specialist agents (`technical`,
`fundamental`, `risk`, `sentiment`) are fully substitutable through
`BaseAgent.run()` — the template-method design there is sound.

---

## 4. Interface Segregation Principle (ISP)

### ISP-1 — Segregated agent-context interfaces exist but are used nowhere ("ISP theater")
**Where:** `packages/ai/src/multi-agent/types.ts:65-101` defines
`AgentBaseContext`, `AgentDataContext`, `AgentConfigContext`, `AgentIOContext`,
with a comment claiming "Each agent declares which context slices it needs via
composition (e.g. `TechnicalAgentContext extends AgentBaseContext,
AgentDataContext, AgentIOContext`)." A repo-wide search shows **zero** usages of
those slice interfaces (or `TechnicalAgentContext`) outside their own
definition; every consumer takes the full `SharedContext`
(`base-agent.ts:54,74`, `decision-agent.ts:80`).
**What's wrong:** The interfaces were split for ISP but never adopted — the
promised per-agent composition doesn't exist. This is ceremony that reads as
"already done" and misleads the next contributor.
**Why it matters:** Low functional cost, but it's dead abstraction pretending to
be an active design constraint. It's the clearest example in the repo of SOLID
applied for its own sake.
**Severity:** Minor.
**Verdict:** ✅ Worth Fixing — but *only the cheap direction*: delete the unused
slice interfaces (and the aspirational comment), keep `SharedContext`. Do **not**
do the expensive direction (retrofit every agent signature to compose slices) —
that's ceremony with no payoff since all agents legitimately need most fields.

**Not flagged here (deliberately — see §6):** `ToolContext`
(`tool-context.ts:64`) is a broad interface every tool receives, but it's a
pragmatic per-turn ambient context carried via `AsyncLocalStorage`; segregating
it per-tool would add real ceremony for no real decoupling. The `packages/ai`
barrel (`src/index.ts`, ~60 exports) is a wide surface, but package barrels are
idiomatic and consumers tree-shake — not an ISP problem worth touching.

---

## 5. Dependency Inversion Principle (DIP)

### DIP-1 — DI-container adoption is partial: 110 files still import `getDb` directly
**Where:** `packages/shared/src/container.ts` (the `Container`), bootstrapped in
`packages/ai/src/db.ts:39` and `services.ts`. The container is used in ~a dozen
AI-package hot spots (`agent.ts:139,697`, tool files, registries). But
**110 non-test files still `import { getDb } from '@hamafx/db'`** and call the
module-level singleton directly (e.g. all of `apps/web/.../settings/_actions-*.ts`,
`(auth)/actions.ts`, most `api/**/route.ts`).
**What's wrong:** Two conventions for the exact same dependency coexist. The
"DIP" abstraction (resolve `db` from the container so tests can inject a mock)
covers a minority of call sites; everywhere else reaches for the singleton. A
contributor can't tell which convention is "the" convention, and test-time DB
mocking only works for code that happens to go through the container.
**Why it matters:** Inconsistency is the cost here, not the pattern itself. Mixed
conventions mean a mock registered via `container.register('db', …)` silently
fails to intercept the 110 direct importers — a real testing footgun.
**Severity:** Moderate.
**Verdict:** ✅ Worth Fixing — but the fix is **"pick one convention and commit,"
not "expand the service locator."** See §6: the container is itself a weak
abstraction (stringly-typed service locator); spreading it to 110 more files is
churn. The pragmatic resolution is a single documented rule (most likely: keep
direct `getDb()` for Next server actions/routes, reserve the container for the
`packages/ai` runtime that actually benefits from injection) and align both ends
of the split — rather than leaving it half-and-half.

### DIP-2 — Service-locator tokens are stringly-typed and the `TOKENS` constant is barely used
**Where:** `container.resolve<DbClient>('db')` with a magic string + a
caller-asserted generic (`agent.ts:139`, `db.ts:45`);
`agent.ts:697` uses the literal `'llmClient'` while `services.ts:32` defines a
`TOKENS` constant that is used exactly once (`services.ts:48`) and ignored
elsewhere.
**What's wrong:** `resolve<T>(token)` has no compile-time link between the token
string and `T` — a typo or a wrong type parameter fails only at runtime. The
`TOKENS` helper that would centralize this is applied inconsistently.
**Why it matters:** Small blast radius today (2 tokens), but it undercuts the
whole point of the DI abstraction (type-safe wiring) and invites drift as tokens
multiply.
**Severity:** Minor.
**Verdict:** ✅ Worth Fixing — cheap: route all `register`/`resolve` calls
through `TOKENS` (or typed token symbols) so the token↔type mapping is
single-sourced. Low effort, removes a footgun. Do this only alongside the DIP-1
decision so you're not hardening a pattern you're about to scope down.

**Not flagged here (good/acceptable DIP):** the `LlmClient` interface
(`llm-client.ts:83`) is a sound abstraction over the Vercel AI SDK, adopted as a
PoC in `agent.ts` with the rest migrating incrementally — that's fine. The
NOWPayments webhook (`api/billing/webhook/route.ts`) is coupled to one payment
provider, but there is exactly one payment provider — abstracting it now is YAGNI
(see §6).

---

## 6. Prioritized "Worth Fixing" List (highest impact first)

No finding is *Critical* in the "actively breaking production today" sense —
everything works because current callers manually route around the rough edges.
Priority below is by **impact on the explicitly-likely future changes** (new
providers, new integrations, new auth/billing paths) and by testing/maintenance
risk.

| # | Finding | Principle | Severity | Why it's first-in-line |
|---|---------|-----------|----------|------------------------|
| 1 | **OCP-1 + OCP-2 + SRP-2 + LSP-2 — consolidate the market-data provider layer** (one plugin contract with optional `testConnection`/`fetchCandles`; drive `candles.ts` from the registry; single shared `toCandle` mapper) | OCP/SRP/LSP | Moderate | Directly unblocks the "add a new provider" path, which is stated as likely. Kills the double-implementation, the hardcoded candle ladder, and the live-ticks LSP throw in one coherent change. Biggest flexibility-per-effort. |
| 2 | **LSP-1 — remove `DecisionAgent` from the `BaseAgent` factory/hierarchy** | LSP | Moderate | Protects the headline multi-agent feature from a silent, easy-to-introduce bug the moment anyone iterates `AGENT_FACTORIES` generically. |
| 3 | **SRP-3 — extract user provisioning out of the `signIn` callback (typed service)** | SRP | Moderate | Auth/account-linking is a high-blast-radius, likely-to-change path; makes it testable and removes `any`-typed business logic. |
| 4 | **SRP-1 — decompose `runChatInner`** (extract retry/fallback loop + budget reserve/reconcile only) | SRP | Moderate | Hottest path in the product; targeted extraction improves testability without shredding the readable linear flow. |
| 5 | **DIP-1 — settle on a single DB-access convention** (document it; align both ends of the current split) | DIP | Moderate | Removes the test-mocking footgun and the "which way is right?" ambiguity across 150+ files. Decision-first, low-code. |
| 6 | **DIP-2 — single-source DI tokens via `TOKENS`/typed tokens** | DIP | Minor | Cheap footgun removal; do it alongside #5. |
| 7 | **ISP-1 — delete the unused segregated agent-context interfaces** | ISP | Minor | Cheap; removes misleading dead abstraction. Delete-only, no retrofit. |

> Items 1 and (5+6) are natural bundles. Item 4 is the one to approach most
> conservatively — over-extraction here would trade a readable god-function for
> an indirection maze.

---

## 7. Violations Deliberately NOT Flagged as Worth Fixing

Evidence this audit weighs cost, not dogma:

- **`ToolContext` breadth (ISP).** Every tool receives `db`, `budget`,
  `userSettings`, `env`, `signal`, telemetry buffer (`tool-context.ts:64`).
  Textbook fat interface — but it's a per-turn ambient context threaded via
  `AsyncLocalStorage`. Splitting it per-tool means N narrow interfaces + wiring
  for zero real decoupling (all tools run in the same turn scope). **Ceremony
  tax > benefit.**
- **No payment-provider abstraction (DIP).** The NOWPayments webhook and status
  mapping are hardcoded (`api/billing/webhook/route.ts`). There is one payment
  provider and no roadmap signal for a second. Introducing a `PaymentProvider`
  interface now is **premature abstraction (YAGNI)**; revisit only when a second
  processor is actually on the table.
- **Do NOT expand the DI container to all 110 direct `getDb` importers (DIP).**
  The container is a stringly-typed *service locator* — a weak abstraction that
  hides dependencies rather than inverting them. Spreading it further is churn
  that entrenches the weaker pattern. (DIP-1 asks for a *decision*, not blanket
  adoption.)
- **Do NOT retrofit the segregated agent-context slices onto every agent (ISP).**
  Only the dead-code deletion (ISP-1) is worth it. Forcing each agent signature
  to compose `AgentBaseContext & AgentDataContext & …` is ceremony — the agents
  genuinely use most of the context.
- **`packages/ai` barrel breadth (~60 exports).** Wide, but package barrels are
  idiomatic and tree-shakeable. Not a real ISP cost.
- **`apps/worker` `runWorker`/`main` composition (SRP).**
  `apps/worker/src/index.ts:134` wires consumers + buffer + flush loop; this is a
  legitimate **composition root**, not a god-object. Leave it.
- **`settings/_actions-*.ts` split (SRP).** The settings server actions are
  already split by concern (api-keys / data / preferences / security / shared).
  SRP done reasonably — no action needed.
- **BYOK LLM registry & tool registry (OCP).** Clean, extension-first designs;
  "improving" them would only add indirection.

---

## Next step

**Stopping here per instructions.** Awaiting explicit review and go-ahead before
generating the per-item plan files under `docs/audit/plans/`. When approved,
plans will be written **only** for the seven Worth-Fixing items in §6 (items 1
and 5+6 may each be a single consolidated plan), and **none** for the §7 items.
