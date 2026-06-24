# HamaFX-Ai — Multi-Agent Orchestration System Plan

> **Generated:** 2026-06-24
> **Feature:** Multi-Agent Deliberation Mode (inspired by DSA's AgentOrchestrator)
> **Priority:** P1 — Strategic differentiator
> **Estimated effort:** ~120 hours (4 weeks)

---

## Table of Contents

1. [Overview & Motivation](#1-overview--motivation)
2. [Current State vs Target State](#2-current-state-vs-target-state)
3. [Architecture Design](#3-architecture-design)
4. [Agent Specifications](#4-agent-specifications)
5. [Orchestration Pipeline](#5-orchestration-pipeline)
6. [Database Schema Changes](#6-database-schema-changes)
7. [API & Routing Changes](#7-api--routing-changes)
8. [Frontend Changes](#8-frontend-changes)
9. [Settings Integration](#9-settings-integration)
10. [Streaming & UX](#10-streaming--ux)
11. [Cost & Budget Management](#11-cost--budget-management)
12. [Error Handling & Fallback](#12-error-handling--fallback)
13. [Testing Strategy](#13-testing-strategy)
14. [Implementation Phases](#14-implementation-phases)
15. [Risks & Mitigations](#15-risks--mitigations)

---

## 1. Overview & Motivation

### What

Add a **multi-agent deliberation mode** to HamaFX-Ai where multiple specialized AI agents (Technical, Fundamental, Risk, Sentiment) each analyze the user's question independently, then a **Decision Agent** fuses their opinions into a final unified response.

### Why

HamaFX-Ai currently uses a single agent with 30+ tools. While powerful, a single agent:
- Can't specialize deeply on each dimension (technical vs fundamental vs risk)
- May miss risk factors because it's focused on the user's explicit question
- Produces one perspective without internal debate
- Can't parallelize analysis across dimensions

DSA's multi-agent pipeline (Technical → Intel → Risk → Decision) produces more nuanced, well-rounded analysis by giving each dimension its own focused LLM call with a specialized system prompt.

### Modes

| Mode | Agents | LLM Calls | Latency | Cost | Use Case |
|---|---|---|---|---|---|
| **Quick** | Technical → Decision | 2 | ~3s | 1.5× | Default for simple questions ("what's the price?") |
| **Standard** | Technical → Fundamental → Decision | 3 | ~5s | 2.5× | Default for analysis questions ("analyze XAUUSD") |
| **Full** | Technical → Fundamental → Risk → Sentiment → Decision | 5 | ~8s | 4× | Deep analysis ("should I buy XAUUSD now?") |
| **Single** | Current single agent | 1 | ~2s | 1× | Fallback / user preference |

Users can set their default mode in Settings or override per-chat via the chat toolbar.

---

## 2. Current State vs Target State

### Current State

```
User Message
    ↓
runChat() in packages/ai/src/agent.ts
    ↓
Single streamText() call with:
  - System prompt (live context + tool descriptions)
  - All 30+ tools available
  - Fallback chain for model failures
    ↓
Streamed response to client
```

### Target State

```
User Message
    ↓
Mode Router (quick / standard / full / single)
    ↓
┌─────────────────────────────────────────┐
│  IF single mode: existing flow           │
│  IF multi-agent mode:                    │
│                                          │
│  ┌─────────┐  ┌──────────┐  ┌────────┐  │
│  │Technical│  │Fundamental│  │  Risk  │  │  (parallel)
│  │ Agent   │  │  Agent    │  │ Agent  │  │
│  └────┬────┘  └─────┬─────┘  └───┬────┘  │
│       │             │             │       │
│       └─────────────┼─────────────┘       │
│                     ↓                     │
│            ┌──────────────┐               │
│            │   Sentiment  │  (optional)   │
│            │    Agent     │               │
│            └──────┬───────┘               │
│                   ↓                       │
│            ┌──────────────┐               │
│            │  Decision    │               │
│            │   Agent      │               │
│            └──────┬───────┘               │
│                   ↓                       │
│         Streamed fused response            │
└─────────────────────────────────────────┘
```

---

## 3. Architecture Design

### New Files

```
packages/ai/src/
├── multi-agent/
│   ├── index.ts              ← Public API: runMultiAgentChat()
│   ├── orchestrator.ts       ← Pipeline coordinator
│   ├── modes.ts              ← Mode definitions + routing logic
│   ├── context.ts            ← Shared AgentContext type + builder
│   ├── fusion.ts             ← Decision agent prompt builder + fusion logic
│   ├── stream.ts             ← SSE streaming for multi-agent progress
│   └── agents/
│       ├── base-agent.ts     ← Abstract base: systemPrompt(), tools(), run()
│       ├── technical-agent.ts
│       ├── fundamental-agent.ts
│       ├── risk-agent.ts
│       ├── sentiment-agent.ts
│       └── decision-agent.ts
```

### Modified Files

```
packages/ai/src/
├── agent.ts                  ← Add mode routing at top of runChat()
├── index.ts                  ← Export runMultiAgentChat
├── routing.ts                ← Model resolution per agent (different models for different agents)
├── cost.ts                   ← Track per-agent costs + total multi-agent cost
├── persistence.ts            ← Persist agent opinions alongside messages
└── prompt/system.ts          ← Extract shared context for agent prompts

apps/web/src/
├── app/api/chat/route.ts     ← Accept analysisMode param, route to multi-agent
├── app/(app)/settings/agent/page.tsx  ← Add mode selector
├── components/chat/chat-screen.tsx     ← Show agent progress indicators
└── components/chat/parts/agent-deliberation.tsx ← New: render agent opinions
```

### Key Design Decisions

1. **Parallel specialist agents**: Technical, Fundamental, Risk, and Sentiment agents run in parallel (not sequential like DSA). This reduces latency from ~20s to ~8s for full mode.

2. **Sequential Decision agent**: The Decision agent runs after all specialists complete, receiving their structured opinions as input. It produces the final user-facing response.

3. **Shared context, separate prompts**: All agents receive the same live market context (candles, news, calendar) but each has a specialized system prompt focusing on its dimension.

4. **Tool scoping**: Each agent only sees the tools relevant to its domain. Technical sees chart/indicator tools. Fundamental sees news/calendar tools. Risk sees news/search tools. This reduces token usage and improves focus.

5. **Model flexibility**: Each agent can use a different model. Technical might use a fast model (Gemini Flash), while Decision uses a stronger model (Claude/GPT-4). Configurable in settings.

6. **Streaming with progress**: The user sees real-time progress: "Technical analyzing... ✓ → Fundamental analyzing... ✓ → Risk screening... ✓ → Fusing opinions... → Streaming response"

---

## 4. Agent Specifications

### 4.1 Technical Agent

**Purpose:** Pure price action, indicators, market structure analysis.

**System Prompt Core:**
```
You are a Technical Analysis Agent for HamaFX-Ai, an AI forex/XAUUSD trading copilot.

Your SOLE focus is technical analysis:
- Price action: support/resistance, trend lines, chart patterns
- Indicators: RSI, MACD, EMA, Bollinger Bands, ATR
- Market structure: SMC (Smart Money Concepts) — FVG, order blocks, liquidity zones
- Session levels: Asian/London/NY session highs/lows
- Intermarket: DXY correlation, gold/silver ratio

DO NOT discuss fundamentals, news, or sentiment. That's handled by other agents.
DO NOT give a final buy/sell recommendation. Output your technical read only.

## Output Format
Return a structured JSON object:
{
  "bias": "bullish|bearish|neutral",
  "confidence": 0.0-1.0,
  "keyLevels": { "support": [...], "resistance": [...] },
  "indicators": { "rsi": ..., "macd": ..., "ema20": ..., "ema50": ... },
  "structure": "trending|ranging|transitioning",
  "sessionContext": "Asian|London|NY|Overlap|Off-hours",
  "reasoning": "2-3 sentence technical summary",
  "concerns": ["technical warning signs"]
}
```

**Tools available:**
- `get-candles`, `get-indicators`, `get-price`, `get-market-structure`
- `get-session-levels`, `get-intermarket`, `get-intermarket-resonance`
- `get-correlation`, `get-seasonality`

**Model default:** Fast tier (Gemini Flash / Groq) — technical analysis is data-heavy but reasoning-light.

### 4.2 Fundamental Agent

**Purpose:** Macroeconomic context, central bank policy, economic calendar, COT data.

**System Prompt Core:**
```
You are a Fundamental Analysis Agent for HamaFX-Ai.

Your SOLE focus is macroeconomic and fundamental analysis:
- Economic calendar: upcoming events, their impact, forecasts vs actuals
- Central bank policy: Fed, ECB, BOE, BOJ — rate expectations, dot plot
- COT (Commitment of Traders): institutional positioning
- Intermarket resonance: DXY, US yields, equity risk appetite
- Geopolitical context affecting forex and gold

DO NOT discuss technical levels or chart patterns. That's handled by other agents.
DO NOT give a final buy/sell recommendation. Output your fundamental read only.

## Output Format
{
  "bias": "bullish|bearish|neutral",
  "confidence": 0.0-1.0,
  "keyEvents": [{ "event": "...", "impact": "high|medium|low", "date": "..." }],
  "cotPositioning": "long|short|neutral|n/a",
  "dxyContext": "strengthening|weakening|stable",
  "yieldContext": "rising|falling|stable",
  "reasoning": "2-3 sentence fundamental summary",
  "upcomingCatalysts": ["events that could move price in next 24-48h"]
}
```

**Tools available:**
- `get-calendar`, `get-cot`, `get-news`, `get-intermarket-resonance`
- `search-knowledge`

**Model default:** Mid tier (Gemini Pro / GPT-4o-mini) — requires reasoning about macro relationships.

### 4.3 Risk Agent

**Purpose:** Identify risks, red flags, and worst-case scenarios. Acts as the "devil's advocate."

**System Prompt Core:**
```
You are a Risk Screening Agent for HamaFX-Ai.

Your SOLE focus is identifying RISKS and RED FLAGS:
- Position sizing: is the implied risk/reward acceptable?
- Stop-loss proximity: how far is price from invalidation?
- Event risk: upcoming high-impact events that could cause volatility spikes
- Correlation risk: are correlated assets diverging (signal of false move)?
- Sentiment extreme: is positioning too one-sided (contrarian risk)?
- Drawdown risk: what's the maximum realistic adverse move?

You are the DEVIL'S ADVOCATE. Your job is to find what could go WRONG.
Be skeptical. If other agents are bullish, look for bearish risks and vice versa.

DO NOT give a final buy/sell recommendation. Output your risk assessment only.

## Output Format
{
  "riskLevel": "low|medium|high|extreme",
  "confidence": 0.0-1.0,
  "riskFlags": [
    { "type": "event|positioning|correlation|technical|sentiment", "description": "...", "severity": "soft|hard" }
  ],
  "maxAdverseMove": "estimated pips to stop/invalidation",
  "eventRisk": "next high-impact event + timing",
  "reasoning": "2-3 sentence risk summary",
  "hardVeto": true|false  // true = veto any buy signal
}
```

**Tools available:**
- `get-news`, `get-calendar`, `get-correlation`, `get-cot`
- `compute-risk`, `compute-position-health`

**Model default:** Mid tier — requires careful reasoning about risk scenarios.

### 4.4 Sentiment Agent (Full mode only)

**Purpose:** Social sentiment, news sentiment, market fear/greed.

**System Prompt Core:**
```
You are a Sentiment Analysis Agent for HamaFX-Ai.

Your SOLE focus is market sentiment and positioning:
- News sentiment: is recent news flow bullish or bearish?
- Social sentiment: what are traders on social media saying?
- Fear/Greed: is the market in fear, greed, or neutral?
- Contrarian signals: is sentiment so extreme it's a contrarian indicator?

DO NOT discuss technical levels or fundamentals. Output your sentiment read only.

## Output Format
{
  "sentiment": "very_bullish|bullish|neutral|bearish|very_bearish",
  "confidence": 0.0-1.0,
  "newsSentiment": "positive|negative|mixed",
  "socialSentiment": "positive|negative|mixed|unavailable",
  "contrarianSignal": true|false,
  "reasoning": "2-3 sentence sentiment summary"
}
```

**Tools available:**
- `get-news`, `search-knowledge`
- Future: social sentiment API integration

**Model default:** Fast tier — sentiment analysis is straightforward NLP.

### 4.5 Decision Agent (Fusion)

**Purpose:** Fuse all specialist opinions into a final, balanced response for the user.

**System Prompt Core:**
```
You are the Decision Agent for HamaFX-Ai, the final voice in a multi-agent deliberation.

You receive structured opinions from specialist agents:
- Technical Agent: price action, indicators, structure
- Fundamental Agent: macro context, events, positioning
- Risk Agent: risk flags, worst-case scenarios, potential vetoes
- Sentiment Agent: news/social sentiment, contrarian signals

Your job:
1. Synthesize ALL opinions into a single coherent response
2. Highlight AGREEMENT (strong signal) and DISAGREEMENT (uncertainty)
3. Give a balanced recommendation with confidence level
4. Always lead with risk if the Risk Agent flagged "high" or "extreme"
5. If Risk Agent issued a "hardVeto", you MUST NOT recommend buying

## Response Format
Respond in natural language (not JSON) as if talking to the user directly.
Structure your response:
1. **Bottom Line** — 1-2 sentence summary with direction + confidence
2. **Technical Read** — Key levels and indicator summary
3. **Fundamental Context** — Macro backdrop and upcoming catalysts
4. **Risk Assessment** — What could go wrong
5. **Actionable Plan** — Entry zone, stop, target, position sizing guidance

If agents disagree, explicitly state: "Technical says X but Risk flags Y."
Transparency builds trust. Don't hide disagreement.
```

**Tools available:** None — the Decision agent only processes the opinions from specialists. It doesn't call tools directly.

**Model default:** Strong tier (Claude Sonnet / GPT-4o) — fusion requires sophisticated reasoning.

---

## 5. Orchestration Pipeline

### 5.1 Orchestrator Flow

```typescript
// packages/ai/src/multi-agent/orchestrator.ts

interface MultiAgentResult {
  finalText: string;           // Decision agent's response (streamed to user)
  agentOpinions: AgentOpinion[]; // All specialist opinions (for UI + persistence)
  totalCostUsd: number;
  totalLatencyMs: number;
  mode: AnalysisMode;
}

interface AgentOpinion {
  agentName: string;
  bias: 'bullish' | 'bearish' | 'neutral';
  confidence: number;
  reasoning: string;
  rawData: Record<string, unknown>; // Full structured output
  costUsd: number;
  latencyMs: number;
  model: string;
}

async function runMultiAgentChat(
  params: ChatParams,
  mode: AnalysisMode,
  onProgress?: (event: ProgressEvent) => void,
): Promise<MultiAgentResult> {
  // 1. Build shared context (candles, news, calendar — fetched ONCE)
  const context = await buildSharedContext(params);

  // 2. Select agents based on mode
  const agents = selectAgents(mode); // e.g. [technical, fundamental, risk, sentiment]

  // 3. Run specialist agents in PARALLEL
  onProgress?.({ type: 'specialists_start', agents: agents.map(a => a.name) });
  const opinions = await Promise.all(
    agents.map(async (agent) => {
      onProgress?.({ type: 'agent_start', agent: agent.name });
      const opinion = await agent.run(context, params);
      onProgress?.({ type: 'agent_done', agent: agent.name, opinion });
      return opinion;
    })
  );

  // 4. Run Decision agent with all opinions
  onProgress?.({ type: 'fusion_start' });
  const decisionAgent = new DecisionAgent();
  const finalText = await decisionAgent.fuse(opinions, context, params);
  onProgress?.({ type: 'fusion_done' });

  // 5. Calculate totals
  const totalCost = opinions.reduce((sum, o) => sum + o.costUsd, 0) + decisionAgentCost;
  const totalLatency = Date.now() - startTime;

  return { finalText, agentOpinions: opinions, totalCostUsd, totalLatencyMs, mode };
}
```

### 5.2 Mode Selection Logic

```typescript
// packages/ai/src/multi-agent/modes.ts

type AnalysisMode = 'single' | 'quick' | 'standard' | 'full';

function selectAgents(mode: AnalysisMode): BaseAgent[] {
  switch (mode) {
    case 'single':    return []; // Handled by existing runChat()
    case 'quick':     return [new TechnicalAgent()];
    case 'standard':  return [new TechnicalAgent(), new FundamentalAgent()];
    case 'full':      return [new TechnicalAgent(), new FundamentalAgent(), new RiskAgent(), new SentimentAgent()];
  }
}

// Auto-detection: if the user asks "what's the price?" → quick
// If they ask "analyze XAUUSD" → standard
// If they ask "should I buy?" → full
function autoDetectMode(message: string): AnalysisMode {
  const lower = message.toLowerCase();
  if (/should i (buy|sell|enter|go long|go short)/.test(lower)) return 'full';
  if (/(analyze|analysis|outlook|view on|what do you think)/.test(lower)) return 'standard';
  if (/(price|quote|how much|current)/.test(lower)) return 'quick';
  return 'standard'; // Default
}
```

### 5.3 Shared Context Builder

```typescript
// packages/ai/src/multi-agent/context.ts

interface SharedContext {
  symbol: string;
  candles: Candle[];
  currentPrice: Tick;
  indicators: IndicatorResult[];
  marketStructure: StructureResult;
  news: NewsArticle[];
  calendar: CalendarEvent[];
  cotData?: CotData;
  intermarket: IntermarketData;
  sessionLevels: SessionLevels;
  userSettings: UserSettings;
  customInstructions?: string;
}

async function buildSharedContext(params: ChatParams): Promise<SharedContext> {
  // Fetch all data ONCE in parallel — shared across all agents
  const [candles, price, news, calendar, intermarket, sessionLevels] = await Promise.all([
    getCandles(params.symbol, '1h', { count: 300 }),
    getPrice(params.symbol),
    getNews(params.symbol, { limit: 10 }),
    getCalendar({ days: 7 }),
    getIntermarket(params.symbol),
    getSessionLevels(params.symbol),
  ]);

  return { symbol: params.symbol, candles, currentPrice: price, news, calendar, intermarket, sessionLevels, ... };
}
```

---

## 6. Database Schema Changes

### New Table: `agent_opinions`

```sql
CREATE TABLE agent_opinions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  thread_id UUID NOT NULL REFERENCES chat_threads(id) ON DELETE CASCADE,
  message_id UUID NOT NULL REFERENCES chat_messages(id) ON DELETE CASCADE,
  agent_name TEXT NOT NULL, -- 'technical' | 'fundamental' | 'risk' | 'sentiment' | 'decision'
  bias TEXT NOT NULL,       -- 'bullish' | 'bearish' | 'neutral'
  confidence REAL NOT NULL, -- 0.0-1.0
  reasoning TEXT NOT NULL,
  raw_data JSONB NOT NULL,  -- Full structured output
  model TEXT NOT NULL,      -- Which model was used
  cost_usd REAL NOT NULL,
  latency_ms INTEGER NOT NULL,
  analysis_mode TEXT NOT NULL, -- 'quick' | 'standard' | 'full'
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_agent_opinions_thread ON agent_opinions(thread_id);
CREATE INDEX idx_agent_opinions_user_created ON agent_opinions(user_id, created_at DESC);
```

### New Column: `chat_threads.analysis_mode`

```sql
ALTER TABLE chat_threads ADD COLUMN analysis_mode TEXT DEFAULT 'single';
-- Values: 'single' | 'quick' | 'standard' | 'full' | 'auto'
```

### New Column: `user_settings.default_analysis_mode`

```sql
ALTER TABLE user_settings ADD COLUMN default_analysis_mode TEXT DEFAULT 'auto';
-- Values: 'single' | 'quick' | 'standard' | 'full' | 'auto'
```

### Drizzle Schema

```typescript
// packages/db/src/schema/chat.ts — add to existing

export const agentOpinions = pgTable('agent_opinions', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: text('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  threadId: uuid('thread_id').notNull().references(() => chatThreads.id, { onDelete: 'cascade' }),
  messageId: uuid('message_id').notNull().references(() => chatMessages.id, { onDelete: 'cascade' }),
  agentName: text('agent_name').notNull(),
  bias: text('bias').notNull(),
  confidence: real('confidence').notNull(),
  reasoning: text('reasoning').notNull(),
  rawData: jsonb('raw_data').notNull(),
  model: text('model').notNull(),
  costUsd: real('cost_usd').notNull(),
  latencyMs: integer('latency_ms').notNull(),
  analysisMode: text('analysis_mode').notNull(),
  createdAt: timestamp('created_at', { mode: 'date' }).notNull().defaultNow(),
});

// Add to chatThreads
analysisMode: text('analysis_mode').default('single'),

// Add to userSettings
defaultAnalysisMode: text('default_analysis_mode').default('auto'),
```

---

## 7. API & Routing Changes

### Chat API Route

```typescript
// apps/web/src/app/api/chat/route.ts — modified

const BodySchema = z.object({
  threadId: z.string().uuid(),
  modelOverride: z.string().min(1).max(120).nullable().optional(),
  analysisMode: z.enum(['single', 'quick', 'standard', 'full', 'auto']).optional(),
  messages: z.array(...).min(1),
});

export const POST = withAuth<void>(async (req, { user }) => {
  // ... existing rate limiting ...

  const mode = body.analysisMode ?? 'auto';
  const resolvedMode = mode === 'auto' ? autoDetectMode(lastMessage) : mode;

  if (resolvedMode === 'single') {
    // Existing single-agent flow
    return runSingleAgentChat(body, user);
  }

  // Multi-agent flow
  return runMultiAgentChatStream(body, user, resolvedMode);
});
```

### New API: GET /api/chat/threads/[id]/opinions

```typescript
// Retrieve agent opinions for a thread (for UI rendering)
export const GET = withAuth<void>(async (req, { user }) => {
  const db = getDb();
  const opinions = await db.select()
    .from(schema.agentOpinions)
    .where(eq(schema.agentOpinions.threadId, threadId))
    .orderBy(asc(schema.agentOpinions.createdAt));
  return Response.json({ opinions });
});
```

### Model Resolution per Agent

```typescript
// packages/ai/src/multi-agent/orchestrator.ts

function resolveAgentModel(agentName: string, userSettings: UserSettings): LanguageModel {
  const tierMap: Record<string, 'fast' | 'mid' | 'strong'> = {
    technical: 'fast',
    fundamental: 'mid',
    risk: 'mid',
    sentiment: 'fast',
    decision: 'strong',
  };

  const tier = tierMap[agentName] ?? 'mid';
  // Use user's fallback chain, filtered by tier preference
  return resolveModelForTier(tier, userSettings);
}
```

---

## 8. Frontend Changes

### 8.1 Chat Screen — Agent Progress Indicator

```typescript
// apps/web/src/components/chat/parts/agent-deliberation.tsx

'use client';

import { Bot, Shield, TrendingUp, Newspaper, Brain, CheckCircle2, Loader2 } from 'lucide-react';

interface AgentProgress {
  agentName: string;
  status: 'pending' | 'running' | 'done';
  opinion?: AgentOpinion;
}

const AGENT_META: Record<string, { icon: ReactNode; label: string; color: string }> = {
  technical:   { icon: <TrendingUp className="size-3.5" />, label: 'Technical',   color: 'text-bull' },
  fundamental: { icon: <Newspaper className="size-3.5" />,  label: 'Fundamental', color: 'text-brand' },
  risk:        { icon: <Shield className="size-3.5" />,     label: 'Risk',        color: 'text-bear' },
  sentiment:   { icon: <Bot className="size-3.5" />,        label: 'Sentiment',   color: 'text-warn' },
  decision:    { icon: <Brain className="size-3.5" />,      label: 'Decision',    color: 'text-fg' },
};

export function AgentDeliberation({ agents, mode }: { agents: AgentProgress[]; mode: string }) {
  return (
    <div className="flex flex-col gap-2 p-3 rounded-lg border border-divider bg-bg-elev-1">
      <div className="flex items-center gap-2 text-caption text-fg-subtle">
        <Brain className="size-3.5" />
        <span className="uppercase tracking-wider font-semibold">
          Multi-Agent {mode} mode
        </span>
      </div>

      <div className="flex flex-wrap gap-2">
        {agents.map((a) => {
          const meta = AGENT_META[a.agentName];
          return (
            <div key={a.agentName} className="flex items-center gap-1.5 text-caption">
              {meta.icon}
              <span className={meta.color}>{meta.label}</span>
              {a.status === 'running' && <Loader2 className="size-3 animate-spin text-fg-subtle" />}
              {a.status === 'done' && <CheckCircle2 className="size-3 text-bull" />}
            </div>
          );
        })}
      </div>

      {/* Expandable opinions */}
      <details className="mt-1">
        <summary className="cursor-pointer text-caption text-fg-subtle hover:text-fg">
          View agent opinions
        </summary>
        <div className="mt-2 flex flex-col gap-2">
          {agents.filter(a => a.opinion).map((a) => (
            <div key={a.agentName} className="text-caption border-l-2 border-divider pl-2">
              <span className="font-semibold">{AGENT_META[a.agentName].label}: </span>
              <span className="text-fg-subtle">{a.opinion.reasoning}</span>
              <span className="ml-1 text-fg-muted">
                ({a.opinion.bias}, {Math.round(a.opinion.confidence * 100)}%)
              </span>
            </div>
          ))}
        </div>
      </details>
    </div>
  );
}
```

### 8.2 Mode Selector in Chat Toolbar

```typescript
// Add to chat-top-bar.tsx — a dropdown for analysis mode

const MODE_OPTIONS = [
  { value: 'auto', label: 'Auto', description: 'AI picks the best mode' },
  { value: 'single', label: 'Single', description: 'Fast, one agent' },
  { value: 'quick', label: 'Quick', description: 'Technical only' },
  { value: 'standard', label: 'Standard', description: 'Technical + Fundamental' },
  { value: 'full', label: 'Full', description: 'All 4 agents + fusion' },
];
```

### 8.3 Settings — Agent Page Update

Add a "Analysis Mode" section to `/settings/agent` showing:
- Default mode selector (Auto / Single / Quick / Standard / Full)
- Per-agent model override (optional — let users pick which model each agent uses)
- Cost estimate per mode ("Full mode uses ~4× more tokens than Single")
- Toggle: "Show agent opinions in chat" (expandable panel)

---

## 9. Settings Integration

### User Settings Additions

```typescript
// New fields in userSettings
{
  defaultAnalysisMode: 'auto' | 'single' | 'quick' | 'standard' | 'full',
  showAgentOpinions: boolean,        // Show expandable opinions panel in chat
  agentModelOverrides: {             // Per-agent model override (optional)
    technical?: string,              // "google:gemini-2.5-flash"
    fundamental?: string,
    risk?: string,
    sentiment?: string,
    decision?: string,
  },
}
```

### Settings UI

Add to `/settings/agent` page:

```
┌────────────────────────────────────────────────┐
│ Analysis Mode                                   │
│                                                 │
│ Default mode: [Auto ▾]                          │
│  ○ Auto — AI picks based on your question       │
│  ○ Single — Fast, one agent (current behavior)  │
│  ○ Quick — Technical only (~3s, 1.5× cost)      │
│  ○ Standard — Technical + Fundamental (~5s)     │
│  ○ Full — All 4 agents + fusion (~8s, 4× cost)  │
│                                                 │
│ ☑ Show agent opinions in chat                   │
│   (expandable panel showing each agent's view)  │
│                                                 │
│ ── Advanced: Per-agent model override ──        │
│ Technical:  [Default (fast tier) ▾]             │
│ Fundamental: [Default (mid tier) ▾]             │
│ Risk:       [Default (mid tier) ▾]              │
│ Sentiment:  [Default (fast tier) ▾]             │
│ Decision:   [Default (strong tier) ▾]           │
│                                                 │
│ Cost estimate: Full mode ≈ $0.04/turn           │
│ (based on your 30d avg of $0.01/turn)           │
└────────────────────────────────────────────────┘
```

---

## 10. Streaming & UX

### Streaming Protocol

The multi-agent flow streams two things:
1. **Progress events** (via SSE data parts) — agent start/done status
2. **Final response text** (via standard AI SDK streaming) — Decision agent's output

```typescript
// Stream format (UI message parts):

// 1. Progress parts (new part type: data-agent-progress)
{ type: 'data-agent-progress', data: { agent: 'technical', status: 'running' } }
{ type: 'data-agent-progress', data: { agent: 'technical', status: 'done', opinion: {...} } }
{ type: 'data-agent-progress', data: { agent: 'fundamental', status: 'running' } }
// ... etc
{ type: 'data-agent-progress', data: { agent: 'decision', status: 'running' } }

// 2. Text parts (standard)
{ type: 'text', text: "Based on the multi-agent analysis...\n\n" }
{ type: 'text', text: "**Bottom Line:** XAUUSD is in a bullish technical..." }
// ... rest of Decision agent's response
```

### Client-Side Rendering

```typescript
// chat-screen.tsx — handle new part type

function renderPart(part: UIMessagePart) {
  if (part.type === 'data-agent-progress') {
    return <AgentDeliberation agents={part.data.agents} mode={part.data.mode} />;
  }
  // ... existing part rendering
}
```

### Latency Budget

| Mode | Target latency | Budget |
|---|---|---|
| Quick | < 4s | Specialists: 2s parallel, Decision: 2s |
| Standard | < 6s | Specialists: 3s parallel, Decision: 3s |
| Full | < 10s | Specialists: 4s parallel, Decision: 6s |

If any specialist exceeds its budget, the orchestrator cancels it and proceeds with available opinions. The Decision agent notes which agents didn't respond.

---

## 11. Cost & Budget Management

### Per-Agent Cost Tracking

```typescript
// packages/ai/src/multi-agent/orchestrator.ts

// Each agent call goes through the existing cost tracking system
// The orchestrator sums all agent costs and records against the daily budget

async function runAgentWithBudget(agent, context, params): Promise<AgentOpinion> {
  const startMs = Date.now();
  const result = await agent.run(context, params);
  const latencyMs = Date.now() - startMs;

  // Record cost against user's daily budget (same as existing single-agent)
  await applyBudgetDelta(params.userId, result.costUsd, params.threadId);

  return {
    ...result,
    costUsd: result.costUsd,
    latencyMs,
  };
}
```

### Budget Guardrail

The existing `tryReserveBudget()` check happens BEFORE the multi-agent pipeline starts. The estimated cost for the selected mode is reserved upfront:

```typescript
const MODE_COST_ESTIMATE = {
  single: 0.01,   // ~$0.01/turn
  quick: 0.015,   // 1.5× single
  standard: 0.025, // 2.5× single
  full: 0.04,     // 4× single
};

const reserved = await tryReserveBudget(userId, MODE_COST_ESTIMATE[mode]);
if (!reserved) throw new BudgetExceededError();
```

After all agents complete, the actual cost is reconciled against the estimate. If actual < estimate, the difference is released.

### Usage Page Update

The usage page should show:
- Per-mode cost breakdown (how much spent on quick vs standard vs full)
- Per-agent cost breakdown (technical vs fundamental vs risk vs sentiment vs decision)

---

## 12. Error Handling & Fallback

### Agent-Level Fallback

If a specialist agent fails (model error, timeout, rate limit):

```typescript
async function runAgentWithFallback(agent, context, params): Promise<AgentOpinion | null> {
  try {
    return await withTimeout(agent.run(context, params), AGENT_TIMEOUT_MS);
  } catch (err) {
    if (classifyStreamError(err).fallback) {
      // Try next model in fallback chain
      const fallbackModel = getNextFallbackModel(agent.modelPreference);
      if (fallbackModel) {
        return await agent.run(context, params, fallbackModel);
      }
    }
    // Log and return null — Decision agent handles missing opinions
    console.error(`[multi-agent] ${agent.name} failed`, err);
    Sentry.captureException(err, { tags: { agent: agent.name } });
    return null;
  }
}
```

### Decision Agent with Missing Opinions

If one or more specialists fail, the Decision agent still runs with whatever opinions are available:

```
"Note: The Fundamental agent was unavailable for this analysis. 
The response below is based on Technical and Risk opinions only."
```

### Full Pipeline Fallback

If the Decision agent itself fails:
1. Try fallback model for Decision agent
2. If all Decision models fail, concatenate specialist reasoning as a raw response
3. If all specialists AND Decision fail, fall back to existing single-agent `runChat()`

### Timeout Handling

```typescript
const AGENT_TIMEOUTS = {
  technical: 15_000,   // 15s
  fundamental: 15_000,
  risk: 15_000,
  sentiment: 10_000,
  decision: 30_000,    // 30s — Decision needs more time to fuse
};

// Use AbortController per agent
const controller = new AbortController();
const timeout = setTimeout(() => controller.abort(), AGENT_TIMEOUTS[agent.name]);
try {
  const result = await agent.run(context, params, { signal: controller.signal });
} finally {
  clearTimeout(timeout);
}
```

---

## 13. Testing Strategy

### Unit Tests

```
packages/ai/test/multi-agent/
├── orchestrator.test.ts        ← Pipeline flow, mode selection, parallel execution
├── modes.test.ts               ← Mode routing, auto-detection
├── fusion.test.ts              ← Decision agent prompt building, opinion fusion
├── context.test.ts             ← Shared context builder
├── budget.test.ts              ← Cost estimation, budget reservation, reconciliation
├── fallback.test.ts            ← Agent failure, missing opinions, full pipeline fallback
├── agents/
│   ├── technical-agent.test.ts ← System prompt, tool scoping, output parsing
│   ├── fundamental-agent.test.ts
│   ├── risk-agent.test.ts
│   ├── sentiment-agent.test.ts
│   └── decision-agent.test.ts  ← Fusion logic, veto handling, disagreement surfacing
```

### Key Test Scenarios

1. **All agents succeed** → Decision fuses all 4 opinions
2. **One agent fails** → Decision runs with 3 opinions, notes the missing one
3. **All specialists fail** → Fall back to single-agent mode
4. **Decision agent fails** → Concatenate specialist reasoning
5. **Budget exceeded** → Reject before pipeline starts
6. **Risk agent hardVeto=true** → Decision agent must not recommend buying
7. **Agents disagree** → Decision surfaces disagreement explicitly
8. **Auto-detection** → "what's the price?" → quick, "should I buy?" → full
9. **Streaming** → Progress events arrive in correct order
10. **Timeout** → Agent cancelled, opinion marked as unavailable

### E2E Tests

```typescript
// apps/web/tests/e2e/multi-agent.spec.ts

test('full mode shows 4 agent progress indicators', async ({ page }) => {
  // Select "Full" mode in chat toolbar
  // Send "Should I buy XAUUSD now?"
  // Verify 4 agent progress chips appear (Technical, Fundamental, Risk, Sentiment)
  // Verify Decision agent response streams after all specialists complete
  // Verify expandable opinions panel shows all 4 opinions
});

test('quick mode only shows Technical agent', async ({ page }) => {
  // Select "Quick" mode
  // Send "analyze XAUUSD"
  // Verify only Technical agent chip appears
  // Verify response is faster than full mode
});
```

---

## 14. Implementation Phases

### Phase 1 — Foundation (Week 1)

| Task | Effort | Description |
|---|---|---|
| 1.1 DB migration | S | Add `agent_opinions` table, `analysis_mode` columns |
| 1.2 Drizzle schema | S | Add schema definitions, export from `@hamafx/db` |
| 1.3 Base agent class | S | `BaseAgent` abstract with `systemPrompt()`, `tools()`, `run()` |
| 1.4 Shared context builder | M | `buildSharedContext()` — fetch all data once in parallel |
| 1.5 Mode definitions | S | `modes.ts` with mode selection + auto-detection |
| 1.6 Orchestrator skeleton | M | `orchestrator.ts` — parallel execution, opinion collection |

### Phase 2 — Specialist Agents (Week 2)

| Task | Effort | Description |
|---|---|---|
| 2.1 Technical agent | M | System prompt, tool scoping, structured output parsing |
| 2.2 Fundamental agent | M | System prompt, tool scoping, structured output parsing |
| 2.3 Risk agent | M | System prompt, veto logic, tool scoping |
| 2.4 Sentiment agent | S | System prompt, tool scoping (lighter — fewer tools) |
| 2.5 Agent tests | M | Unit tests for each agent's prompt + output parsing |

### Phase 3 — Decision & Fusion (Week 3)

| Task | Effort | Description |
|---|---|---|
| 3.1 Decision agent | M | Fusion prompt builder, opinion synthesis, veto enforcement |
| 3.2 Fusion tests | M | Agreement/disagreement, veto, missing opinions |
| 3.3 Cost tracking | S | Per-agent cost, total cost, budget reservation |
| 3.4 Error handling | M | Agent fallback, timeout, full pipeline fallback |
| 3.5 Persistence | S | Save agent opinions to DB, link to messages |

### Phase 4 — Integration & UX (Week 4)

| Task | Effort | Description |
|---|---|---|
| 4.1 Chat API route | M | Accept `analysisMode` param, route to multi-agent |
| 4.2 Streaming protocol | M | SSE progress events + final text streaming |
| 4.3 Agent deliberation UI | M | Progress chips, expandable opinions panel |
| 4.4 Mode selector | S | Chat toolbar dropdown + settings page section |
| 4.5 Settings integration | S | Default mode, per-agent model override, cost estimate |
| 4.6 Usage page update | S | Per-mode and per-agent cost breakdown |
| 4.7 E2E tests | M | Playwright tests for full/quick/single modes |
| 4.8 Documentation | S | Update README + agent page with mode descriptions |

---

## 15. Risks & Mitigations

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| **Latency too high** | Medium | High — users won't wait 10s | Parallel execution + timeout per agent + quick mode default |
| **Cost 4× higher** | Medium | Medium — budget guardrail prevents overspending | Show cost estimate in settings, budget reservation upfront |
| **Agent opinions conflict** | High | Low — this is a feature | Decision agent surfaces disagreement explicitly |
| **Structured output parse failure** | Medium | Medium — agent returns non-JSON | Use Zod schema with safeParse, fall back to raw text extraction |
| **Model availability** | Low | High — if primary model is down | Use existing fallback chain per agent |
| **Token limit exceeded** | Low | Medium — 4 agent prompts + context | Each agent gets scoped tools (fewer tokens), shared context fetched once |
| **User confusion** | Medium | Low — new UI elements | Default to "auto" mode, show tooltips, keep single-agent as option |
| **Opinion persistence bloat** | Low | Low — opinions are small JSON | Store as JSONB, add cleanup cron for old opinions |

---

## Cross-Reference

- **Settings Analysis Plan:** Settings UI for mode selector (Section 9)
- **Performance & Stability Plan:** Parallel agent execution uses `Promise.all` (STAB-06 retry logic applies)
- **DSA Inspiration:** `src/agent/orchestrator.py` — modes, `src/agent/agents/` — specialist agents

---

*End of document.*