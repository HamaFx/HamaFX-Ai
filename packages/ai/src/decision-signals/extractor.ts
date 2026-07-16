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
 * Accepts both the assistant's UIMessage (for text extraction) and the
 * full AI SDK v5 `response.messages` array (for structured tool-call
 * inputs and tool-result outputs). Returns null when no directional
 * signal is found (hold, avoid, or no actionable recommendation).
 */
export function extractDecisionSignal(
  message: UIMessage,
  context: ExtractionContext,
  /** AI SDK v5 `response.messages` from `onFinish` — all messages in the turn. */
  modelMessages?: ReadonlyArray<{ role: string; content: unknown }>,
): DecisionSignalPayload | null {
  const parts = message.parts ?? [];

  // 1. Look for compute-risk tool data in model messages (C2 fix — the
  //    structured path was dead because findToolOutput searched for the
  //    UI-part shape that never appears in AI SDK v5 response.messages).
  const riskData = findToolDataInModelMessages(modelMessages ?? [], 'compute_risk');

  // 2. Look for plan tool data.
  const planData = findToolDataInModelMessages(modelMessages ?? [], 'plan');

  // 3. Try to get action from structured outputs or text.
  let action: DecisionAction | null = null;

  if (riskData?.input) {
    const side = riskData.input.side as string | undefined;
    if (side === 'long') action = 'buy';
    else if (side === 'short') action = 'sell';
  }

  if (!action && planData?.input) {
    const planAction = planData.input.action as string | undefined;
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

  // 5. Extract levels from compute-risk tool data.
  let entryLow: number | null = null;
  let entryHigh: number | null = null;
  let stopLoss: number | null = null;
  let takeProfit: number | null = null;
  const confidence: number | null = null;

  if (riskData) {
    const src = riskData.input ?? riskData.output;
    if (src) {
      const entry = src.entry as number | undefined;
      if (entry !== undefined) {
        entryLow = entry;
        entryHigh = entry;
      }
      const stop = src.stop as number | undefined;
      if (stop !== undefined) stopLoss = stop;
      const target = src.target as number | undefined;
      if (target !== undefined) takeProfit = target;
    }
  }

  // 6. Extract horizon from plan data or default to '3d'.
  let horizon: SignalHorizon = '3d';
  if (planData) {
    const src = planData.input ?? planData.output;
    if (src) {
      const planHorizon = src.horizon as string | undefined;
      if (planHorizon && isValidHorizon(planHorizon)) {
        horizon = planHorizon as SignalHorizon;
      }
    }
  }

  const bias = actionToBias(action);
  const sourceType: SignalSourceType = 'chat';

  // 7. Build metadata + provenance — track which tools informed this signal.
  const metadata: Record<string, unknown> = {
    reasoning: text.slice(0, 500),
  };

  // C2 fix — extract tool names from both UIMessage parts AND model messages.
  const invokedTools = extractToolNames(parts, modelMessages ?? []);

  const payload: DecisionSignalPayload = {
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
  // U5 — provenance: only include when tools were found (exactOptionalPropertyTypes).
  if (invokedTools.length > 0) {
    payload.provenance = { tools: invokedTools };
  }
  return payload;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Search AI SDK v5 model messages for tool-call input and tool-result output
 * for a given tool name. Returns both the input (from the assistant's
 * tool-call part) and the output (from the tool's result message) when found.
 *
 * C2 fix — replaces the old findToolOutput which looked for a UI-part shape
 * (`{ type: 'tool-compute_risk', output: ... }`) that never appears in AI SDK
 * v5 response.messages.
 */
function findToolDataInModelMessages(
  modelMessages: ReadonlyArray<{ role: string; content: unknown }>,
  toolName: string,
): { input?: Record<string, unknown>; output?: Record<string, unknown> } | null {
  let input: Record<string, unknown> | undefined;
  let output: Record<string, unknown> | undefined;

  for (const msg of modelMessages) {
    const content = msg.content;
    if (!Array.isArray(content)) continue;
    for (const part of content) {
      if (typeof part !== 'object' || part === null) continue;
      const p = part as Record<string, unknown>;
      // Assistant tool-call part: { type: 'tool-call', toolCallId, toolName, args }
      if (p.type === 'tool-call' && (p.toolName as string) === toolName) {
        const args = p.args as Record<string, unknown> | undefined;
        if (args && !input) input = args;
      }
      // Tool result part: { type: 'tool-result', toolCallId, toolName, output }
      if (p.type === 'tool-result' && (p.toolName as string) === toolName) {
        const out = p.output as Record<string, unknown> | undefined;
        if (out && !output) output = out;
      }
    }
  }

  if (!input && !output) return null;
  const result: { input?: Record<string, unknown>; output?: Record<string, unknown> } = {};
  if (input) result.input = input;
  if (output) result.output = output;
  return result;
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
 * C2 fix — tightened to require recommendation context, exclude negations,
 * and check avoid/hold BEFORE buy/sell to prevent mis-classification.
 */
function parseActionFromText(text: string): DecisionAction | null {
  if (!text) return null;
  const lower = text.toLowerCase();

  // Exclude sentences containing negation patterns.
  const hasNegation = /\b(don't|do not|wouldn't|would not|shouldn't|should not|avoid\s+(buying|going|entering|taking)|instead of|rather than)\b/i;

  // Check for explicit recommendation context patterns.
  // Match recommendation verbs followed by directional terms nearby.
  const recBuyPatterns = [
    /\b(?:recommend|suggest|favor|advise)\s+(?:a\s+)?(?:buy|long|bullish)/i,
    /\b(?:go\s+long|enter\s+long|open\s+(?:a\s+)?long)/i,
    /\b(?:strong\s+buy|buy\s+signal|bullish\s+setup)/i,
  ];
  const recSellPatterns = [
    /\b(?:recommend|suggest|favor|advise)\s+(?:a\s+)?(?:sell|short|bearish)/i,
    /\b(?:go\s+short|enter\s+short|open\s+(?:a\s+)?short)/i,
    /\b(?:strong\s+sell|sell\s+signal|bearish\s+setup)/i,
  ];

  // Check for avoid/hold first (before buy/sell).
  // C2 fix: only treat as 'avoid' when there's no negation and no recommendation.
  if (/\b(?:avoid|stay\s+out|do\s+not\s+(?:trade|enter)|skip)\b/i.test(lower)) {
    if (hasNegation.test(lower)) return null;
    for (const p of recBuyPatterns) { if (p.test(lower)) return null; }
    for (const p of recSellPatterns) { if (p.test(lower)) return null; }
    return 'avoid';
  }

  if (/\b(?:hold|wait|stand\s+aside|no\s+trade|stay\s+flat|remain\s+(?:on\s+the\s+)?sideline)/i.test(lower)) {
    return 'hold';
  }

  // Check recommendation patterns first.
  for (const p of recBuyPatterns) {
    if (p.test(lower)) return 'buy';
  }
  for (const p of recSellPatterns) {
    if (p.test(lower)) return 'sell';
  }

  // Fall back to simple keyword matching, but only near recommendation context.
  const recommendationSentences = lower
    .split(/[.!?]\s+/)
    .filter((s) => /\b(?:recommend|bias|setup|entry|signal|verdict|bottom\s+line|actionable|should|would|i'd|i would)\b/i.test(s));

  for (const sentence of recommendationSentences) {
    if (hasNegation.test(sentence)) continue;
    if (/\bbuy\b/.test(sentence) || /\blong\b/.test(sentence)) return 'buy';
    if (/\bsell\b/.test(sentence) || /\bshort\b/.test(sentence)) {
      // Don't match "sell-side" or "sell-off" as directional "sell".
      if (!/\bsell[ -]?(side|off)\b/i.test(sentence)) return 'sell';
    }
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

/** C2 fix — Extract tool names from both UIMessage parts AND model messages. */
function extractToolNames(
  parts: UIMessage['parts'],
  modelMessages: ReadonlyArray<{ role: string; content: unknown }>,
): string[] {
  const names = new Set<string>();
  // From UIMessage parts.
  for (const part of parts) {
    if (typeof part === 'object' && part !== null && 'type' in part) {
      const p = part as { type: string; toolName?: string };
      if (p.type === 'tool-call' && typeof p.toolName === 'string') {
        names.add(p.toolName);
      }
    }
  }
  // From model messages (C2 fix — the real tool-call parts live here).
  for (const msg of modelMessages) {
    const content = msg.content;
    if (!Array.isArray(content)) continue;
    for (const part of content) {
      if (typeof part === 'object' && part !== null && 'type' in part) {
        const p = part as { type: string; toolName?: string };
        if (p.type === 'tool-call' && typeof p.toolName === 'string') {
          names.add(p.toolName);
        }
      }
    }
  }
  return [...names].sort();
}