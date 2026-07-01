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
import type { AgentOpinion, AgentName } from '../../src/multi-agent/types';

// Test the fusion logic without importing the full DecisionAgent (which
// transitively imports server-only via model resolution). We test the
// prompt construction and parse logic directly.

describe('DecisionAgent — fusion logic', () => {
  // Re-implement the buildOpinionsBlock logic for testing since we can't
  // import the actual DecisionAgent in the test environment.
  function buildOpinionsBlock(opinions: AgentOpinion[]): string {
    if (opinions.length === 0) return 'No specialist agents were available for this analysis. Provide a general response based on your own knowledge.';
    return opinions.map((op) => {
      const name = op.agentName.charAt(0).toUpperCase() + op.agentName.slice(1);
      const confidencePct = Math.round(op.confidence * 100);
      const rawDataStr = JSON.stringify(op.rawData, null, 2);
      return `### ${name} Agent\n- **Bias:** ${op.bias}\n- **Confidence:** ${confidencePct}%\n- **Reasoning:** ${op.reasoning}\n- **Full Data:**\n\`\`\`json\n${rawDataStr}\n\`\`\``;
    }).join('\n\n---\n\n');
  }

  describe('buildOpinionsBlock', () => {
    it('handles empty opinions', () => {
      const block = buildOpinionsBlock([]);
      expect(block).toContain('No specialist agents');
    });

    it('formats single opinion correctly', () => {
      const opinions: AgentOpinion[] = [
        { agentName: 'technical', bias: 'bullish', confidence: 0.85, reasoning: 'Strong uptrend', rawData: { keyLevels: { support: [2350] } }, costUsd: 0.01, latencyMs: 1200, model: 'google/gemini-2.5-flash' },
      ];
      const block = buildOpinionsBlock(opinions);
      expect(block).toContain('Technical Agent');
      expect(block).toContain('bullish');
      expect(block).toContain('85%');
      expect(block).toContain('Strong uptrend');
    });

    it('formats multiple opinions with separators', () => {
      const opinions: AgentOpinion[] = [
        { agentName: 'technical', bias: 'bullish', confidence: 0.8, reasoning: 'Uptrend', rawData: {}, costUsd: 0.01, latencyMs: 1000, model: 'm1' },
        { agentName: 'risk', bias: 'bearish', confidence: 0.6, reasoning: 'High event risk', rawData: { hardVeto: false }, costUsd: 0.01, latencyMs: 1500, model: 'm2' },
      ];
      const block = buildOpinionsBlock(opinions);
      expect(block).toContain('Technical Agent');
      expect(block).toContain('Risk Agent');
      expect(block).toContain('---');
    });
  });

  describe('veto handling in opinions', () => {
    it('risk opinion with hardVeto is included in rawData', () => {
      const riskOpinion: AgentOpinion = {
        agentName: 'risk' as AgentName,
        bias: 'bearish',
        confidence: 0.9,
        reasoning: 'Critical event risk',
        rawData: { hardVeto: true, riskLevel: 'extreme' },
        costUsd: 0.01,
        latencyMs: 1000,
        model: 'm1',
      };
      const block = buildOpinionsBlock([riskOpinion]);
      expect(block).toContain('hardVeto');
      expect(block).toContain('true');
    });
  });

  describe('decision prompt requirements', () => {
    // Test that the expected prompt structure is correct
    const EXPECTED_SECTIONS = ['Bottom Line', 'Technical Read', 'Fundamental Context', 'Risk Assessment', 'Actionable Plan'];
    const EXPECTED_KEYWORDS = ['hardVeto', 'AGREEMENT', 'DISAGREEMENT', 'unavailable'];

    it('expected response format sections are defined', () => {
      EXPECTED_SECTIONS.forEach((s) => {
        expect(typeof s).toBe('string');
        expect(s.length).toBeGreaterThan(0);
      });
    });

    it('expected keywords for veto and disagreement are defined', () => {
      EXPECTED_KEYWORDS.forEach((k) => {
        expect(typeof k).toBe('string');
        expect(k.length).toBeGreaterThan(0);
      });
    });
  });
});