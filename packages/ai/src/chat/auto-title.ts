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

// P0-1 — Extracted from agent.ts. This is the "slow tail" of onFinish
// (Phase 2 hardening §8): runs the auto-title generator on first turn
// and persists the result. Failures are logged but never crash the
// stream because the response is already closed by the time we reach
// this code.

import { pickAiEnv } from '@hamafx/shared';
import { logErrorContext } from '@hamafx/shared/logger';
import type { UserSettingsRow } from '@hamafx/db/schema';
import type { RunChatArgs } from '../types';
import { deriveTitleModel } from '../model';
import { getThread, listMessages, recordTelemetry, updateThreadTitle } from '../persistence';
import { generateTitle } from '../title';

/**
 * Slow tail of `onFinish` (Phase 2 hardening §8). Runs the auto-title
 * generator on first turn and persists the result; failures are logged
 * but never crash the stream because the response is already closed by
 * the time we reach this code.
 */
export async function runAutoTitleBackground(args: {
  threadId: string;
  userId: string;
  userSettings: UserSettingsRow;
  env: RunChatArgs['env'];
  signal: AbortSignal | null;
}): Promise<void> {
  const { threadId, userId, userSettings, env, signal } = args;
  try {
    const thread = await getThread(userId, threadId);
    if (!thread || thread.title !== null) return;
    const all = await listMessages(userId, threadId, 50);
    const firstUser = (all.find((m) => m.role === 'user')?.content ?? '').slice(0, 1024);
    const firstAssistant = (all.find((m) => m.role === 'assistant')?.content ?? '').slice(0, 1024);
    if (firstUser.length === 0 || firstAssistant.length === 0) return;

    const titleStartedAt = Date.now();
    const titleModelId =
      deriveTitleModel(userSettings, env) ?? env.AI_DEFAULT_MODEL;
    const titleArgs: Parameters<typeof generateTitle>[0] = {
      threadId,
      firstUser,
      firstAssistant,
      titleModelId,
      env: pickAiEnv(env),
    };
    if (signal) titleArgs.signal = signal;
    const titleResult = await generateTitle(titleArgs);
    await updateThreadTitle(threadId, titleResult.title, titleResult.source);
    const kind: 'title_generated' | 'title_skipped_budget' | 'title_failed' =
      titleResult.source === 'llm'
        ? 'title_generated'
        : titleResult.reason === 'budget'
          ? 'title_skipped_budget'
          : 'title_failed';
    await recordTelemetry({
      userId,
      threadId,
      messageId: null,
      model: titleModelId,
      inputTokens: titleResult.inputTokens ?? 0,
      outputTokens: titleResult.outputTokens ?? 0,
      toolCalls: 0,
      ms: titleResult.latencyMs ?? Date.now() - titleStartedAt,
      kind,
    });
  } catch (err) {
    logErrorContext(err, 'auto-title_background_failed', { threadId }, 'ai');
  }
}
