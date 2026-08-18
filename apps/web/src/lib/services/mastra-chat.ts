// SPDX-License-Identifier: Apache-2.0

import 'server-only';

import type { UIMessage } from 'ai';
import type { XauusdMastraRunResult, XauusdResearchReport } from '@kestrel/ai/mastra';
import {
  DEFAULT_MAX_DAILY_USD,
  appendAssistantMessage,
  appendUserMessage,
  estimateCostUsd,
  reserveTurnBudget,
} from '@kestrel/ai';
import { getUserWithSettings } from '@kestrel/db';

import { getServerEnv } from '@/lib/env';
import { createMastraChatMeta } from '@/lib/mastra-chat-meta';
import { runMastraXauusdResearch } from './mastra-xauusd';

export interface RunMastraXauusdChatInput {
  userId: string;
  threadId: string;
  userMessage: UIMessage;
  prompt: string;
  signal?: AbortSignal;
  followup?: boolean;
  priorReport?: XauusdResearchReport | null;
}

/**
 * Execute one feature-flagged Mastra turn using the same persistence and daily
 * budget guardrails as the legacy agent. The caller owns fallback policy.
 */
export async function runMastraXauusdChat(input: RunMastraXauusdChatInput): Promise<XauusdMastraRunResult & { runId: string; observedCost: number }> {
  const { settings } = await getUserWithSettings(input.userId);
  if (!settings) {
    throw new Error('User settings not found. Please complete onboarding.');
  }

  const env = getServerEnv();
  const budget = await reserveTurnBudget({
    userId: input.userId,
    maxDailyUsd: settings.maxDailyUsd ?? env.MAX_DAILY_USD ?? DEFAULT_MAX_DAILY_USD,
  });

  const runId = crypto.randomUUID();
  let completedRun: Awaited<ReturnType<typeof runMastraXauusdResearch>> | null = null;
  let observedCost = 0;

  try {
    // Use the same idempotency key as legacy chat so a fallback does not create
    // a duplicate user message when Mastra fails after persistence.
    await appendUserMessage(input.userId, input.threadId, input.userMessage);

    completedRun = await runMastraXauusdResearch({
      userId: input.userId,
      threadId: input.threadId,
      runId,
      prompt: input.prompt,
      ...(input.signal ? { signal: input.signal } : {}),
      ...(input.followup ? { followup: true } : {}),
      ...(input.priorReport ? { priorReport: input.priorReport } : {}),
    });

    observedCost = estimateCostUsd(
      completedRun.modelId,
      completedRun.stats.inputTokens,
      completedRun.stats.outputTokens,
    );

    const meta = createMastraChatMeta({
      runId,
      modelId: completedRun.modelId,
      providerId: completedRun.providerId,
      researchStatus: completedRun.packet.status,
      dataQuality: completedRun.packet.dataQuality,
      packetId: completedRun.packet.packetId,
      observedCost,
      report: completedRun.report,
    });
    const assistantMessage: UIMessage = {
      id: crypto.randomUUID(),
      role: 'assistant',
      parts: [
        { type: 'text', text: completedRun.result.text },
        { type: 'data-multi-agent-meta', data: meta } as UIMessage['parts'][number],
      ],
    };
    await appendAssistantMessage(
      input.userId,
      input.threadId,
      assistantMessage,
      { idempotencyKey: `mastra:${input.threadId}:${input.userMessage.id}:assistant` },
    );

    await budget.reconcile(observedCost);
    return { ...completedRun, runId, observedCost };
  } catch (error) {
    // If the provider completed but persistence failed, retain the actual
    // spend. If no model run completed, release the admission reservation so
    // legacy fallback can reserve its own budget safely.
    if (completedRun) {
      await budget.reconcile(observedCost);
    } else {
      await budget.release();
    }
    throw error;
  }
}
