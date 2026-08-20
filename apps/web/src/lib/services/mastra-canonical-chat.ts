// SPDX-License-Identifier: Apache-2.0

import 'server-only';

import {
  appendAssistantMessage,
  appendUserMessage,
  DEFAULT_MAX_DAILY_USD,
  estimateCostUsd,
  listMessages,
  reserveTurnBudget,
} from '@kestrel/ai';
import { runMastraCanonicalChat, type MastraCanonicalChatResult } from '@kestrel/ai/mastra';
import { getUserWithSettings } from '@kestrel/db';
import type { UIMessage } from 'ai';

import { getServerEnv } from '@/lib/env';

export interface RunMastraCanonicalChatInput {
  userId: string;
  threadId: string;
  userMessage: UIMessage;
  customInstructions?: string;
  modelOverride?: string | null;
  signal?: AbortSignal;
}

export async function runMastraCanonicalChatService(
  input: RunMastraCanonicalChatInput,
): Promise<MastraCanonicalChatResult & { runId: string; observedCost: number; messageId: string }> {
  const { settings } = await getUserWithSettings(input.userId);
  if (!settings) throw new Error('User settings not found. Please complete onboarding.');

  const env = getServerEnv();
  const runId = crypto.randomUUID();
  const budget = await reserveTurnBudget({
    userId: input.userId,
    maxDailyUsd: settings.maxDailyUsd ?? env.MAX_DAILY_USD ?? DEFAULT_MAX_DAILY_USD,
    correlation: { threadId: input.threadId, runId },
  });
  let result: MastraCanonicalChatResult | null = null;

  try {
    // Use the same transport idempotency key as the legacy chat path. If
    // Mastra fails after this write and the route falls back, the legacy
    // appendUserMessage call becomes a no-op instead of duplicating the turn.
    await appendUserMessage(input.userId, input.threadId, input.userMessage);
    const historyRows = await listMessages(input.userId, input.threadId, 60);
    const currentUserKey = `ui:${input.userMessage.id}`;
    const history: UIMessage[] = historyRows
      // The current user message was persisted above. Exclude that exact
      // idempotency row so canonical-chat receives it once via `latest`, not
      // once from history and once from the request body.
      .filter((row) => row.idempotencyKey !== currentUserKey)
      .map((row) => ({
        id: row.id,
        role: row.role === 'assistant' || row.role === 'system' ? row.role : 'user',
        parts:
          Array.isArray(row.parts) && row.parts.length > 0
            ? (row.parts as UIMessage['parts'])
            : [{ type: 'text', text: row.content }],
      }));
    const runEnv = env;
    result = await runMastraCanonicalChat({
      userId: input.userId,
      threadId: input.threadId,
      userMessage: input.userMessage,
      history,
      settings,
      env: runEnv,
      ...(input.customInstructions ? { customInstructions: input.customInstructions } : {}),
      ...(input.modelOverride !== undefined ? { modelOverride: input.modelOverride } : {}),
      ...(input.signal ? { signal: input.signal } : {}),
      runId,
    });
    const observedCost = estimateCostUsd(
      result.modelId,
      result.stats.inputTokens,
      result.stats.outputTokens,
    );
    const assistantMessage: UIMessage = {
      id: crypto.randomUUID(),
      role: 'assistant',
      parts: [
        { type: 'text', text: result.text },
        {
          type: 'data-multi-agent-meta',
          data: {
            engine: 'mastra',
            canonical: true,
            runId,
            routingDomain: result.routing.domain,
            modelId: result.modelId,
            providerId: result.providerId,
            observedCost,
            totalLatencyMs: result.totalLatencyMs,
            toolNames: result.toolNames,
          },
        } as UIMessage['parts'][number],
      ],
    };
    const persisted = await appendAssistantMessage(input.userId, input.threadId, assistantMessage, {
      idempotencyKey: `mastra-canonical:${input.threadId}:${input.userMessage.id}:assistant`,
    });
    await budget.reconcile(observedCost);
    return {
      ...result,
      runId,
      observedCost,
      messageId: persisted.messageId,
    };
  } catch (error) {
    if (result) await budget.reconcile(result.totalCostUsd);
    else await budget.release();
    throw error;
  }
}
