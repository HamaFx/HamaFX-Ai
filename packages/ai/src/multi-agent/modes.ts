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

// Multi-Agent Orchestration — mode definitions + routing logic.

import type { AnalysisMode, ResolvedMode, AgentName } from './types';

export function selectAgents(mode: ResolvedMode): AgentName[] {
  switch (mode) {
    case 'single':
      return [];
    case 'quick':
      return ['technical'];
    case 'standard':
      return ['technical', 'fundamental'];
    case 'full':
      return ['technical', 'fundamental', 'risk', 'sentiment'];
  }
}

export function autoDetectMode(message: string): ResolvedMode {
  const lower = message.toLowerCase().trim();

  // Trivial messages — greetings, thanks, single-word acknowledgements.
  // No need to spin up multiple agents for these.
  if (/^(hi|hello|hey|thanks|thank you|ok|okay|yes|no|bye|good morning|good night)\b/.test(lower)) return 'single';

  // Simple price checks already covered by the LIVE_SNAPSHOT.
  if (/(what'?s the price|current price|quote|how much is)/.test(lower)) return 'single';
  if (/^(price|quote|rate)\s+(for|of)?\s*\w{3,6}\??$/i.test(lower)) return 'single';

  // Trading decision questions — full committee.
  if (/should i (buy|sell|enter|go long|go short|trade)/.test(lower)) return 'full';
  if (/(is it (a )?good time (to|for)|is now (a )?good time)/.test(lower)) return 'full';
  if (/(buy or sell|long or short|bullish or bearish)/.test(lower)) return 'full';

  // Analysis / opinion questions — standard.
  if (/(analyze|analysis|outlook|view on|what do you think|forecast|predict)/.test(lower)) return 'standard';
  if (/(technical (and|&) fundamental|full analysis|deep dive)/.test(lower)) return 'standard';

  // Ambiguous short prompts — default to single for efficiency.
  if (lower.length < 10) return 'single';

  return 'standard';
}

export function resolveMode(mode: AnalysisMode, userMessage: string): ResolvedMode {
  if (mode === 'auto') {
    return autoDetectMode(userMessage);
  }
  return mode;
}

export interface ModeMeta {
  value: AnalysisMode;
  label: string;
  description: string;
  latencyS: number;
  costMultiplier: number;
  llmCalls: number;
}

export const MODE_OPTIONS: ModeMeta[] = [
  { value: 'auto', label: 'Auto', description: 'AI picks the best mode', latencyS: 0, costMultiplier: 0, llmCalls: 0 },
  { value: 'single', label: 'Single', description: 'Fast, one agent', latencyS: 2, costMultiplier: 1, llmCalls: 1 },
  { value: 'quick', label: 'Quick', description: 'Technical only', latencyS: 3, costMultiplier: 1.5, llmCalls: 2 },
  { value: 'standard', label: 'Standard', description: 'Technical + Fundamental', latencyS: 5, costMultiplier: 2.5, llmCalls: 3 },
  { value: 'full', label: 'Full', description: 'All 4 agents + fusion', latencyS: 8, costMultiplier: 4, llmCalls: 5 },
];