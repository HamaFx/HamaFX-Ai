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

import { describe, it, expect } from 'vitest';
import { TechnicalAgent } from '../../../src/multi-agent/agents/technical-agent';
import { FundamentalAgent } from '../../../src/multi-agent/agents/fundamental-agent';
import { RiskAgent } from '../../../src/multi-agent/agents/risk-agent';
import { SentimentAgent } from '../../../src/multi-agent/agents/sentiment-agent';
import { DecisionAgent } from '../../../src/multi-agent/agents/decision-agent';

describe('TechnicalAgent', () => {
  const agent = new TechnicalAgent();
  it('has correct name and tier', () => { expect(agent.name).toBe('technical'); expect(agent.modelTier).toBe('fast'); });
  it('has a system prompt mentioning technical analysis', () => { const p = agent.systemPrompt(); expect(p).toContain('Technical Analysis Agent'); expect(p.toLowerCase()).toContain('price action'); });
  it('has scoped tools', () => { const t = agent.tools(); expect(t.get_candles).toBeDefined(); expect(t.get_calendar).toBeUndefined(); });
  it('parses valid JSON output', () => { const r = (agent as any).parseOutput(JSON.stringify({ bias: 'bullish', confidence: 0.85, reasoning: 'Uptrend', keyLevels: { support: [2350], resistance: [2400] } })); expect(r.bias).toBe('bullish'); expect(r.rawData.keyLevels).toBeDefined(); });
  it('parses JSON in code blocks', () => { const r = (agent as any).parseOutput('```json\n{"bias":"bearish","confidence":0.6,"reasoning":"Downtrend"}\n```'); expect(r.bias).toBe('bearish'); });
  it('falls back on parse failure', () => { const r = (agent as any).parseOutput('The market looks bullish.'); expect(r.bias).toBe('bullish'); expect(r.rawData.parseFailed).toBe(true); });
});

describe('FundamentalAgent', () => {
  const agent = new FundamentalAgent();
  it('has correct name and tier', () => { expect(agent.name).toBe('fundamental'); expect(agent.modelTier).toBe('mid'); });
  it('has fundamental tools', () => { const t = agent.tools(); expect(t.get_calendar).toBeDefined(); expect(t.get_candles).toBeUndefined(); });
});

describe('RiskAgent', () => {
  const agent = new RiskAgent();
  it('has correct name and tier', () => { expect(agent.name).toBe('risk'); expect(agent.modelTier).toBe('mid'); });
  it('mentions devil\'s advocate', () => { expect(agent.systemPrompt()).toContain("DEVIL'S ADVOCATE"); });
  it('has risk tools', () => { const t = agent.tools(); expect(t.compute_risk).toBeDefined(); expect(t.compute_position_health).toBeDefined(); });
});

describe('SentimentAgent', () => {
  const agent = new SentimentAgent();
  it('has correct name and tier', () => { expect(agent.name).toBe('sentiment'); expect(agent.modelTier).toBe('fast'); });
  it('has sentiment tools', () => { const t = agent.tools(); expect(t.get_news).toBeDefined(); expect(t.get_candles).toBeUndefined(); });
});

describe('DecisionAgent', () => {
  const agent = new DecisionAgent();
  it('has correct name and tier', () => { expect(agent.name).toBe('decision'); expect(agent.modelTier).toBe('strong'); });
  it('has NO tools', () => { expect(Object.keys(agent.tools())).toHaveLength(0); });
  it('mentions fusion and veto', () => { const p = agent.systemPrompt(); expect(p).toContain('hardVeto'); expect(p).toContain('AGREEMENT'); });
  it('extracts bullish bias', () => { expect((agent as any).parseOutput('XAUUSD is bullish. Buy at 2360.').bias).toBe('bullish'); });
  it('extracts bearish bias', () => { expect((agent as any).parseOutput('Bearish outlook. Sell on rallies.').bias).toBe('bearish'); });
});