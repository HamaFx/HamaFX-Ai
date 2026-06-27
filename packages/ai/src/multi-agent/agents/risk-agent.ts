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

// Risk Screening Agent — identifies risks, red flags, worst-case scenarios.

import { z } from 'zod';
import { BaseAgent, baseOpinionSchema } from './base-agent';
import { tools as allTools } from '../../tools';
import { getMarketPhase } from '@hamafx/shared';
import type { AgentName, AgentBias, ModelTier } from '../types';

const riskSchema = baseOpinionSchema.extend({
  riskLevel: z.enum(['low', 'medium', 'high', 'extreme']).optional(),
  riskFlags: z.array(z.object({
    type: z.enum(['event', 'positioning', 'correlation', 'technical', 'sentiment']),
    description: z.string(),
    severity: z.enum(['soft', 'hard']),
  })).optional(),
  maxAdverseMove: z.string().optional(),
  eventRisk: z.string().optional(),
  hardVeto: z.boolean().optional(),
});

export class RiskAgent extends BaseAgent {
  readonly name: AgentName = 'risk';
  readonly modelTier: ModelTier = 'mid';

  systemPrompt(): string {
    // F6 — Inject current market phase context into the risk agent's prompt.
    // Low-liquidity sessions (Sydney) are flagged as higher risk for
    // breakout setups, while the London/NY overlap is the most reliable.
    const phase = getMarketPhase();
    const liquidityRiskNote =
      phase.liquidity === 'low'
        ? '\n\n## CURRENT MARKET PHASE WARNING\nThe market is currently in a LOW LIQUIDITY session (' +
          phase.session +
          '). Breakout signals are less reliable during this period. Flag any breakout setup as higher risk due to thin volumes and potential false moves.'
        : phase.liquidity === 'medium'
          ? '\n\n## CURRENT MARKET PHASE NOTE\nThe market is currently in a MEDIUM LIQUIDITY session (' +
            phase.session +
            '). Exercise caution with breakout setups — moves may be less reliable than during peak hours.'
          : '\n\n## CURRENT MARKET PHASE NOTE\nThe market is currently in a HIGH LIQUIDITY session (' +
            phase.session +
            '). Moves are more reliable during this period.';

    return `You are a Risk Screening Agent for HamaFX-Ai.

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
  "bias": "bullish|bearish|neutral",
  "confidence": 0.0-1.0,
  "riskLevel": "low|medium|high|extreme",
  "riskFlags": [
    { "type": "event|positioning|correlation|technical|sentiment", "description": "...", "severity": "soft|hard" }
  ],
  "maxAdverseMove": "estimated pips to stop/invalidation",
  "eventRisk": "next high-impact event + timing",
  "reasoning": "2-3 sentence risk summary",
  "hardVeto": true|false
}

Set hardVeto to true ONLY if there is a critical, unavoidable risk that makes
any buy/sell signal dangerous right now. Use sparingly.

Use the available tools to fetch real news, calendar events, and correlation data
before forming your assessment.${liquidityRiskNote}`;
  }

  tools(): Record<string, import('ai').Tool> {
    return {
      get_news: allTools.get_news,
      get_calendar: allTools.get_calendar,
      get_correlation: allTools.get_correlation,
      get_cot: allTools.get_cot,
      compute_risk: allTools.compute_risk,
      compute_position_health: allTools.compute_position_health,
    };
  }

  protected parseOutput(text: string): { bias: AgentBias; confidence: number; reasoning: string; rawData: Record<string, unknown> } {
    const json = this.safeParseJson(text);
    if (json) { const r = riskSchema.safeParse(json); if (r.success) return { bias: r.data.bias, confidence: r.data.confidence, reasoning: r.data.reasoning, rawData: json }; }
    const lower = text.toLowerCase(); let bias: AgentBias = 'neutral';
    if (lower.includes('bullish')) bias = 'bullish'; else if (lower.includes('bearish')) bias = 'bearish';
    return { bias, confidence: 0.5, reasoning: text.slice(0, 500), rawData: { rawText: text.slice(0, 2000), parseFailed: true } };
  }
}