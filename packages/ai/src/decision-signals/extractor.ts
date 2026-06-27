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

// F1.3 — Signal Extractor.
//
// Extracts a structured decision signal from a completed AI response by
// parsing tool-call parts (compute-risk, plan) and falling back to text
// parsing. The result is persisted as a decision_signal row.
//
// The extractor is intentionally conservative: it only creates a signal
// when it finds a clear directional recommendation (buy/sell/reduce/add).
// "hold" and "avoid" are not tracked as directional signals.

import type { UIMessage } from 'ai';
import {
  DecisionActionSchema,
  type DecisionAction,
  type DecisionBias,
  type DecisionSignalPayload,
  type SignalHorizon,
  type SignalSourceType,
} from './types';

// ---------------------------------------------------------------------------
// Public interface
// ---------------------------------------------------------------------------

export interface ExtractionContext {
  symbol: string;
  currentPrice: number;
  userId: string;
  threadId: string;
  messageId: string;
  model?: string | null;
  analysisMode?: string | null;
}

/**
 * Extract a decision signal from a completed AI response.
 *
 * Returns null when no directional signal is found (hold, avoid, or
 * no actionable recommendation).
 */
export function extractDecisionSignal(
  message: UIMessage,
  context: ExtractionContext,
): DecisionSignalPayload | null {
  const parts = message.parts ?? [];

  // 1. Look for compute-risk tool output (has entry/stop/target/side).
  const riskOutput = findToolOutput(parts, 'tool-compute_risk');

  // 2. Look for plan tool output (has action + horizon).
  const planOutput = findToolOutput(parts, 'tool-plan');

  // 3. Try to get action from structured outputs or text.
  let action: DecisionAction | null = null;

  if (riskOutput) {
    const side = riskOutput.side as string | undefined;
    if (side === 'long') action = 'buy';
    else if (side === 'short') action = 'sell';
  }

  if (!action && planOutput) {
    const planAction = planOutput.action as string | undefined;
    if (planAction && isValidAction(planAction)) {
      action = planAction as DecisionAction;
    }
  }

  // 4. Fall back to text parsing.
  const text = extractTextFromParts(parts);
  if (!action) {
    action = parseActionFromText(text);
  }

  // Only track directional signals.
  if (!action || action === 'hold' || action === 'avoid') return null;

  // 5. Extract levels from compute-risk output.
  let entryLow: number | null = null;
  let entryHigh: number | null = null;
  let stopLoss: number | null = null;
  let takeProfit: number | null = null;
  let confidence: number | null = null;

  if (riskOutput) {
    const entry = riskOutput.entry as number | undefined;
    if (entry !== undefined) {
      entryLow = entry;
      entryHigh = entry;
    }
    const stop = riskOutput.stop as number | undefined;
    if (stop !== undefined) stopLoss = stop;
    const target = riskOutput.target as number | undefined;
    if (target !== undefined) takeProfit = target;
  }

  // 6. Extract horizon from plan output or default to '3d'.
  let horizon: SignalHorizon = '3d';
  if (planOutput) {
    const planHorizon = planOutput.horizon as string | undefined;
    if (planHorizon && isValidHorizon(planHorizon)) {
      horizon = planHorizon as SignalHorizon;
    }
  }

  const bias = actionToBias(action);
  const sourceType: SignalSourceType = 'chat';

  // 7. Build metadata — keep reasoning snippet for context.
  const metadata: Record<string, unknown> = {
    reasoning: text.slice(0, 500),
  };

  return {
    symbol: context.symbol,
    action,
    bias,
    confidence,
    entryLow,
    entryHigh,
    stopLoss,
    takeProfit,
    horizon,
    anchorPrice: context.currentPrice,
    sourceType,
    model: context.model ?? null,
    analysisMode: context.analysisMode ?? null,
    metadata,
    userId: context.userId,
    threadId: context.threadId,
    messageId: context.messageId,
  };
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Find a tool output by tool type prefix (e.g. "tool-compute_risk").
 * Returns the output object cast to Record<string, unknown>, or null.
 */
function findToolOutput(
  parts: UIMessage['parts'],
  typePrefix: string,
): Record<string, unknown> | null {
  for (const part of parts) {
    if (typeof part !== 'object' || part === null) continue;
    const p = part as Record<string, unknown>;
    const type = p.type as string | undefined;
    if (type && type === typePrefix && 'output' in p) {
      return p.output as Record<string, unknown>;
    }
  }
  return null;
}

function actionToBias(action: DecisionAction): DecisionBias {
  switch (action) {
    case 'buy':
    case 'add':
      return 'bullish';
    case 'sell':
    case 'reduce':
      return 'bearish';
    default:
      return 'neutral';
  }
}

function isValidAction(value: string): boolean {
  return DecisionActionSchema.safeParse(value).success;
}

function isValidHorizon(value: string): boolean {
  return ['intraday', '1d', '3d', '5d', '10d', 'swing'].includes(value);
}

/**
 * Parse action from free-text AI response.
 * Looks for common directional keywords.
 */
function parseActionFromText(text: string): DecisionAction | null {
  if (!text) return null;
  const lower = text.toLowerCase();

  // Check for explicit recommendation patterns.
  const patterns: Array<{ regex: RegExp; action: DecisionAction }> = [
    { regex: /\b(strong\s+buy|buy|go\s+long|long\s+position|enter\s+long)\b/i, action: 'buy' },
    { regex: /\b(strong\s+sell|sell|go\s+short|short\s+position|enter\s+short)\b/i, action: 'sell' },
    { regex: /\b(reduce|trim|scale\s+down|cut\s+position)\b/i, action: 'reduce' },
    { regex: /\b(add\s+to\s+position|add\s+long|add\s+short|scale\s+in)\b/i, action: 'add' },
    { regex: /\b(hold|wait|stand\s+aside|no\s+trade|stay\s+flat)\b/i, action: 'hold' },
    { regex: /\b(avoid|skip|do\s+not\s+trade|stay\s+out)\b/i, action: 'avoid' },
  ];

  for (const { regex, action } of patterns) {
    if (regex.test(lower)) return action;
  }

  return null;
}

function extractTextFromParts(parts: UIMessage['parts']): string {
  let text = '';
  for (const part of parts) {
    if (typeof part === 'object' && part !== null && 'type' in part) {
      const p = part as { type: string; text?: string };
      if (p.type === 'text' && typeof p.text === 'string') {
        text += p.text;
      }
    }
  }
  return text;
}