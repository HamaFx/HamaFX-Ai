/**
 * Copyright 2026 Kestrel
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

// P0-2 — Extracted from agent.ts. Assembles the per-turn system prompt
// (base + user context + rolling-summary note + custom instructions) and
// applies context-window-aware truncation. Keeps agent.ts as a thin
// orchestrator and gives this pure-ish stage a focused unit-test surface.

import type { ModelMessage } from 'ai';
import type { UserSettingsRow } from '@kestrel/db/schema';

import { buildSystemPrompt, userContextFromSettings, type LiveSnapshot } from '../prompt/system';
import { estimateContextUsage } from '../token-estimate';
import { recordStep } from '../diagnostics';

export interface BuildTurnSystemPromptArgs {
  snapshot: LiveSnapshot | null;
  displayName: string | null;
  userSettings: UserSettingsRow;
  /** Rolling-summary note folded in ahead of the base system prompt. */
  compactionExtraSystem?: string | null | undefined;
  customInstructions?: string | undefined;
  resolvedModelId: string;
  modelMessages: ModelMessage[];
}

export interface TurnSystemPrompt {
  systemPrompt: string;
  /** Messages after any context-window truncation. */
  effectiveMessages: ModelMessage[];
}

/**
 * Build the system prompt and truncate message history to fit the resolved
 * model's context window. Returns both the final prompt and the (possibly
 * reduced) message list so the caller can pass them straight to streamText.
 */
export function buildTurnSystemPrompt(args: BuildTurnSystemPromptArgs): TurnSystemPrompt {
  const {
    snapshot,
    displayName,
    userSettings,
    compactionExtraSystem,
    customInstructions,
    resolvedModelId,
    modelMessages,
  } = args;

  const baseSystem = buildSystemPrompt(
    snapshot,
    userContextFromSettings(displayName ?? null, userSettings),
  );
  let systemPrompt = compactionExtraSystem
    ? `${compactionExtraSystem}\n\n${baseSystem}`
    : baseSystem;

  if (customInstructions && customInstructions.trim().length > 0) {
    systemPrompt += `\n\n<USER_CUSTOM_INSTRUCTIONS>\n${customInstructions}\n</USER_CUSTOM_INSTRUCTIONS>`;
  }

  // F4 — Context-window-aware token estimation.
  let effectiveMessages = modelMessages;
  const totalContentLen = effectiveMessages.reduce(
    (sum, m) =>
      sum + (typeof m.content === 'string' ? m.content.length : JSON.stringify(m.content).length),
    0,
  );
  const contextEstimate = estimateContextUsage(
    resolvedModelId,
    systemPrompt.length,
    effectiveMessages.length,
    totalContentLen,
  );
  if (contextEstimate.warningNote) {
    systemPrompt = `${contextEstimate.warningNote}\n\n${systemPrompt}`;
  }
  if (contextEstimate.shouldTruncate && contextEstimate.suggestedKeepCount) {
    recordStep('context_truncation', {
      estimatedTokens: contextEstimate.estimatedTokens,
      contextLimit: contextEstimate.contextLimit,
      originalCount: effectiveMessages.length,
      keptCount: contextEstimate.suggestedKeepCount,
    });
    effectiveMessages = effectiveMessages.slice(-contextEstimate.suggestedKeepCount);
  }

  return { systemPrompt, effectiveMessages };
}
