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

const fundamentalSchema = baseOpinionSchema.extend({
  keyEvents: z.array(z.object({ event: z.string(), impact: z.enum(['high', 'medium', 'low']).optional(), date: z.string().optional() })).optional(),
  cotPositioning: z.enum(['long', 'short', 'neutral', 'n/a']).optional(),
  dxyContext: z.enum(['strengthening', 'weakening', 'stable']).optional(),
  yieldContext: z.enum(['rising', 'falling', 'stable']).optional(),
  upcomingCatalysts: z.array(z.string()).optional(),
});

export class FundamentalAgent extends BaseAgent {
  readonly name: AgentName = 'fundamental';
  readonly modelTier: ModelTier = 'mid';

  systemPrompt(): string {
    return `You are a Fundamental Analysis Agent for HamaFX-Ai.

Your SOLE focus is macroeconomic and fundamental analysis:
- Economic calendar: upcoming events, their impact, forecasts vs actuals
- Central bank policy: Fed, ECB, BOE, BOJ — rate expectations, dot plot
- COT (Commitment of Traders): institutional positioning
- Intermarket resonance: DXY, US yields, equity risk appetite
- Geopolitical context affecting forex and gold

DO NOT discuss technical levels or chart patterns. That's handled by other agents.
DO NOT give a final buy/sell recommendation. Output your fundamental read only.

## Output Format
{ "bias": "bullish|bearish|neutral", "confidence": 0.0-1.0, "keyEvents": [{ "event": "...", "impact": "high|medium|low", "date": "..." }], "cotPositioning": "long|short|neutral|n/a", "dxyContext": "strengthening|weakening|stable", "yieldContext": "rising|falling|stable", "reasoning": "2-3 sentence fundamental summary", "upcomingCatalysts": ["events that could move price in next 24-48h"] }

Use the available tools to fetch real calendar events, COT data, and news before forming your opinion.`;
  }

  tools(): Record<string, Tool> {
    return { get_calendar: allTools.get_calendar, get_cot: allTools.get_cot, get_news: allTools.get_news, get_intermarket_resonance: allTools.get_intermarket_resonance, search_knowledge: allTools.search_knowledge };
  }

  protected parseOutput(text: string): { bias: AgentBias; confidence: number; reasoning: string; rawData: Record<string, unknown> } {
    const json = this.safeParseJson(text);
    if (json) { const r = fundamentalSchema.safeParse(json); if (r.success) return { bias: r.data.bias, confidence: r.data.confidence, reasoning: r.data.reasoning, rawData: json }; }
    const lower = text.toLowerCase(); let bias: AgentBias = 'neutral';
    if (lower.includes('bullish')) bias = 'bullish'; else if (lower.includes('bearish')) bias = 'bearish';
    return { bias, confidence: 0.5, reasoning: text.slice(0, 500), rawData: { rawText: text.slice(0, 2000), parseFailed: true } };
  }
}