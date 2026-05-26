// Top-level agent entrypoint. The route handler calls `runChat()`; we own
// model selection, prompt assembly, tool wiring, persistence, telemetry,
// and the daily-budget guardrail in one place so route code stays a thin
// HTTP shell.

import {
  convertToModelMessages,
  stepCountIs,
  streamText,
  type ModelMessage,
  type UIMessage,
} from 'ai';

import { type ServerEnv } from '@hamafx/shared';

import { buildLiveSnapshot } from './context';
import { enforceDailyBudget } from './cost';
import { appendAssistantMessage, appendUserMessage, listMessages, recordTelemetry } from './persistence';
import { buildSystemPrompt } from './prompt/system';
import { tools } from './tools';

export interface RunChatArgs {
  threadId: string;
  /** Most recent user UIMessage to append + answer. */
  userMessage: UIMessage;
  /** Whole env — caller passes the already-validated ServerEnv. */
  env: Pick<ServerEnv, 'AI_DEFAULT_MODEL' | 'MAX_DAILY_USD' | 'MAX_TOOL_ITERATIONS' | 'LOG_PROMPTS'>;
  /** Optional model override (e.g. coming from thread.modelOverride). */
  modelOverride?: string | null;
  /** Aborts streaming + tool calls when the client disconnects. */
  signal?: AbortSignal;
}

/**
 * Runs one chat turn end-to-end:
 *   1. Daily-budget guardrail.
 *   2. Persist incoming user message.
 *   3. Load history + build LIVE_SNAPSHOT.
 *   4. streamText with tools.
 *   5. On finish: persist assistant message + telemetry.
 *
 * Returns the AI SDK stream result; the caller pipes it to the response via
 * `result.toUIMessageStreamResponse()`.
 */
export async function runChat(args: RunChatArgs) {
  const { threadId, userMessage, env, modelOverride, signal } = args;
  const startedAt = Date.now();

  // 1) Hard ceiling. Throws BudgetExceededError → route handler maps to 503.
  await enforceDailyBudget(env.MAX_DAILY_USD);

  // 2) Persist the user message before we start streaming. If the model fails
  //    we still want the prompt in history so retries can resume.
  await appendUserMessage(threadId, userMessage);

  // 3) Load history + ambient snapshot.
  const [history, snapshot] = await Promise.all([
    listMessages(threadId, 60),
    buildLiveSnapshot(signal ? { signal } : {}),
  ]);

  const modelMessages: ModelMessage[] = convertToModelMessages(
    history.map(
      (m) =>
        ({
          id: m.id,
          role: m.role,
          parts: (m.parts ?? [{ type: 'text', text: m.content }]) as UIMessage['parts'],
        }) as UIMessage,
    ),
  );

  const model = modelOverride ?? env.AI_DEFAULT_MODEL;
  const systemPrompt = buildSystemPrompt(snapshot);

  if (env.LOG_PROMPTS) {
    console.info('[ai] system prompt:\n%s', systemPrompt);
    console.info('[ai] history (%d msgs)', modelMessages.length);
  }

  // 4) Stream. AI Gateway model strings ("openai/gpt-4.1") are accepted
  //    directly when AI_GATEWAY_API_KEY is set.
  const streamArgs: Parameters<typeof streamText>[0] = {
    model,
    system: systemPrompt,
    messages: modelMessages,
    tools,
    stopWhen: stepCountIs(env.MAX_TOOL_ITERATIONS),

    onFinish: async ({ usage, finishReason, response }) => {
      try {
        const assistantUiMsg = response.messages.at(-1);
        let messageId: string | null = null;
        if (assistantUiMsg && assistantUiMsg.role === 'assistant') {
          // Convert the model-shaped response back to a UIMessage shape.
          const ui: UIMessage = {
            id: crypto.randomUUID(),
            role: 'assistant',
            parts: Array.isArray(assistantUiMsg.content)
              ? (assistantUiMsg.content as UIMessage['parts'])
              : [{ type: 'text', text: String(assistantUiMsg.content) }],
          };
          ({ messageId } = await appendAssistantMessage(threadId, ui));
        }
        await recordTelemetry({
          threadId,
          messageId,
          model,
          inputTokens: usage?.inputTokens ?? 0,
          outputTokens: usage?.outputTokens ?? 0,
          toolCalls: countToolCalls(response.messages),
          ms: Date.now() - startedAt,
        });
        if (env.LOG_PROMPTS) {
          console.info('[ai] finish reason=%s tokens=%o', finishReason, usage);
        }
      } catch (err) {
        // Persistence failures must not crash the stream — log and move on.
        console.error('[ai] persistence/telemetry failed', err);
      }
    },
  };
  if (signal) streamArgs.abortSignal = signal;

  const result = streamText(streamArgs);

  return result;
}

function countToolCalls(messages: readonly { content: unknown }[]): number {
  let n = 0;
  for (const m of messages) {
    if (!Array.isArray(m.content)) continue;
    for (const part of m.content) {
      if (
        part &&
        typeof part === 'object' &&
        'type' in part &&
        (part as { type: string }).type === 'tool-call'
      ) {
        n += 1;
      }
    }
  }
  return n;
}
