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

// PF-12 — Contract tests for BaseAgent subclasses.
//
// Verifies that every concrete agent (TechnicalAgent, FundamentalAgent,
// RiskAgent, SentimentAgent, DecisionAgent) satisfies the BaseAgent
// contract:
//   1. Has a valid `name` from the AgentName union
//   2. Has a valid `modelTier`
//   3. `systemPrompt()` returns a non-empty string
//   4. `tools()` returns a non-empty Record
//   5. `parseOutput()` returns valid AgentOpinion fields
//
// These tests do NOT call the LLM — they verify structural contract
// compliance only (LSP compliance).

import { describe, it, expect } from 'vitest';
import { BaseAgent } from '../src/multi-agent/agents/base-agent';

// PF-12: Load the tool registry (via side-effect imports) before tests run
// so agent.tools() returns non-empty tool sets.
import '../src/tools/index';
import { TechnicalAgent } from '../src/multi-agent/agents/technical-agent';
import { FundamentalAgent } from '../src/multi-agent/agents/fundamental-agent';
import { RiskAgent } from '../src/multi-agent/agents/risk-agent';
import { SentimentAgent } from '../src/multi-agent/agents/sentiment-agent';
import { DecisionAgent } from '../src/multi-agent/agents/decision-agent';
import type { AgentName } from '../src/multi-agent/types';

// Collect all concrete agent instances for contract testing.
const ALL_AGENTS: BaseAgent[] = [
  new TechnicalAgent(),
  new FundamentalAgent(),
  new RiskAgent(),
  new SentimentAgent(),
  new DecisionAgent(),
];

const VALID_AGENT_NAMES: AgentName[] = ['technical', 'fundamental', 'risk', 'sentiment', 'decision'];
const VALID_TIERS = ['fast', 'mid', 'strong'] as const;

describe('BaseAgent contract (PF-12)', () => {
  describe.each(ALL_AGENTS.map((agent, i) => ({ agent, index: i, name: agent.constructor.name })))(
    '$name',
    ({ agent }) => {
      it('has a valid AgentName', () => {
        expect(VALID_AGENT_NAMES).toContain(agent.name);
      });

      it('has a valid modelTier', () => {
        expect(VALID_TIERS).toContain(agent.modelTier);
      });

      it('systemPrompt() returns a non-empty string', () => {
        const prompt = agent.systemPrompt();
        expect(typeof prompt).toBe('string');
        expect(prompt.length).toBeGreaterThan(50);
      });

      it('tools() returns a non-empty Record', () => {
        const tools = agent.tools();
        expect(tools).toBeDefined();
        expect(typeof tools).toBe('object');
        expect(Object.keys(tools).length).toBeGreaterThan(0);
      });

      it('parseOutput() handles valid JSON input', () => {
        const input = JSON.stringify({
          bias: 'bullish',
          confidence: 0.85,
          reasoning: 'Test reasoning for contract validation.',
          rawData: { key: 'value' },
        });
        const result = agent['parseOutput'](input);
        expect(result).toBeDefined();
        expect(result.bias).toMatch(/^(bullish|bearish|neutral)$/);
        expect(result.confidence).toBeGreaterThanOrEqual(0);
        expect(result.confidence).toBeLessThanOrEqual(1);
        expect(typeof result.reasoning).toBe('string');
        expect(result.reasoning.length).toBeGreaterThan(0);
        expect(result.rawData).toBeDefined();
      });

      it('parseOutput() handles malformed input gracefully', () => {
        const result = agent['parseOutput']('not-json-at-all');
        expect(result).toBeDefined();
        expect(result.bias).toMatch(/^(bullish|bearish|neutral)$/);
        expect(result.confidence).toBeGreaterThanOrEqual(0);
        expect(result.confidence).toBeLessThanOrEqual(1);
        expect(typeof result.reasoning).toBe('string');
      });
    },
  );
});
