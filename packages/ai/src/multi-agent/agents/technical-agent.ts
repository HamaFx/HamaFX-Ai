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

import { z } from 'zod';
import type { Tool } from 'ai';
import { BaseAgent, baseOpinionSchema } from './base-agent';
import { tools as allTools } from '../../tools';
import type { AgentName, AgentBias, ModelTier } from '../types';

const technicalSchema = baseOpinionSchema.extend({
  keyLevels: z.object({ support: z.array(z.union([z.number(), z.string()])), resistance: z.array(z.union([z.number(), z.string()])) }).optional(),
  indicators: z.object({ rsi: z.union([z.number(), z.string()]).optional(), macd: z.union([z.number(), z.string()]).optional(), ema20: z.union([z.number(), z.string()]).optional(), ema50: z.union([z.number(), z.string()]).optional() }).optional(),
  structure: z.enum(['trending', 'ranging', 'transitioning']).optional(),
  sessionContext: z.string().optional(),
  concerns: z.array(z.string()).optional(),
});

export class TechnicalAgent extends BaseAgent {
  readonly name: AgentName = 'technical';
  readonly modelTier: ModelTier = 'fast';

  systemPrompt(): string {
    return `You are a Technical Analysis Agent for HamaFX-Ai, an AI forex/XAUUSD trading copilot.

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
{ "bias": "bullish|bearish|neutral", "confidence": 0.0-1.0, "keyLevels": { "support": [...], "resistance": [...] }, "indicators": { "rsi": ..., "macd": ..., "ema20": ..., "ema50": ... }, "structure": "trending|ranging|transitioning", "sessionContext": "Asian|London|NY|Overlap|Off-hours", "reasoning": "2-3 sentence technical summary", "concerns": ["technical warning signs"] }

Use the available tools to fetch real candle data, indicators, and market structure before forming your opinion.`;
  }

  tools(): Record<string, Tool> {
    return { get_candles: allTools.get_candles, get_indicators: allTools.get_indicators, get_price: allTools.get_price, get_market_structure: allTools.get_market_structure, get_session_levels: allTools.get_session_levels, get_intermarket: allTools.get_intermarket, get_intermarket_resonance: allTools.get_intermarket_resonance, get_correlation: allTools.get_correlation, get_seasonality: allTools.get_seasonality };
  }

  protected parseOutput(text: string): { bias: AgentBias; confidence: number; reasoning: string; rawData: Record<string, unknown> } {
    const json = this.safeParseJson(text);
    if (json) { const r = technicalSchema.safeParse(json); if (r.success) return { bias: r.data.bias, confidence: r.data.confidence, reasoning: r.data.reasoning, rawData: json }; }
    const lower = text.toLowerCase(); let bias: AgentBias = 'neutral';
    if (lower.includes('bullish')) bias = 'bullish'; else if (lower.includes('bearish')) bias = 'bearish';
    return { bias, confidence: 0.5, reasoning: text.slice(0, 500), rawData: { rawText: text.slice(0, 2000), parseFailed: true } };
  }
}