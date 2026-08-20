// SPDX-License-Identifier: Apache-2.0

/**
 * Pure analysis-mode classification retained as a compatibility utility for
 * the chat selector. Agent execution is owned by Mastra; this module contains
 * no model calls, tools, persistence, or orchestration.
 */

export type AnalysisMode = 'single' | 'quick' | 'standard' | 'full' | 'auto';
export type ResolvedMode = 'single' | 'quick' | 'standard' | 'full';
export type SpecialistAgentName = 'technical' | 'fundamental' | 'risk' | 'sentiment';

export function selectAgents(mode: ResolvedMode): SpecialistAgentName[] {
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
  if (/^(hi|hello|hey|thanks|thank you|ok|okay|yes|no|bye|good morning|good night)\b/.test(lower))
    return 'single';
  if (/(what'?s the price|current price|quote|how much is)/.test(lower)) return 'single';
  if (/^(price|quote|rate)\s+(for|of)?\s*\w{3,6}\??$/i.test(lower)) return 'single';
  if (/should i (buy|sell|enter|go long|go short|trade)/.test(lower)) return 'full';
  if (/(is it (a )?good time (to|for)|is now (a )?good time)/.test(lower)) return 'full';
  if (/(buy or sell|long or short|bullish or bearish)/.test(lower)) return 'full';
  if (
    /(full|complete|comprehensive|deep dive|all four|committee)/.test(lower) &&
    /(analysis|analy[sz]e|review|read|outlook|assessment|committee)/.test(lower)
  )
    return 'full';
  if (/(deep dive|full analysis|comprehensive analysis)/.test(lower)) return 'full';
  if (/(analyze|analysis|outlook|view on|what do you think|forecast|predict)/.test(lower))
    return 'standard';
  if (/(technical (and|&) fundamental)/.test(lower)) return 'standard';
  if (lower.length < 10) return 'single';
  return 'standard';
}

export function resolveMode(mode: AnalysisMode, userMessage: string): ResolvedMode {
  return mode === 'auto' ? autoDetectMode(userMessage) : mode;
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
  {
    value: 'auto',
    label: 'Auto',
    description: 'AI picks the best mode',
    latencyS: 0,
    costMultiplier: 0,
    llmCalls: 0,
  },
  {
    value: 'single',
    label: 'Single',
    description: 'Fast, one agent',
    latencyS: 2,
    costMultiplier: 1,
    llmCalls: 1,
  },
  {
    value: 'quick',
    label: 'Quick',
    description: 'Technical only',
    latencyS: 3,
    costMultiplier: 1.5,
    llmCalls: 2,
  },
  {
    value: 'standard',
    label: 'Standard',
    description: 'Technical + Fundamental',
    latencyS: 5,
    costMultiplier: 2.5,
    llmCalls: 3,
  },
  {
    value: 'full',
    label: 'Full',
    description: 'All 4 Mastra specialists + fusion',
    latencyS: 8,
    costMultiplier: 4,
    llmCalls: 5,
  },
];
