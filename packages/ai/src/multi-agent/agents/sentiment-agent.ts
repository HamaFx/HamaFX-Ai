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

// Sentiment Analysis Agent — social sentiment, news sentiment, market fear/greed.

import { z } from 'zod';
import type { Tool } from 'ai';
import { BaseAgent, baseOpinionSchema } from './base-agent';
import { tools as allTools } from '../../tools';
import type { AgentName, AgentBias, ModelTier } from '../types';

const sentimentSchema = baseOpinionSchema.extend({
  sentiment: z.enum(['very_bullish', 'bullish', 'neutral', 'bearish', 'very_bearish']).optional(),
  newsSentiment: z.enum(['positive', 'negative', 'mixed']).optional(),
  socialSentiment: z.enum(['positive', 'negative', 'mixed', 'unavailable']).optional(),
  contrarianSignal: z.boolean().optional(),
});

export class SentimentAgent extends BaseAgent {
  readonly name: AgentName = 'sentiment';
  readonly modelTier: ModelTier = 'fast';

  systemPrompt(): string {
    return `You are a Sentiment Analysis Agent for HamaFX-Ai.

Your SOLE focus is market sentiment and positioning:
- News sentiment: is recent news flow bullish or bearish?
- Social sentiment: what are traders on social media saying?
- Fear/Greed: is the market in fear, greed, or neutral?
- Contrarian signals: is sentiment so extreme it's a contrarian indicator?

DO NOT discuss technical levels or fundamentals. Output your sentiment read only.

## Output Format
{
  "bias": "bullish|bearish|neutral",
  "confidence": 0.0-1.0,
  "sentiment": "very_bullish|bullish|neutral|bearish|very_bearish",
  "newsSentiment": "positive|negative|mixed",
  "socialSentiment": "positive|negative|mixed|unavailable",
  "contrarianSignal": true|false,
  "reasoning": "2-3 sentence sentiment summary"
}

Use the available tools to fetch real news and search for relevant information
before forming your sentiment assessment.`;
  }

  tools(): Record<string, Tool> {
    return {
      get_news: allTools.get_news,
      search_knowledge: allTools.search_knowledge,
      get_social_sentiment: allTools.get_social_sentiment,
    };
  }

  protected parseOutput(text: string): { bias: AgentBias; confidence: number; reasoning: string; rawData: Record<string, unknown> } {
    const json = this.safeParseJson(text);
    if (json) { const r = sentimentSchema.safeParse(json); if (r.success) return { bias: r.data.bias, confidence: r.data.confidence, reasoning: r.data.reasoning, rawData: json }; }
    const lower = text.toLowerCase(); let bias: AgentBias = 'neutral';
    if (lower.includes('bullish')) bias = 'bullish'; else if (lower.includes('bearish')) bias = 'bearish';
    return { bias, confidence: 0.5, reasoning: text.slice(0, 500), rawData: { rawText: text.slice(0, 2000), parseFailed: true } };
  }
}