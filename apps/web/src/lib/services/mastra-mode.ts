// SPDX-License-Identifier: Apache-2.0

import 'server-only';

import {
  appendAssistantMessage,
  appendUserMessage,
  DEFAULT_MAX_DAILY_USD,
  reserveTurnBudget,
} from '@kestrel/ai';
import { runMastraMode, type MastraAnalysisMode, type MastraModeResult } from '@kestrel/ai/mastra';
import { getUserWithSettings } from '@kestrel/db';
import type { UIMessage } from 'ai';

import { getServerEnv } from '@/lib/env';

export interface RunMastraModeChatInput {
  userId: string;
  threadId: string;
  userMessage: UIMessage;
  prompt: string;
  symbol: string;
  mode: MastraAnalysisMode;
  modelOverride?: string | null;
  signal?: AbortSignal;
}

export async function runMastraModeChat(
  input: RunMastraModeChatInput,
): Promise<MastraModeResult & { runId: string; observedCost: number }> {
  const { settings } = await getUserWithSettings(input.userId);
  if (!settings) throw new Error('User settings not found. Please complete onboarding.');

  const env = getServerEnv();
  const budget = await reserveTurnBudget({
    userId: input.userId,
    maxDailyUsd: settings.maxDailyUsd ?? env.MAX_DAILY_USD ?? DEFAULT_MAX_DAILY_USD,
  });
  const runId = crypto.randomUUID();
  let result: MastraModeResult | null = null;

  try {
    await appendUserMessage(input.userId, input.threadId, input.userMessage, {
      idempotencyKey: `mastra-mode:${input.threadId}:${input.userMessage.id}:user`,
    });
    result = await runMastraMode({
      prompt: input.prompt,
      symbol: input.symbol,
      userId: input.userId,
      threadId: input.threadId,
      runId,
      mode: input.mode,
      ...(input.modelOverride !== undefined ? { modelOverride: input.modelOverride } : {}),
      settings,
      env,
      ...(input.signal ? { signal: input.signal } : {}),
      telemetryKind: 'mastra_mode',
    });

    const assistantMessage: UIMessage = {
      id: crypto.randomUUID(),
      role: 'assistant',
      parts: [
        { type: 'text', text: result.finalText },
        {
          type: 'data-multi-agent-meta',
          data: {
            engine: 'mastra',
            runId,
            mode: result.mode,
            symbol: result.symbol,
            packetId: result.packet.packetId,
            dataQuality: result.packet.dataQuality,
            totalCostUsd: result.totalCostUsd,
            totalLatencyMs: result.totalLatencyMs,
            agentOpinions: result.agentOpinions,
          },
        } as UIMessage['parts'][number],
      ],
    };
    const persisted = await appendAssistantMessage(input.userId, input.threadId, assistantMessage, {
      idempotencyKey: `mastra-mode:${input.threadId}:${input.userMessage.id}:assistant`,
    });
    const observedCost = result.totalCostUsd;
    await budget.reconcile(observedCost);
    return { ...result, runId, observedCost, messageId: persisted.messageId };
  } catch (error) {
    if (result) await budget.reconcile(result.totalCostUsd);
    else await budget.release();
    throw error;
  }
}
