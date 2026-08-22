// SPDX-License-Identifier: Apache-2.0

import 'server-only';

import type { XauusdMastraConversationStream } from '@kestrel/ai/mastra';
import { runXauusdMastraConversationStream } from '@kestrel/ai/mastra';
import {
  appendAssistantMessage,
  appendUserMessage,
  DEFAULT_MAX_DAILY_USD,
  estimateCostUsd,
  reserveTurnBudget,
} from '@kestrel/ai';
import { getThread, getUserWithSettings } from '@kestrel/db';
import { notFound } from '@kestrel/shared';
import type { UIMessage } from 'ai';

import { getServerEnv } from '@/lib/env';
import { createMastraChatMeta } from '@/lib/mastra-chat-meta';
import { mastraStreamResponse } from '@/lib/services/mastra-stream-response';
import { maybeGenerateThreadTitle } from '@/lib/services/mastra-thread-title';

import type { XauusdResearchReport } from '@kestrel/ai/mastra';

export interface RunMastraXauusdConversationStreamInput {
  userId: string;
  threadId: string;
  userMessage: UIMessage;
  prompt: string;
  modelOverride?: string | null;
  signal?: AbortSignal;
  priorReport?: XauusdResearchReport | null;
}

export async function runMastraXauusdConversationStreamChat(
  input: RunMastraXauusdConversationStreamInput,
): Promise<Response> {
  const thread = await getThread(input.userId, input.threadId);
  if (!thread) throw notFound('Thread not found');

  const { settings } = await getUserWithSettings(input.userId);
  if (!settings) throw new Error('User settings not found. Please complete onboarding.');

  const env = getServerEnv();
  const budget = await reserveTurnBudget({
    userId: input.userId,
    maxDailyUsd: settings.maxDailyUsd ?? env.MAX_DAILY_USD ?? DEFAULT_MAX_DAILY_USD,
  });

  const runId = crypto.randomUUID();

  try {
    await appendUserMessage(input.userId, input.threadId, input.userMessage);

    const stream: XauusdMastraConversationStream = await runXauusdMastraConversationStream({
      prompt: input.prompt,
      userId: input.userId,
      threadId: input.threadId,
      runId,
      settings,
      env,
      ...(input.modelOverride !== undefined ? { modelOverride: input.modelOverride } : {}),
      ...(input.signal ? { signal: input.signal } : {}),
      ...(input.priorReport ? { followup: true, priorReport: input.priorReport } : {}),
    });

    const messageId = crypto.randomUUID();
    let observedCost = 0;

    async function* text(): AsyncIterable<string> {
      try {
        yield* stream.text;
        const completed = await stream.completion;
        observedCost = estimateCostUsd(
          completed.modelId,
          completed.stats.inputTokens,
          completed.stats.outputTokens,
        );
        const meta = createMastraChatMeta({
          runId,
          modelId: completed.modelId,
          providerId: completed.providerId,
          researchStatus: completed.packet.status,
          dataQuality: completed.packet.dataQuality,
          packetId: completed.packet.packetId,
          observedCost,
          report: null,
        });
        const assistantMessage: UIMessage = {
          id: messageId,
          role: 'assistant',
          parts: [
            { type: 'text', text: completed.result.text },
            { type: 'data-multi-agent-meta', data: meta } as UIMessage['parts'][number],
          ],
        };
        await appendAssistantMessage(input.userId, input.threadId, assistantMessage, {
          idempotencyKey: `mastra:${input.threadId}:${input.userMessage.id}:assistant`,
        });
        void maybeGenerateThreadTitle({
          userId: input.userId,
          threadId: input.threadId,
          firstUser: input.prompt,
          firstAssistant: completed.result.text,
        });
        await budget.reconcile(observedCost);
      } catch (error) {
        await budget.release();
        throw error;
      }
    }

    return mastraStreamResponse(text(), messageId, {
      meta: { id: messageId, data: { engine: 'mastra', agent: 'mastra-xauusd', runId } },
      signal: input.signal,
      onAbort: async () => {
        // Persist an interrupted marker so the orphaned user message has
        // context when the user retries. The idempotency key means a
        // successful retry overwrites this with the real assistant reply.
        await appendAssistantMessage(
          input.userId,
          input.threadId,
          {
            id: messageId,
            role: 'assistant',
            parts: [{ type: 'text', text: '_Stream interrupted — please retry._' }],
          },
          { idempotencyKey: `mastra:${input.threadId}:${input.userMessage.id}:assistant` },
        ).catch(() => {});
      },
    });
  } catch (error) {
    await budget.release();
    throw error;
  }
}