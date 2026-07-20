/**
 * Copyright 2026 HamaFX
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

// P2-1 — Externalized routing keyword patterns.
//
// Previously these were hardcoded in routing.ts. Moving them to a
// separate config file makes the keyword corpus auditable, tunable,
// and potentially loadable from a database or JSON file in the future
// without modifying domain logic (OCP).
//
// Each pattern has a regex and a weight. Higher-weight patterns are
// stronger signals for classification. The scoring algorithm in
// routing.ts stays unchanged — it iterates these arrays and sums weights.

export interface RoutingKeywordPattern {
  re: RegExp;
  weight: number;
}

/** Macro / event / "why" reasoning patterns. */
export const FUNDAMENTAL_PATTERNS: RoutingKeywordPattern[] = [
  { re: /\b(why|because|driver|reason|cause|implication|catalyst|going\s+up|going\s+down|rally|sell-?off|behind\s+the|what's\s+driving|what\s+is\s+driving)\b/, weight: 2 },
  { re: /\b(fundamental|macro|policy|monetary|hawkish|dovish|stagflation|balance\s+sheet|quantitative|tightening|easing)\b/, weight: 3 },
  { re: /\b(fed|fomc|powell|ecb|lagarde|boe|bailey|boj|rba|rbnz|cpi|nfp|pce|gdp|ppi|pmi|jobs|jobless|claims|unemployment|retail\s+sales)\b/, weight: 3 },
  { re: /\b(real yield|yields|10y|treasury|treasuries|dxy|dollar index|usdx|bond|bonds|spread|spreads)\b/, weight: 2 },
  { re: /\b(geopolit|war|tariff|sanction|risk-?on|risk-?off|safe\s*haven|flight\s*to)\b/, weight: 2 },
  { re: /\b(scenario|outlook|forecast|expect|positioning|sentiment|bullish|bearish)\b/, weight: 1 },
  { re: /\b(committee|review my trade|rate my setup|should i take|trade idea|worried\s+about|concerned\s+about)\b/, weight: 3 },
];

/** Chart / indicator / structure patterns. */
export const TECHNICAL_PATTERNS: RoutingKeywordPattern[] = [
  { re: /\b(chart|candle|candles|bar|bars|wick|body|pattern|patterns|formation|flag|wedge|triangle|double\s*(top|bottom)|head\s*and\s*shoulders)\b/, weight: 1 },
  { re: /\b(rsi|macd|ema|sma|bollinger|atr|stoch|stochastic|adx|ichimoku|pivot|pivots|fibonacci|fib|retracement|volume|vol|vwap)\b/, weight: 3 },
  { re: /\b(bos|choch|fvg|fair value gap|order block|order\s*flow|liquidity|sweep|smc|ict|imbalance|mitigation)\b/, weight: 3 },
  { re: /\b(timeframe|tf|1m|5m|15m|30m|1h|4h|1d|1w|daily|weekly|hourly|intraday|swing)\b/, weight: 1 },
  { re: /\b(support|resistance|breakout|rejection|trend|reversal|range|consolidation|channel|pullback|retest)\b/, weight: 2 },
  { re: /\b(top-?down|bias|setup|invalidation|stop|entry|target|risk\s*reward|r\s*:?s*r)\b/, weight: 2 },
  { re: /\b(price|level|levels|key level|cable|fibre|gold|xau|eur|gbp|dollar)\b/, weight: 1 },
];

/** Summary / recap / listing patterns. */
export const SUMMARY_PATTERNS: RoutingKeywordPattern[] = [
  { re: /\b(summari[sz]e|recap|brief|overview|tldr)\b/, weight: 3 },
  { re: /\b(news|headline|headlines|article|articles|story|stories)\b/, weight: 2 },
  { re: /\b(calendar|event|events|schedule|upcoming|today|tomorrow|this week)\b/, weight: 2 },
  { re: /\b(journal|trade|trades|win rate|r-?multiple|stats)\b/, weight: 2 },
  { re: /\b(list|show me|what(?:'s| is) (?:on|happening))\b/, weight: 1 },
];
