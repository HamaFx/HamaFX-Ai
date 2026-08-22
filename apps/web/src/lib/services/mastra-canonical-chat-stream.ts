// SPDX-License-Identifier: Apache-2.0

import 'server-only';

import type {
  MastraCanonicalChatStream,
  RunMastraCanonicalChatArgs,
} from '@kestrel/ai/mastra';
import {
  runMastraCanonicalChatStream,
} from '@kestrel/ai/mastra';
import {
  appendAssistantMessage,
  appendUserMessage,
  DEFAULT_MAX_DAILY_USD,
  estimateCostUsd,
  extractUserMessageText,
  listMessages,
  reserveTurnBudget,
} from '@kestrel/ai';
import { getUserWithSettings } from '@kestrel/db';
import type { UIMessage } from 'ai';

import { getServerEnv } from '@/lib/env';
import { mastraStreamResponse } from '@/lib/services/mastra-stream-response';
import { maybeGenerateThreadTitle } from '@/lib/services/mastra-thread-title';

export interface RunMastraCanonicalChatStreamInput {
  userId: string;
  threadId: string;
  userMessage: UIMessage;
  customInstructions?: string;
  modelOverride?: string | null;
  signal?: AbortSignal;
}

export async function runMastraCanonicalChatStreamService(
  input: RunMastraCanonicalChatStreamInput,
): Promise<Response> {
  const { settings } = await getUserWithSettings(input.userId);
  if (!settings) throw new Error('User settings not found. Please complete onboarding.');

  const env = getServerEnv();
  const runId = crypto.randomUUID();
  const budget = await reserveTurnBudget({
    userId: input.userId,
    maxDailyUsd: settings.maxDailyUsd ?? env.MAX_DAILY_USD ?? DEFAULT_MAX_DAILY_USD,
    correlation: { threadId: input.threadId, runId },
  });

  try {
    await appendUserMessage(input.userId, input.threadId, input.userMessage);
    const historyRows = await listMessages(input.userId, input.threadId, 60);
    const currentUserKey = `ui:${input.userMessage.id}`;
    const history: UIMessage[] = historyRows
      .filter((row) => row.idempotencyKey !== currentUserKey)
      .map((row) => ({
        id: row.id,
        role: row.role === 'assistant' || row.role === 'system' ? row.role : 'user',
        parts:
          Array.isArray(row.parts) && row.parts.length > 0
            ? (row.parts as UIMessage['parts'])
            : [{ type: 'text', text: row.content }],
      }));

    const aiArgs: RunMastraCanonicalChatArgs = {
      userId: input.userId,
      threadId: input.threadId,
      userMessage: input.userMessage,
      history,
      settings,
      env,
      ...(input.customInstructions ? { customInstructions: input.customInstructions } : {}),
      ...(input.modelOverride !== undefined ? { modelOverride: input.modelOverride } : {}),
      ...(input.signal ? { signal: input.signal } : {}),
      runId,
    };

    const stream: MastraCanonicalChatStream = await runMastraCanonicalChatStream(aiArgs);
    const messageId = crypto.randomUUID();

    // Build a lazy text iterable that yields chunks immediately, then
    // persists and emits metadata once the stream completes.
    async function* text(): AsyncIterable<string> {
      try {
        yield* stream.text;
        const completed = await stream.completion;
        const observedCost = estimateCostUsd(
          completed.modelId,
          completed.stats.inputTokens,
          completed.stats.outputTokens,
        );
        const assistantMessage: UIMessage = {
          id: messageId,
          role: 'assistant',
          parts: [
            { type: 'text', text: completed.text },
            {
              type: 'data-multi-agent-meta',
              data: {
                engine: 'mastra',
                canonical: true,
                runId,
                routingDomain: completed.routing.domain,
                modelId: completed.modelId,
                providerId: completed.providerId,
                observedCost,
                totalLatencyMs: completed.totalLatencyMs,
                toolNames: completed.toolNames,
              },
            } as UIMessage['parts'][number],
          ],
        };
        await appendAssistantMessage(input.userId, input.threadId, assistantMessage, {
          idempotencyKey: `mastra-canonical:${input.threadId}:${input.userMessage.id}:assistant`,
        });
        void maybeGenerateThreadTitle({
          userId: input.userId,
          threadId: input.threadId,
          firstUser: extractUserMessageText(input.userMessage),
          firstAssistant: completed.text,
        });
        await budget.reconcile(observedCost);
      } catch (error) {
        // Best-effort release if no model run completed
        await budget.release();
        throw error;
      }
    }

    return mastraStreamResponse(text(), messageId, {
      meta: { id: messageId, data: { engine: 'mastra', canonical: true, runId } },
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
          { idempotencyKey: `mastra-canonical:${input.threadId}:${input.userMessage.id}:assistant` },
        ).catch(() => {});
      },
    });
  } catch (error) {
    await budget.release();
    throw error;
  }
}