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

// Multi-Agent Orchestration — shared context builder.

import { buildLiveSnapshot } from '../context';
import { buildSystemPrompt } from '../prompt/system';
import type { UserSettingsRow } from '@hamafx/db/schema';
import type { UIMessage } from 'ai';
import type { SharedContext, MultiAgentEnv } from './types';

function userContextFromSettings(displayName: string | null, settings: UserSettingsRow) {
  return {
    displayName: displayName ?? '',
    defaultSymbol: settings.defaultSymbol as 'XAUUSD' | 'EURUSD' | 'GBPUSD' | 'USDJPY' | 'BTCUSD' | 'ETHUSD',
    timezone: settings.timezone,
    language: settings.language,
  };
}

export interface BuildContextArgs {
  symbol: string;
  userId: string;
  userMessage: UIMessage;
  history: UIMessage[];
  userSettings: UserSettingsRow;
  displayName: string | null;
  customInstructions?: string;
  env: MultiAgentEnv;
  signal: AbortSignal | null;
}

export async function buildSharedContext(args: BuildContextArgs): Promise<SharedContext> {
  const { symbol, userId, userMessage, history, userSettings, customInstructions, env, signal } = args;
  const snapshot = await buildLiveSnapshot({ signal: signal ?? undefined, userId });
  const ctx: SharedContext = { symbol, snapshot, userSettings, userMessage, history, signal, env };
  if (customInstructions !== undefined) ctx.customInstructions = customInstructions;
  return ctx;
}

export function buildSharedSystemPrompt(ctx: SharedContext, displayName: string | null): string {
  const userCtx = userContextFromSettings(displayName, ctx.userSettings);
  const basePrompt = buildSystemPrompt(ctx.snapshot, userCtx);
  let prompt = basePrompt;
  if (ctx.customInstructions && ctx.customInstructions.trim().length > 0) {
    prompt += `\n\n<USER_CUSTOM_INSTRUCTIONS>\n${ctx.customInstructions}\n</USER_CUSTOM_INSTRUCTIONS>`;
  }
  return prompt;
}

export function extractUserMessageText(message: UIMessage): string {
  if (Array.isArray(message.parts) && message.parts.length > 0) {
    return message.parts
      .filter((p): p is { type: 'text'; text: string } =>
        typeof p === 'object' && p !== null && (p as { type?: string }).type === 'text' && typeof (p as { text?: unknown }).text === 'string')
      .map((p) => p.text)
      .join('\n');
  }
  // UIMessage in AI SDK v5 doesn't have a `content` property — use type-safe access.
  const content = (message as unknown as { content?: string }).content;
  return content ?? '';
}