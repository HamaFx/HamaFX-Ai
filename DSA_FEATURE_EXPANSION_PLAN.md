# HamaFX-Ai — Feature Expansion Plan (DSA-Inspired)

> **Generated:** 2026-06-24
> **Source inspiration:** ZhuLinsen/daily_stock_analysis
> **Scope:** 7 features ported and adapted for HamaFX-Ai's forex/XAU domain & TypeScript stack
> **Note:** Multi-Agent Deliberation (the user's "feature 1") has its own dedicated plan in `MULTI_AGENT_SYSTEM_PLAN.md`. This file covers all the other selected features.

---

## Features Covered

| # | Feature | DSA Source | Priority | Effort |
|---|---|---|---|---|
| F1 | **Decision Signal Tracking + Outcome Evaluation** | `decision_signal_service.py`, `decision_signal_outcome_service.py`, `backtest_engine.py` | 🔴 P1 | ~80h |
| F2 | **Portfolio Management** | `portfolio_service.py`, `portfolio_risk_service.py` | 🟠 P2 | ~70h |
| F3 | **Social Sentiment Integration** | `social_sentiment_service.py` | 🟡 P3 | ~25h |
| F4 | **Notification Noise Control** | `notification_noise.py`, `notification_routing.py` | 🟠 P2 | ~30h |
| F5 | **Run Diagnostics with Secret Redaction** | `run_diagnostics.py` | 🟡 P2 | ~25h |
| F6 | **Market Phase Detection** | `trading_calendar.py`, `market_phase_prompt.py` | 🟡 P3 | ~20h |
| F7 | **Bot Platform with Commands** | `bot/commands/`, `bot/dispatcher.py` | 🟠 P3 | ~40h |

**Total estimated effort:** ~290 hours

---

## Table of Contents

1. [F1: Decision Signal Tracking](#f1-decision-signal-tracking--outcome-evaluation)
2. [F2: Portfolio Management](#f2-portfolio-management)
3. [F3: Social Sentiment Integration](#f3-social-sentiment-integration)
4. [F4: Notification Noise Control](#f4-notification-noise-control)
5. [F5: Run Diagnostics with Secret Redaction](#f5-run-diagnostics-with-secret-redaction)
6. [F6: Market Phase Detection](#f6-market-phase-detection)
7. [F7: Bot Platform with Commands](#f7-bot-platform-with-commands)
8. [Consolidated Roadmap](#consolidated-roadmap)

---

# F1: Decision Signal Tracking + Outcome Evaluation

> **The single most valuable feature to port.** Tracks every AI recommendation, then evaluates whether it was correct against actual price movement. Builds trust through accountability and enables per-model accuracy metrics.

## F1.1 Overview

### What

Every time the AI makes a directional recommendation (buy/sell/hold with entry, stop, target), store it as a structured **decision signal**. A cron job later evaluates the signal against actual price movement and records the outcome (hit / miss / neutral).

### Why

HamaFX-Ai currently has `chat_tool_telemetry` (which tools ran) but does NOT track:
- What the AI *predicted* (direction, levels)
- Whether the prediction was *correct*
- Which model produces the most accurate signals

This feature creates a feedback loop: users see the AI's track record, and the system can compare model accuracy.

### DSA Reference

- `src/services/decision_signal_service.py` — signal CRUD, lifecycle (active/expired/invalidated/closed)
- `src/services/decision_signal_extractor.py` — extract signals from analysis reports
- `src/services/decision_signal_outcome_service.py` — forward outcome evaluation, stats
- `src/core/backtest_engine.py` — pure backtest logic (hit/miss/neutral, stop/target detection)

## F1.2 Database Schema

```sql
-- Decision signals: every AI directional recommendation
CREATE TABLE decision_signals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  thread_id UUID REFERENCES chat_threads(id) ON DELETE SET NULL,
  message_id UUID REFERENCES chat_messages(id) ON DELETE SET NULL,
  symbol TEXT NOT NULL,                    -- 'XAUUSD'
  action TEXT NOT NULL,                    -- 'buy' | 'sell' | 'hold' | 'reduce' | 'add' | 'avoid'
  bias TEXT NOT NULL,                      -- 'bullish' | 'bearish' | 'neutral'
  confidence REAL,                         -- 0.0-1.0
  entry_low REAL,                          -- entry zone low
  entry_high REAL,                         -- entry zone high
  stop_loss REAL,
  take_profit REAL,
  horizon TEXT NOT NULL,                   -- 'intraday' | '1d' | '3d' | '5d' | '10d' | 'swing'
  anchor_price REAL NOT NULL,              -- price at signal creation
  anchor_at TIMESTAMPTZ NOT NULL,          -- time of signal creation
  source_type TEXT NOT NULL,               -- 'chat' | 'alert' | 'briefing' | 'manual'
  model TEXT,                              -- which model produced this signal
  analysis_mode TEXT,                      -- 'single' | 'quick' | 'standard' | 'full' (links to multi-agent)
  status TEXT NOT NULL DEFAULT 'active',   -- 'active' | 'expired' | 'invalidated' | 'closed'
  metadata JSONB DEFAULT '{}'::jsonb,      -- reasoning, market phase, etc.
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_decision_signals_user ON decision_signals(user_id, created_at DESC);
CREATE INDEX idx_decision_signals_symbol ON decision_signals(symbol, status);
CREATE INDEX idx_decision_signals_active ON decision_signals(status) WHERE status = 'active';

-- Outcomes: forward evaluation results per horizon
CREATE TABLE decision_signal_outcomes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  signal_id UUID NOT NULL REFERENCES decision_signals(id) ON DELETE CASCADE,
  horizon TEXT NOT NULL,                   -- '1d' | '3d' | '5d' | '10d'
  eval_status TEXT NOT NULL,               -- 'completed' | 'unable'
  unable_reason TEXT,                      -- 'insufficient_forward_bars' | 'missing_anchor_price' | ...
  outcome TEXT,                            -- 'hit' | 'miss' | 'neutral'
  direction_correct BOOLEAN,
  price_return_pct REAL,                   -- actual price move %
  hit_stop_loss BOOLEAN,
  hit_take_profit BOOLEAN,
  first_hit TEXT,                          -- 'stop' | 'target' | 'neither'
  first_hit_days INTEGER,
  end_price REAL,
  evaluated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  engine_version TEXT NOT NULL DEFAULT 'v1',
  UNIQUE(signal_id, horizon)
);

CREATE INDEX idx_outcomes_signal ON decision_signal_outcomes(signal_id);

-- Optional: user feedback on signals (thumbs up/down)
CREATE TABLE decision_signal_feedback (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  signal_id UUID NOT NULL REFERENCES decision_signals(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  feedback TEXT NOT NULL,                  -- 'useful' | 'not_useful'
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(signal_id, user_id)
);
```

## F1.3 Signal Extraction

```typescript
// packages/ai/src/decision-signals/extractor.ts

interface DecisionSignalPayload {
  symbol: string;
  action: DecisionAction;
  bias: 'bullish' | 'bearish' | 'neutral';
  confidence?: number;
  entryLow?: number;
  entryHigh?: number;
  stopLoss?: number;
  takeProfit?: number;
  horizon: Horizon;
  anchorPrice: number;
  sourceType: 'chat' | 'alert' | 'briefing' | 'manual';
  model?: string;
  analysisMode?: string;
  metadata: Record<string, unknown>;
}

/**
 * Extract a decision signal from a completed AI response.
 * 
 * The AI's response is parsed for:
 * - Explicit action (from the `compute-risk` or `plan` tool outputs)
 * - Entry/stop/target levels (from `compute-risk` tool output)
 * - Confidence (from the response or multi-agent fusion)
 */
export function extractDecisionSignal(
  response: AssistantMessage,
  context: { symbol: string; currentPrice: number; userId: string; threadId: string; messageId: string },
): DecisionSignalPayload | null {
  // 1. Look for compute-risk tool output (has entry/stop/target)
  const riskPart = response.parts.find(p => p.type === 'tool-compute-risk');
  // 2. Look for plan tool output (has action + horizon)
  const planPart = response.parts.find(p => p.type === 'tool-plan');
  // 3. Parse action from text if no structured output
  const action = riskPart?.output?.action ?? planPart?.output?.action ?? parseActionFromText(response.text);

  if (!action || action === 'hold') return null; // Only track directional signals

  return {
    symbol: context.symbol,
    action,
    bias: actionToBias(action),
    confidence: riskPart?.output?.confidence,
    entryLow: riskPart?.output?.entryLow,
    entryHigh: riskPart?.output?.entryHigh,
    stopLoss: riskPart?.output?.stopLoss,
    takeProfit: riskPart?.output?.takeProfit,
    horizon: planPart?.output?.horizon ?? '3d',
    anchorPrice: context.currentPrice,
    sourceType: 'chat',
    model: response.model,
    analysisMode: response.analysisMode,
    metadata: { reasoning: response.text.slice(0, 500) },
  };
}
```

Hook into the chat persistence flow:

```typescript
// packages/ai/src/persistence.ts — after appendAssistantMessage

const signal = extractDecisionSignal(assistantMessage, context);
if (signal) {
  await createDecisionSignal(signal); // Fire-and-forget, don't block response
}
```

## F1.4 Backtest Engine

```typescript
// packages/ai/src/decision-signals/backtest-engine.ts
// Pure logic — DB-agnostic, operates on OHLC bars

interface EvaluationConfig {
  evalWindowDays: number;
  neutralBandPct: number; // default 1.0 for forex (tighter than DSA's 2.0)
  engineVersion: string;
}

interface DailyBar { date: string; high: number; low: number; close: number; }

interface OutcomeResult {
  outcome: 'hit' | 'miss' | 'neutral';
  directionCorrect: boolean;
  priceReturnPct: number;
  hitStopLoss: boolean;
  hitTakeProfit: boolean;
  firstHit: 'stop' | 'target' | 'neither';
  firstHitDays: number | null;
  endPrice: number;
}

export function evaluateSignal(
  signal: DecisionSignal,
  forwardBars: DailyBar[],
  config: EvaluationConfig,
): OutcomeResult | { evalStatus: 'unable'; reason: string } {
  if (forwardBars.length < 1) {
    return { evalStatus: 'unable', reason: 'insufficient_forward_bars' };
  }
  if (!signal.anchorPrice || signal.anchorPrice <= 0) {
    return { evalStatus: 'unable', reason: 'invalid_anchor_price' };
  }

  const isBullish = signal.bias === 'bullish';
  let hitStop = false, hitTarget = false, firstHit: 'stop'|'target'|'neither' = 'neither', firstHitDays = null;

  // Walk forward bars, detect first stop/target hit
  for (let i = 0; i < forwardBars.length; i++) {
    const bar = forwardBars[i];
    if (signal.stopLoss) {
      const stopHit = isBullish ? bar.low <= signal.stopLoss : bar.high >= signal.stopLoss;
      if (stopHit && firstHit === 'neither') { hitStop = true; firstHit = 'stop'; firstHitDays = i + 1; }
    }
    if (signal.takeProfit) {
      const targetHit = isBullish ? bar.high >= signal.takeProfit : bar.low <= signal.takeProfit;
      if (targetHit && firstHit === 'neither') { hitTarget = true; firstHit = 'target'; firstHitDays = i + 1; }
    }
    if (firstHit !== 'neither') break;
  }

  const endPrice = forwardBars[forwardBars.length - 1].close;
  const priceReturnPct = ((endPrice - signal.anchorPrice) / signal.anchorPrice) * 100;
  const directionCorrect = isBullish ? priceReturnPct > 0 : priceReturnPct < 0;

  // Outcome logic:
  // hit = direction correct AND moved beyond neutral band (or hit target)
  // miss = direction wrong (or hit stop)
  // neutral = within neutral band
  let outcome: 'hit' | 'miss' | 'neutral';
  if (hitTarget) outcome = 'hit';
  else if (hitStop) outcome = 'miss';
  else if (Math.abs(priceReturnPct) < config.neutralBandPct) outcome = 'neutral';
  else outcome = directionCorrect ? 'hit' : 'miss';

  return { outcome, directionCorrect, priceReturnPct, hitStopLoss: hitStop, hitTakeProfit: hitTarget, firstHit, firstHitDays, endPrice };
}
```

## F1.5 Outcome Evaluation Cron

```typescript
// apps/web/src/app/api/cron/evaluate-signals/route.ts

export const runtime = 'nodejs';
export const maxDuration = 60;

export async function GET(req: Request): Promise<Response> {
  return withCronAuth(req, async () => {
    const db = getDb();
    // Find active signals past their horizon that lack an outcome for that horizon
    const candidates = await listSignalsNeedingEvaluation();

    let evaluated = 0, unable = 0;
    for (const signal of candidates) {
      for (const horizon of HORIZONS_TO_EVAL) {
        const days = HORIZON_DAYS[horizon];
        // Fetch forward bars from anchor_at + 1 to anchor_at + days
        const forwardBars = await getCandlesAfter(signal.symbol, signal.anchorAt, days);
        const result = evaluateSignal(signal, forwardBars, EVAL_CONFIG);
        if ('evalStatus' in result) { unable++; await recordUnable(signal.id, horizon, result.reason); }
        else { evaluated++; await recordOutcome(signal.id, horizon, result); }
      }
      // Mark signal as closed once longest horizon is evaluated
      await maybeCloseSignal(signal.id);
    }
    return { processed: candidates.length, note: `evaluated=${evaluated} unable=${unable}` };
  });
}
```

Add to `vercel.json` crons:
```json
{ "path": "/api/cron/evaluate-signals", "schedule": "0 1 * * *" }
```

## F1.6 Stats & Track Record API

```typescript
// apps/web/src/app/api/decision-signals/stats/route.ts

interface SignalStats {
  total: number;
  evaluated: number;
  hitRate: number;          // hits / (hits + misses)
  avgReturnPct: number;
  byModel: { model: string; hitRate: number; count: number }[];
  byHorizon: { horizon: string; hitRate: number; count: number }[];
  byAction: { action: string; hitRate: number; count: number }[];
  recentSignals: DecisionSignal[];
}
```

## F1.7 Settings UI — AI Track Record

New settings sub-page `/settings/track-record`:

```
┌────────────────────────────────────────────────┐
│ AI Track Record                                 │
│                                                 │
│ ┌─────────┐ ┌─────────┐ ┌─────────┐ ┌────────┐ │
│ │ Hit Rate│ │ Signals │ │Avg Ret. │ │ Best   │ │
│ │  62.3%  │ │   147   │ │ +1.8%   │ │ Model  │ │
│ └─────────┘ └─────────┘ └─────────┘ └────────┘ │
│                                                 │
│ Accuracy by Model                               │
│  Claude Sonnet    68% ████████████░░  (52)      │
│  GPT-4o           61% ██████████░░░░  (45)      │
│  Gemini Pro       58% █████████░░░░░  (50)      │
│                                                 │
│ Accuracy by Horizon                             │
│  1d   71% | 3d  64% | 5d  59% | 10d  52%        │
│                                                 │
│ Recent Signals                                  │
│  XAUUSD  BUY   +2.3% ✓ hit   (3d, Claude)       │
│  EURUSD  SELL  -0.8% ✗ miss  (1d, GPT-4o)       │
│  XAUUSD  BUY   +0.1% ○ neutral (5d, Gemini)     │
└────────────────────────────────────────────────┘
```

## F1.8 F1 Implementation Phases

**Phase 1A — Schema & Extraction (Week 1)**
- DB migration: 3 tables (signals, outcomes, feedback)
- Drizzle schema + repository functions
- Signal extractor from AI responses
- Hook into chat persistence (fire-and-forget)

**Phase 1B — Backtest Engine (Week 2)**
- Pure backtest engine with hit/miss/neutral logic
- Forex-specific neutral band (1.0% vs DSA's 2.0%)
- Unit tests (stop/target detection, direction, edge cases)
- `getCandlesAfter()` helper for forward bars

**Phase 1C — Evaluation Cron (Week 3)**
- `cron/evaluate-signals` route with idempotency
- Outcome recording, unable-reason handling
- Signal lifecycle (active → closed)
- Cron job tests

**Phase 1D — Stats & UI (Week 4)**
- Stats API (by model, horizon, action)
- `/settings/track-record` page
- Per-signal feedback (thumbs up/down)
- E2E test

---

# F2: Portfolio Management

> Track forex/XAU positions with lot sizes, entry/stop/target, P&L, and risk analysis. Complements the existing journal.

## F2.1 Overview

DSA has a full portfolio system (accounts, positions, FIFO/avg cost, trades, corporate actions). For HamaFX-Ai's forex domain, we adapt this to:
- **Positions**: symbol, direction (long/short), lot size, entry price, stop, target
- **P&L**: real-time unrealized P&L based on current price
- **Risk**: concentration, total exposure, margin usage, correlation risk

### DSA Reference
- `src/services/portfolio_service.py` — accounts, positions, trades, snapshot replay
- `src/services/portfolio_risk_service.py` — concentration, drawdown, stop-loss proximity

## F2.2 Database Schema

```sql
CREATE TABLE portfolio_positions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  symbol TEXT NOT NULL,
  direction TEXT NOT NULL,           -- 'long' | 'short'
  lot_size REAL NOT NULL,            -- in standard lots (1.0 = 100k units)
  entry_price REAL NOT NULL,
  stop_loss REAL,
  take_profit REAL,
  opened_at TIMESTAMPTZ NOT NULL,
  closed_at TIMESTAMPTZ,
  close_price REAL,
  status TEXT NOT NULL DEFAULT 'open', -- 'open' | 'closed'
  notes TEXT,
  linked_signal_id UUID REFERENCES decision_signals(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_positions_user_status ON portfolio_positions(user_id, status);

CREATE TABLE portfolio_settings (
  user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  account_balance REAL,              -- for risk % calculations
  base_currency TEXT DEFAULT 'USD',
  max_risk_per_trade_pct REAL DEFAULT 2.0,
  max_total_exposure_pct REAL DEFAULT 10.0,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

## F2.3 Position Service

```typescript
// packages/ai/src/portfolio/position-service.ts

interface PositionWithPnL extends Position {
  currentPrice: number;
  unrealizedPnlUsd: number;
  unrealizedPnlPct: number;
  riskUsd: number;           // distance to stop × lot size
  rewardUsd: number;         // distance to target × lot size
  riskRewardRatio: number;
  distanceToStopPct: number; // how close to stop
  stale: boolean;            // price data stale?
}

async function getOpenPositionsWithPnL(userId: string): Promise<PositionWithPnL[]> {
  const positions = await listOpenPositions(userId);
  const symbols = [...new Set(positions.map(p => p.symbol))];
  const prices = await getPrices(symbols); // batch fetch
  return positions.map(p => computePnL(p, prices[p.symbol]));
}

function computePnL(position: Position, price: Tick): PositionWithPnL {
  const pipValue = getPipValue(position.symbol, position.lotSize);
  const priceDiff = position.direction === 'long'
    ? price.mid - position.entryPrice
    : position.entryPrice - price.mid;
  const unrealizedPnlUsd = priceDiff * getContractSize(position.symbol) * position.lotSize;
  // ... risk/reward calculations
}
```

## F2.4 Risk Analysis

```typescript
// packages/ai/src/portfolio/risk-service.ts

interface PortfolioRiskReport {
  totalExposureUsd: number;
  totalExposurePct: number;       // vs account balance
  totalRiskUsd: number;           // sum of all stops
  totalRiskPct: number;
  concentration: { symbol: string; pct: number; alert: boolean }[];
  correlationRisk: { pair: string; correlation: number; alert: boolean }[];
  positionsNearStop: { symbol: string; distancePct: number }[];
  alerts: RiskAlert[];
}

// Concentration alert: any single symbol > 35% of exposure
// Correlation alert: two positions with |correlation| > 0.7 in same direction
// Stop proximity alert: position within 20% of stop distance
```

## F2.5 Settings UI — Portfolio

New settings sub-page `/settings/portfolio`:
- Open positions table (symbol, direction, size, entry, current, P&L, R:R)
- Add position form (or import from a closed chat signal)
- Risk dashboard (total exposure, concentration bars, alerts)
- Account settings (balance, max risk per trade)

## F2.6 Chat Integration

New AI tool: `get-portfolio-snapshot` — lets the AI see the user's open positions when giving advice:
```
"You're already long 2 lots of XAUUSD from 2650. Adding here at 2680 
would increase your gold exposure to 60% of your account, exceeding 
your 35% concentration limit. Consider sizing down."
```

## F2.7 F2 Implementation Phases

**Phase 2A — Schema & CRUD (Week 1)**: positions table, position-service, settings table
**Phase 2B — P&L Engine (Week 1-2)**: pip value calc, contract sizes, unrealized P&L, R:R
**Phase 2C — Risk Analysis (Week 2)**: concentration, correlation, stop proximity, alerts
**Phase 2D — UI & Chat Tool (Week 3)**: portfolio settings page, `get-portfolio-snapshot` tool

---

# F3: Social Sentiment Integration

> Fetch social media sentiment (Reddit, X, etc.) to enrich AI analysis. DSA uses api.adanos.org for US stocks; we adapt for forex/gold sentiment.

## F3.1 Overview

### DSA Reference
- `src/services/social_sentiment_service.py` — fetches Reddit/X/Polymarket sentiment with tenacity retries

### Adaptation for Forex

Forex sentiment sources differ from stocks. Options:
1. **Retail positioning data** (e.g., broker COT-style retail long/short ratios) — most valuable for forex
2. **News sentiment aggregation** (already have news; add sentiment scoring)
3. **Social APIs** (Reddit r/Forex, r/Gold, X cashtags) — if an API is available

## F3.2 Architecture

```typescript
// packages/ai/src/sentiment/social-sentiment-service.ts

interface SocialSentiment {
  symbol: string;
  source: 'reddit' | 'twitter' | 'retail_positioning' | 'news';
  sentiment: 'very_bullish' | 'bullish' | 'neutral' | 'bearish' | 'very_bearish';
  score: number;              // -1.0 to 1.0
  retailLongPct?: number;     // % of retail traders long (contrarian indicator)
  sampleSize: number;
  fetchedAt: number;
  available: boolean;
}

class SocialSentimentService {
  constructor(private apiKey: string, private apiUrl: string) {}

  get isAvailable(): boolean { return Boolean(this.apiKey); }

  // Retry with exponential backoff (like DSA's tenacity)
  async getSentiment(symbol: string): Promise<SocialSentiment | null> {
    if (!this.isAvailable) return null;
    return withRetry(() => this.fetch(symbol), { maxRetries: 2, backoffMs: 1000 });
  }
}
```

## F3.3 Integration Points

1. **Sentiment Agent** (from multi-agent plan) consumes this service
2. **News sentiment scoring**: add a sentiment score to existing news articles
3. **Contrarian signals**: when retail positioning is extreme (>75% long), flag as contrarian bearish

## F3.4 Configuration

```bash
# .env additions
SOCIAL_SENTIMENT_API_KEY=    # Optional
SOCIAL_SENTIMENT_API_URL=    # Optional
```

Add to API keys settings page as an optional provider.

## F3.5 F3 Implementation Phases

**Phase 3A — Service & Retry (Week 1)**: sentiment service, retry logic, env config
**Phase 3B — Integration (Week 1)**: wire into Sentiment Agent + news scoring, settings UI

---

# F4: Notification Noise Control

> Dedup, cooldown, quiet hours, and severity filtering to prevent notification fatigue as HamaFX adds more alert types.

## F4.1 Overview

### DSA Reference
- `src/notification_noise.py` — process-local dedup/cooldown/quiet-hours with severity ranking
- `src/notification_routing.py` — route notifications to specific channels by type

### Current HamaFX State

HamaFX has email/Telegram/push but no noise control. As it adds price alerts, briefings, usage alerts, signal outcomes — users will get spammed.

## F4.2 Architecture

```typescript
// packages/ai/src/notifications/noise-control.ts

type Severity = 'info' | 'warning' | 'error' | 'critical';
type RouteType = 'report' | 'alert' | 'system_error' | 'signal_outcome';

interface NoiseDecision {
  shouldSend: boolean;
  reasonCode: 'allowed' | 'duplicate' | 'cooldown' | 'quiet_hours' | 'below_min_severity';
  message: string;
  dedupKey?: string;
  cooldownKey?: string;
}

interface NoiseConfig {
  dedupTtlSeconds: number;        // suppress identical notifications within window
  cooldownSeconds: number;        // per-channel cooldown
  quietHours?: { start: string; end: string }; // "22:00-07:00"
  timezone: string;
  minSeverity: Severity;          // only send >= this severity
  minSeverityDuringQuietHours: Severity; // stricter during quiet hours
}

function evaluateNoise(
  content: string,
  routeType: RouteType,
  severity: Severity,
  config: NoiseConfig,
  state: NoiseState,
): NoiseDecision {
  // 1. Dedup: hash content, check if seen within dedupTtl
  const dedupKey = hashContent(content, routeType);
  if (state.hasSeen(dedupKey, config.dedupTtlSeconds)) {
    return { shouldSend: false, reasonCode: 'duplicate', message: 'Duplicate suppressed', dedupKey };
  }

  // 2. Quiet hours check
  if (isQuietHours(config.quietHours, config.timezone)) {
    if (severityRank(severity) < severityRank(config.minSeverityDuringQuietHours)) {
      return { shouldSend: false, reasonCode: 'quiet_hours', message: 'Suppressed during quiet hours' };
    }
  }

  // 3. Min severity
  if (severityRank(severity) < severityRank(config.minSeverity)) {
    return { shouldSend: false, reasonCode: 'below_min_severity', message: 'Below min severity' };
  }

  // 4. Cooldown per channel+route
  const cooldownKey = `${routeType}`;
  if (state.inCooldown(cooldownKey, config.cooldownSeconds)) {
    return { shouldSend: false, reasonCode: 'cooldown', message: 'In cooldown' };
  }

  return { shouldSend: true, reasonCode: 'allowed', message: 'Allowed', dedupKey, cooldownKey };
}
```

## F4.3 State Storage

DSA uses process-local state (in-memory). For HamaFX's multi-instance Vercel/Docker deployment, use the DB (or Redis if added per the Performance plan):

```sql
CREATE TABLE notification_noise_state (
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  dedup_key TEXT NOT NULL,
  route_type TEXT NOT NULL,
  last_sent_at TIMESTAMPTZ NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  PRIMARY KEY (user_id, dedup_key)
);
CREATE INDEX idx_noise_expires ON notification_noise_state(expires_at);
```

## F4.4 Notification Routing

```typescript
// Route different notification types to different channels
interface RouteConfig {
  report: Channel[];        // e.g. ['email', 'telegram']
  alert: Channel[];         // e.g. ['telegram', 'push']
  signal_outcome: Channel[];// e.g. ['push']
  system_error: Channel[];  // e.g. ['email']
}
```

## F4.5 Settings UI

Add to `/settings` notifications card:
- Quiet hours toggle + time range picker
- Min severity selector (per channel)
- Cooldown duration
- Per-route channel routing (which channels get which notification types)
- "Daily digest mode" toggle (batch non-critical notifications)

## F4.6 F4 Implementation Phases

**Phase 4A — Noise Engine (Week 1)**: dedup, cooldown, quiet hours, severity logic + tests
**Phase 4B — State & Routing (Week 1-2)**: DB state storage, route config
**Phase 4C — Settings UI (Week 2)**: quiet hours, severity, routing UI

---

# F5: Run Diagnostics with Secret Redaction

> Per-run diagnostic context that captures the flow of an AI analysis with automatic secret/API-key redaction in logs. Critical for debugging production issues safely.

## F5.1 Overview

### DSA Reference
- `src/services/run_diagnostics.py` — `RunDiagnosticContext` with comprehensive secret-redaction regex

### Why

HamaFX uses `console.error` + some Sentry, but has no structured per-run diagnostic trace. When a chat turn fails in production, there's no easy way to see what data was fetched, which tools ran, and where it broke — WITHOUT leaking API keys into logs.

## F5.2 Architecture

```typescript
// packages/ai/src/diagnostics/run-context.ts

interface RunDiagnosticContext {
  traceId: string;
  userId: string;
  threadId: string;
  startedAt: number;
  steps: DiagnosticStep[];
  errors: DiagnosticError[];
}

interface DiagnosticStep {
  name: string;              // 'fetch_candles' | 'run_technical_agent' | ...
  status: 'started' | 'completed' | 'failed';
  durationMs?: number;
  metadata?: Record<string, unknown>; // auto-redacted
}

// AsyncLocalStorage for context propagation (Node.js equivalent of Python ContextVar)
const diagnosticStore = new AsyncLocalStorage<RunDiagnosticContext>();

export function withDiagnostics<T>(userId: string, threadId: string, fn: () => Promise<T>): Promise<T> {
  const ctx: RunDiagnosticContext = { traceId: crypto.randomUUID(), userId, threadId, startedAt: Date.now(), steps: [], errors: [] };
  return diagnosticStore.run(ctx, fn);
}

export function recordStep(name: string, metadata?: Record<string, unknown>) {
  const ctx = diagnosticStore.getStore();
  if (ctx) ctx.steps.push({ name, status: 'started', metadata: redactSecrets(metadata) });
}
```

## F5.3 Secret Redaction (ported from DSA)

```typescript
// packages/ai/src/diagnostics/redact.ts

const REDACTION_PATTERNS: Array<[RegExp, string | ((m: RegExpMatchArray) => string)]> = [
  // Authorization headers
  [/(?:authorization)\s*[:=]\s*(?:(?:Bearer|Basic|Token)\s+)?[^\s,&;]+/gi, 'authorization=<redacted>'],
  // URLs with credentials: https://user:pass@host
  [/(https?:\/\/)([^/\s:@]+):([^@\s/]+)@/g, '$1<redacted>:<redacted>@'],
  // URLs with token/key/secret/webhook params
  [/https?:\/\/[^\s]+?(?:token|key|secret|webhook)[^\s]*/gi, '<redacted-url>'],
  // key: "value" patterns
  [/(["']?)([A-Z0-9_]*?(?:api[_-]?key|access[_-]?token|token|secret|password|cookie))\1\s*:\s*(["'])([^"']+)\3/gi,
    (m) => `${m[1]}${m[2]}${m[1]}: ${m[3]}<redacted>${m[3]}`],
  // key=value patterns
  [/\b([A-Z0-9_]*?(?:api[_-]?key|access[_-]?token|token|secret|password|cookie))\s*=\s*[^\s,&;]+/gi,
    (m) => `${m[1]}=<redacted>`],
  // Bearer tokens
  [/\bBearer\s+[A-Za-z0-9._~+/=-]+/gi, 'Bearer <redacted>'],
];

export function redactSecrets(value: unknown): unknown {
  if (typeof value === 'string') {
    let result = value;
    for (const [pattern, replacement] of REDACTION_PATTERNS) {
      result = result.replace(pattern, replacement as any);
    }
    return result;
  }
  if (Array.isArray(value)) return value.map(redactSecrets);
  if (value && typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value)) {
      // Redact sensitive keys entirely
      if (/api[_-]?key|token|secret|password|cookie|webhook/i.test(k)) {
        out[k] = '<redacted>';
      } else {
        out[k] = redactSecrets(v);
      }
    }
    return out;
  }
  return value;
}
```

## F5.4 Integration

1. Wrap the chat handler: `withDiagnostics(userId, threadId, () => runChat(...))`
2. Record steps at key points: context fetch, each tool call, each agent run, persistence
3. On error, attach the diagnostic context to Sentry (with redaction)
4. Optionally expose a `get-system-diagnostics` view in settings (admin/debug)

## F5.5 F5 Implementation Phases

**Phase 5A — Redaction (Week 1)**: redaction patterns + comprehensive tests (this is security-critical, test thoroughly)
**Phase 5B — Context (Week 1-2)**: AsyncLocalStorage context, step recording, Sentry integration

---

# F6: Market Phase Detection

> Detect forex session phase (Asian/London/NY/overlap) and use it to modulate AI behavior and signal TTLs.

## F6.1 Overview

### DSA Reference
- `src/core/trading_calendar.py` — `MarketPhase` enum (premarket, intraday, lunch_break, closing_auction)
- `src/market_phase_prompt.py` — injects market phase context into prompts

### Forex Adaptation

Forex trades 24/5 across sessions. Phases for HamaFX:
- **Sydney** (22:00-07:00 UTC)
- **Tokyo/Asian** (00:00-09:00 UTC)
- **London** (08:00-17:00 UTC)
- **New York** (13:00-22:00 UTC)
- **London/NY Overlap** (13:00-17:00 UTC) — highest liquidity
- **Weekend** (Fri 22:00 - Sun 22:00 UTC) — market closed

## F6.2 Architecture

```typescript
// packages/shared/src/market-phase.ts

type ForexSession = 'sydney' | 'tokyo' | 'london' | 'newyork' | 'london_ny_overlap' | 'closed';

interface MarketPhaseContext {
  session: ForexSession;
  liquidity: 'high' | 'medium' | 'low';
  isOpen: boolean;
  nextSessionChange: { session: ForexSession; inMinutes: number };
  goldSpecific?: { comexOpen: boolean }; // for XAUUSD
}

export function getMarketPhase(now: Date = new Date()): MarketPhaseContext {
  const utcHour = now.getUTCHours();
  const utcDay = now.getUTCDay();

  // Weekend check
  if (isForexWeekend(now)) {
    return { session: 'closed', liquidity: 'low', isOpen: false, ... };
  }

  // Overlap = highest liquidity
  if (utcHour >= 13 && utcHour < 17) {
    return { session: 'london_ny_overlap', liquidity: 'high', isOpen: true, ... };
  }
  // ... other sessions
}
```

## F6.3 Integration Points

1. **Prompt injection**: add session context to AI system prompt
   ```
   "Current session: London/NY Overlap (high liquidity). 
   This is the most active period for XAUUSD — moves are more reliable."
   ```
2. **Signal TTL**: intraday signals during low-liquidity sessions get shorter TTLs
3. **Risk Agent**: flag low-liquidity sessions as higher risk for breakouts
4. **Settings display**: show current session in system status card

## F6.4 F6 Implementation Phases

**Phase 6A — Phase Logic (Week 1)**: session detection, liquidity mapping, weekend handling + tests
**Phase 6B — Integration (Week 1)**: prompt injection, signal TTL, system status display

---

# F7: Bot Platform with Commands

> Interactive Telegram bot with slash commands (/analyze, /ask, /price, /status), expanding HamaFX's existing Telegram webhook into a command-based interface.

## F7.1 Overview

### DSA Reference
- `bot/dispatcher.py` — command dispatcher
- `bot/commands/` — analyze, ask, chat, market, research, status, strategies, help
- `bot/platforms/` — Telegram, Discord, Feishu, DingTalk adapters

### Current HamaFX State

HamaFX has `/api/telegram/webhook` but it's a passive webhook. This feature adds structured command parsing and responses.

## F7.2 Command Set (Forex-adapted)

| Command | Description | Example |
|---|---|---|
| `/price <symbol>` | Current price | `/price XAUUSD` |
| `/analyze <symbol>` | Full AI analysis | `/analyze EURUSD` |
| `/ask <question>` | Free-form question | `/ask is gold bullish?` |
| `/chart <symbol>` | Chart snapshot image | `/chart XAUUSD` |
| `/alert <symbol> <condition>` | Create price alert | `/alert XAUUSD > 2700` |
| `/positions` | Show open positions | `/positions` |
| `/track` | AI track record stats | `/track` |
| `/status` | System status | `/status` |
| `/help` | Command list | `/help` |

## F7.3 Architecture

```typescript
// packages/ai/src/bot/dispatcher.ts

interface BotCommand {
  name: string;
  aliases: string[];
  description: string;
  handler: (args: string[], ctx: BotContext) => Promise<BotResponse>;
}

interface BotContext {
  userId: string;       // resolved from Telegram chat ID → HamaFX user
  chatId: string;
  platform: 'telegram'; // extensible to discord/slack later
}

class BotDispatcher {
  private commands = new Map<string, BotCommand>();

  register(cmd: BotCommand) {
    this.commands.set(cmd.name, cmd);
    cmd.aliases.forEach(a => this.commands.set(a, cmd));
  }

  async dispatch(text: string, ctx: BotContext): Promise<BotResponse> {
    const { command, args } = parseCommand(text); // "/analyze XAUUSD" → { command: 'analyze', args: ['XAUUSD'] }
    const handler = this.commands.get(command);
    if (!handler) return this.commands.get('help')!.handler([], ctx);
    return handler.handler(args, ctx);
  }
}
```

## F7.4 User Linking

Telegram chat ID must map to a HamaFX user. Flow:
1. User goes to `/settings` → "Link Telegram" → gets a code
2. User sends `/link <code>` to the bot
3. Bot stores `telegram_chat_id → user_id` mapping

```sql
CREATE TABLE bot_links (
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  platform TEXT NOT NULL,         -- 'telegram'
  chat_id TEXT NOT NULL,
  linked_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (platform, chat_id)
);
```

## F7.5 Integration with Existing Webhook

Modify `apps/web/src/app/api/telegram/webhook/route.ts`:
```typescript
export async function POST(req: Request) {
  // ... existing secret token validation ...
  const update = await req.json();
  const text = update.message?.text;

  if (text?.startsWith('/')) {
    const ctx = await resolveBotContext(update.message.chat.id);
    if (!ctx.userId) return sendLinkPrompt(ctx.chatId);
    const response = await dispatcher.dispatch(text, ctx);
    return sendTelegramResponse(ctx.chatId, response);
  }
  // ... existing free-form handling
}
```

## F7.6 Security & Rate Limiting

- Each command checks the linked user's auth + rate limit (reuse `withRateLimit`)
- Commands that cost money (`/analyze`, `/ask`) check the budget guardrail
- `/link` codes expire after 10 minutes

## F7.7 F7 Implementation Phases

**Phase 7A — Dispatcher & Linking (Week 1)**: command parser, dispatcher, user linking flow, bot_links table
**Phase 7B — Core Commands (Week 1-2)**: /price, /analyze, /ask, /status, /help
**Phase 7C — Advanced Commands (Week 2)**: /chart (image), /alert, /positions, /track
**Phase 7D — Settings & Polish (Week 2)**: link UI in settings, rate limiting, budget checks, tests

---

# Consolidated Roadmap

## Recommended Implementation Order

The features have dependencies and varying impact. Recommended order:

### Quarter 1 — Foundation & Trust
1. **F5: Run Diagnostics** (Week 1-2) — do FIRST; helps debug everything else
2. **F1: Decision Signal Tracking** (Week 3-6) — highest user value, builds trust
3. **F6: Market Phase Detection** (Week 7) — small, enriches F1 signals and multi-agent

### Quarter 2 — Engagement & Risk
4. **F4: Notification Noise Control** (Week 8-9) — needed before adding more alerts
5. **F2: Portfolio Management** (Week 10-13) — complements F1 signals
6. **F3: Social Sentiment** (Week 14) — feeds multi-agent Sentiment Agent

### Quarter 3 — Reach
7. **F7: Bot Platform** (Week 15-17) — expands access, depends on F1/F2 for /track, /positions

## Dependency Graph

```
F5 (Diagnostics) ──────────────► (helps debug all others)
F6 (Market Phase) ──┬──────────► F1 (signal TTLs)
                    └──────────► Multi-Agent (Risk Agent context)
F1 (Signals) ───────┬──────────► F2 (link positions to signals)
                    └──────────► F7 (/track command)
F2 (Portfolio) ─────────────────► F7 (/positions command)
F3 (Sentiment) ─────────────────► Multi-Agent (Sentiment Agent)
F4 (Noise Control) ─────────────► F1 (signal outcome notifications)
```

## Summary Statistics

| Feature | Tables Added | New Cron Jobs | New API Routes | New Settings Pages | Effort |
|---|---|---|---|---|---|
| F1 Decision Signals | 3 | 1 | 3 | 1 | ~80h |
| F2 Portfolio | 2 | 0 | 4 | 1 | ~70h |
| F3 Social Sentiment | 0 | 0 | 1 | 0 (extends API keys) | ~25h |
| F4 Noise Control | 1 | 0 | 0 | 0 (extends notifications) | ~30h |
| F5 Diagnostics | 0 | 0 | 1 | 0 | ~25h |
| F6 Market Phase | 0 | 0 | 0 | 0 (extends status) | ~20h |
| F7 Bot Commands | 1 | 0 | 0 (extends webhook) | 1 | ~40h |
| **Total** | **7** | **1** | **12** | **4** | **~290h** |

## Cross-References

- **MULTI_AGENT_SYSTEM_PLAN.md** — F3 (Sentiment) feeds the Sentiment Agent; F6 (Market Phase) feeds the Risk Agent; F1 (Signals) records `analysis_mode` from multi-agent
- **SETTINGS_ANALYSIS_PLAN.md** — F1, F2, F7 add new settings pages; F4 extends the notifications card
- **PERFORMANCE_STABILITY_PLAN.md** — F4 noise control benefits from Redis (architecture rec); F5 diagnostics complements OBS-01 (Sentry); F1 cron follows STAB-01 (idempotency)

---

*End of document.*