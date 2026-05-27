// Tool: summarize_thread.
//
// Builds a one-paragraph synopsis of the active chat thread plus three
// durable insights, optionally embedding the synopsis into
// `memory_embeddings` so future turns can recall it via
// `search_knowledge`. The active thread is identified via the same
// per-turn context we use for `analyze_chart_image`, set by the agent
// before `streamText` runs.
//
// Budget-guarded: when the daily AI budget is exhausted we emit a
// deterministic fallback synopsis pulled from the most recent messages
// rather than spending more on a memory side-effect.

import type { ServerEnv } from '@hamafx/shared';
import {
  SummarizeThreadInputSchema,
  SymbolSchema,
  type SummarizeThreadOutput,
  type Symbol,
  type ThreadInsight,
} from '@hamafx/shared';
import { generateText } from 'ai';
import type { z } from 'zod';

import { dailySpendUsd } from '../cost';
import { rememberThreadSynopsis } from '../memory/memory-index';
import { resolveModel } from '../model';
import { listMessages } from '../persistence';

const InputSchema = SummarizeThreadInputSchema;

declare module '@hamafx/shared' {
  interface ToolIOMap {
    summarize_thread: { input: z.infer<typeof InputSchema> };
  }
}

interface SummarizeThreadContext {
  threadId: string;
  env: Pick<
    ServerEnv,
    | 'AI_GATEWAY_API_KEY'
    | 'GOOGLE_GENERATIVE_AI_API_KEY'
    | 'GOOGLE_VERTEX_PROJECT'
    | 'GOOGLE_VERTEX_LOCATION'
    | 'GOOGLE_APPLICATION_CREDENTIALS_JSON'
    | 'GOOGLE_APPLICATION_CREDENTIALS'
    | 'AI_SUMMARY_MODEL'
    | 'AI_DEFAULT_MODEL'
    | 'AI_EMBEDDING_MODEL'
    | 'MAX_DAILY_USD'
    | 'LOG_PROMPTS'
  >;
}

let context: SummarizeThreadContext | null = null;

/** Set by the agent before `streamText`. Idempotent on null reset. */
export function setSummarizeThreadContext(ctx: SummarizeThreadContext | null): void {
  context = ctx;
}

const SYSTEM_PROMPT =
  'You synthesise the active trading-chat thread into JSON. Output JSON ONLY: { "synopsis": "<3-5 sentence paragraph>", "insights": [{ "text": "<short imperative>", "symbol": "XAUUSD"|"EURUSD"|"GBPUSD"|null }, ...] }. Provide 3 insights. No greetings, no preamble, no markdown fences.';

const NO_CONTEXT_OUTPUT = (threadId: string): SummarizeThreadOutput => ({
  threadId,
  asOf: Date.now(),
  synopsis: 'No chat context — call this tool from inside a chat turn.',
  insights: [],
  remembered: false,
});

export const summarizeThreadTool = {
  description:
    "One-paragraph synopsis of the active chat thread plus three durable insights. Use when the user asks 'wrap this up', 'TL;DR what we just discussed', or wants to save the conclusion for later. With `remember=true` the synopsis is embedded into the memory index so future turns can retrieve it via `search_knowledge`.",
  inputSchema: InputSchema,
  execute: async (input: z.infer<typeof InputSchema>): Promise<SummarizeThreadOutput> => {
    if (!context) return NO_CONTEXT_OUTPUT('');
    const { threadId, env } = context;
    const messages = await listMessages(threadId, input.messageWindow);
    if (messages.length === 0) {
      return {
        threadId,
        asOf: Date.now(),
        synopsis: 'Thread has no messages yet.',
        insights: [],
        remembered: false,
      };
    }

    const transcript = messages
      .map((m) => `${m.role.toUpperCase()}: ${m.content.slice(0, 600)}`)
      .join('\n')
      .slice(0, 8_000);

    let synopsis = '';
    let insights: ThreadInsight[] = [];

    let llmAllowed = true;
    try {
      const spent = await dailySpendUsd();
      if (spent >= env.MAX_DAILY_USD) llmAllowed = false;
    } catch {
      llmAllowed = false;
    }

    if (llmAllowed) {
      try {
        const modelId =
          env.AI_SUMMARY_MODEL ?? env.AI_DEFAULT_MODEL ?? 'google-vertex/gemini-2.5-flash';
        const { text } = await generateText({
          model: resolveModel(modelId, env),
          system: SYSTEM_PROMPT,
          prompt: transcript,
        });
        const parsed = parseModelJson(text);
        if (parsed) {
          synopsis = parsed.synopsis;
          insights = parsed.insights;
        }
      } catch (err) {
        if (env.LOG_PROMPTS) console.warn('[summarize_thread] LLM failed', err);
      }
    }

    if (synopsis.length === 0) {
      synopsis = deterministicSynopsis(messages.map((m) => m.content));
      insights = [];
    }

    let remembered = false;
    if (input.remember) {
      try {
        await rememberThreadSynopsis({
          threadId,
          synopsis,
          insights,
          env,
        });
        remembered = true;
      } catch (err) {
        if (env.LOG_PROMPTS) console.warn('[summarize_thread] remember failed', err);
      }
    }

    return {
      threadId,
      asOf: Date.now(),
      synopsis,
      insights,
      remembered,
    };
  },
};

// ---------------------------------------------------------------------------
// helpers
// ---------------------------------------------------------------------------

function deterministicSynopsis(contents: string[]): string {
  const lastUser =
    [...contents].reverse().find((c) => c.length > 8) ??
    'Trading copilot conversation in progress.';
  return lastUser.slice(0, 500);
}

interface ParsedModelJson {
  synopsis: string;
  insights: ThreadInsight[];
}

function parseModelJson(text: string): ParsedModelJson | null {
  const trimmed = text
    .trim()
    .replace(/^```(?:json)?/i, '')
    .replace(/```$/, '')
    .trim();
  let parsed: unknown;
  try {
    parsed = JSON.parse(trimmed);
  } catch {
    return null;
  }
  if (typeof parsed !== 'object' || parsed === null) return null;
  const obj = parsed as { synopsis?: unknown; insights?: unknown };
  if (typeof obj.synopsis !== 'string' || obj.synopsis.length === 0) return null;
  const insights: ThreadInsight[] = [];
  if (Array.isArray(obj.insights)) {
    for (const raw of obj.insights) {
      if (typeof raw !== 'object' || raw === null) continue;
      const item = raw as { text?: unknown; symbol?: unknown };
      if (typeof item.text !== 'string' || item.text.length === 0) continue;
      let symbol: Symbol | null = null;
      if (typeof item.symbol === 'string') {
        const r = SymbolSchema.safeParse(item.symbol);
        if (r.success) symbol = r.data;
      }
      insights.push({ text: item.text, symbol });
      if (insights.length >= 5) break;
    }
  }
  return { synopsis: obj.synopsis, insights };
}
