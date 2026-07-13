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

// Domain-based turn classification.
//
// Each chat turn is classified into one of:
//   - fundamental — macro / news / events / "why" reasoning
//   - technical   — chart structure / indicators / levels
//   - summary     — news/calendar/journal recap, "list X"
//   - vision      — image attached this turn
//   - generic     — everything else
//
// The domain drives TWO downstream decisions:
//   1. Whether a plan-then-act pre-step runs (fundamental + technical only).
//   2. Which model tier to use (resolved in resolveChatModel via the
//      domain param — fundamental→pro, technical→fast, summary→cheapest).
//
// Classification is rule-based — fast, deterministic, easy to test, and
// auditable in telemetry. It runs on the LATEST user message only; prior
// turns are not re-classified.
//
// Routing decisions live in chat_telemetry via the `kind` discriminator
// so /settings/usage can break down spend per domain.

import type { UIMessage } from 'ai';
import type { ResolveModelEnv } from './model';
import { classifyTurnLLM } from './semantic-routing';

export type RoutingDomain =
  | 'fundamental'
  | 'technical'
  | 'summary'
  | 'vision'
  | 'generic';

export interface RoutingDecision {
  domain: RoutingDomain;
  /**
   * True for domains that benefit from a visible plan-then-act step.
   * Currently fundamental + technical; summary/vision/generic skip the plan.
   */
  planRequired: boolean;
  /** Human-readable rationale captured for telemetry / debugging. */
  rationale: string;
}

/**
 * Classify this turn by domain. `userMessage` is the message just
 * appended; we only inspect its text + image parts.
 *
 * Model tier selection is handled downstream by `resolveChatModel`
 * (in model.ts) which maps the domain to the provider's defaultModels
 * tier. This function only decides the domain + planRequired flag.
 */
export interface RouteTurnOptions {
  userMessage: UIMessage;
  modelOverride?: string | null;
  /** U3 — semantic routing config. Omit to skip AI classification. */
  semanticRouting?: {
    /** The summary-tier model id to use for classification. */
    modelId: string;
    /** AI env subset for model resolution. */
    env: ResolveModelEnv;
    signal?: AbortSignal | null;
  };
}

export async function routeTurn(args: { userMessage: UIMessage; modelOverride?: string | null }): Promise<RoutingDecision>;
export async function routeTurn(args: RouteTurnOptions): Promise<RoutingDecision>;
export async function routeTurn(args: RouteTurnOptions): Promise<RoutingDecision> {
  const { userMessage, modelOverride } = args;

  if (modelOverride && modelOverride.length > 0) {
    return {
      domain: 'generic',
      planRequired: false,
      rationale: `explicit override: ${modelOverride}`,
    };
  }

  const rawText = extractText(userMessage);
  const text = rawText.toLowerCase();
  const hasImage = hasImagePart(userMessage);

  // U3 — Semantic routing: try AI classification before keyword scoring.
  // Feature-gated: only runs when semanticRouting config is provided.
  if (args.semanticRouting && rawText.length >= 10) {
    const startMs = Date.now();
    try {
      const result = await classifyTurnLLM(
        rawText,
        args.semanticRouting.modelId,
        args.semanticRouting.env,
        args.semanticRouting.signal,
      );
      if (result) {
        const domain = result.domain === 'vision' ? 'generic' as const : result.domain;
        return {
          domain,
          planRequired: domain === 'fundamental' || domain === 'technical',
          rationale: `semantic: ${result.rationale} (confidence=${result.confidence.toFixed(2)}, ${Date.now() - startMs}ms)`,
        };
      }
      // Fall through to keyword scoring on low confidence or failure.
    } catch {
      // Fall through to keyword scoring.
    }
  }

  if (hasImage) {
    return {
      domain: 'vision',
      planRequired: false,
      rationale: 'image attached → vision model',
    };
  }

  // Empty / very short messages — no signal, use the default.
  if (text.length < 4) {
    return {
      domain: 'generic',
      planRequired: false,
      rationale: 'too short to classify',
    };
  }

  // ----- keyword scoring -----
  // We score against three buckets of patterns. The bucket with the highest
  // score wins; ties resolve by priority (fundamental > technical > summary)
  // because depth matters more than speed when the user asked a "why"
  // question that's also a "what's the news" question.

  const fundamentalScore = scoreFundamental(text);
  const technicalScore = scoreTechnical(text);
  const summaryScore = scoreSummary(text);

  const max = Math.max(fundamentalScore, technicalScore, summaryScore);

  if (max === 0) {
    return {
      domain: 'generic',
      planRequired: false,
      rationale: 'no domain keywords matched',
    };
  }

  if (fundamentalScore === max) {
    return {
      domain: 'fundamental',
      planRequired: true,
      rationale: `fundamental keywords (score ${fundamentalScore})`,
    };
  }
  if (technicalScore === max) {
    return {
      domain: 'technical',
      planRequired: true,
      rationale: `technical keywords (score ${technicalScore})`,
    };
  }
  return {
    domain: 'summary',
    planRequired: false,
    rationale: `summary keywords (score ${summaryScore})`,
  };
}

// ---------------------------------------------------------------------------
// Pattern scoring
// ---------------------------------------------------------------------------

const FUNDAMENTAL_PATTERNS: Array<{ re: RegExp; weight: number }> = [
  { re: /\b(why|because|driver|reason|cause|implication|catalyst)\b/, weight: 2 },
  { re: /\b(fundamental|macro|policy|monetary|hawkish|dovish|stagflation)\b/, weight: 3 },
  {
    re: /\b(fed|fomc|powell|ecb|lagarde|boe|bailey|cpi|nfp|pce|gdp|ppi|pmi|jobs|jobless)\b/,
    weight: 3,
  },
  { re: /\b(real yield|yields|10y|treasury|treasuries|dxy|dollar index)\b/, weight: 2 },
  { re: /\b(geopolit|war|tariff|sanction|risk-?on|risk-?off)\b/, weight: 2 },
  { re: /\b(scenario|outlook|forecast|expect)\b/, weight: 1 },
  { re: /\b(committee|review my trade|rate my setup|should i take|trade idea)\b/, weight: 3 },
];

const TECHNICAL_PATTERNS: Array<{ re: RegExp; weight: number }> = [
  { re: /\b(chart|candle|candles|bar|bars|wick|body)\b/, weight: 1 },
  {
    re: /\b(rsi|macd|ema|sma|bollinger|atr|stoch|stochastic|adx|ichimoku|pivot|pivots)\b/,
    weight: 3,
  },
  { re: /\b(bos|choch|fvg|fair value gap|order block|liquidity|sweep|smc|ict)\b/, weight: 3 },
  { re: /\b(timeframe|tf|1m|5m|15m|30m|1h|4h|1d|1w|daily|weekly|hourly)\b/, weight: 1 },
  { re: /\b(support|resistance|breakout|rejection|trend|reversal|range)\b/, weight: 2 },
  { re: /\b(top-?down|bias|setup|invalidation|stop)\b/, weight: 2 },
  { re: /\b(price|level|levels|key level)\b/, weight: 1 },
];

const SUMMARY_PATTERNS: Array<{ re: RegExp; weight: number }> = [
  { re: /\b(summari[sz]e|recap|brief|overview|tldr)\b/, weight: 3 },
  { re: /\b(news|headline|headlines|article|articles|story|stories)\b/, weight: 2 },
  { re: /\b(calendar|event|events|schedule|upcoming|today|tomorrow|this week)\b/, weight: 2 },
  { re: /\b(journal|trade|trades|win rate|r-?multiple|stats)\b/, weight: 2 },
  { re: /\b(list|show me|what(?:'s| is) (?:on|happening))\b/, weight: 1 },
];

function scoreFundamental(text: string): number {
  return scoreAgainst(text, FUNDAMENTAL_PATTERNS);
}
function scoreTechnical(text: string): number {
  return scoreAgainst(text, TECHNICAL_PATTERNS);
}
function scoreSummary(text: string): number {
  return scoreAgainst(text, SUMMARY_PATTERNS);
}

function scoreAgainst(text: string, patterns: Array<{ re: RegExp; weight: number }>): number {
  let score = 0;
  for (const p of patterns) if (p.re.test(text)) score += p.weight;
  return score;
}

// ---------------------------------------------------------------------------
// UIMessage helpers (defensive — UIMessage is a wide union)
// ---------------------------------------------------------------------------

function extractText(m: UIMessage): string {
  const parts = m.parts ?? [];
  let out = '';
  for (const p of parts) {
    if (
      p !== null &&
      typeof p === 'object' &&
      'type' in (p as Record<string, unknown>) &&
      (p as { type: unknown }).type === 'text' &&
      typeof (p as { text?: unknown }).text === 'string'
    ) {
      out += `${(p as { text: string }).text}\n`;
    }
  }
  return out.trim();
}

function hasImagePart(m: UIMessage): boolean {
  const parts = m.parts ?? [];
  for (const p of parts) {
    if (
      p !== null &&
      typeof p === 'object' &&
      'type' in (p as Record<string, unknown>) &&
      (p as { type: unknown }).type === 'file' &&
      typeof (p as { mediaType?: unknown }).mediaType === 'string' &&
      (p as { mediaType: string }).mediaType.startsWith('image/')
    ) {
      return true;
    }
  }
  return false;
}
