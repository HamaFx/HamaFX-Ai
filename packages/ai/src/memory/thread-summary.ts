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

// Rolling thread summary.
//
// Long threads send every prior message back to the model on every turn
// — that's quadratic and expensive. Instead, when a thread crosses a
// configurable size, we collapse the older portion into a SINGLE durable
// system note while keeping the most recent messages verbatim. The
// summary is generated cheaply (Gemini Flash-Lite by default) and persisted
// as a system message marker so we don't recompute it every turn.
//
// Personal-mode constraints: best-effort. If the summariser fails we fall
// back to truncation (drop the oldest N messages) and continue. The chat
// experience never regresses because of a memory side-effect.
//
// API design: `compactThread()` returns `{ extraSystem, kept }`. The agent
// prepends `extraSystem` to the system prompt string and feeds `kept` to
// `convertToModelMessages` exactly like before. That keeps the agent's
// streamText invocation untouched.

import { getDb, schema } from '@hamafx/db';
import type { ServerEnv } from '@hamafx/shared';
import { generateText } from 'ai';
import { and, desc, eq } from 'drizzle-orm';

import { dailySpendUsd } from '../cost';
import { resolveModel } from '../model';
import { maybeGetToolContext } from '../tool-context';
import type { DbMessage } from '../persistence';

const KEEP_VERBATIM = 12;
const SUMMARISE_AFTER = 30;
const MAX_SUMMARY_CHARS = 1400;

type SummaryEnv = Pick<
  ServerEnv,
  | 'AI_GATEWAY_API_KEY'
  | 'GOOGLE_GENERATIVE_AI_API_KEY'
  | 'GOOGLE_VERTEX_PROJECT'
  | 'GOOGLE_VERTEX_LOCATION'
  | 'GOOGLE_APPLICATION_CREDENTIALS_JSON'
  | 'GOOGLE_APPLICATION_CREDENTIALS'
  | 'AI_DEFAULT_MODEL'
  | 'MAX_DAILY_USD'
  | 'LOG_PROMPTS'
>;

export interface CompactResult {
  /** Optional extra system prompt the agent prepends to its base. */
  extraSystem: string | null;
  /** History messages to feed to the model verbatim. */
  kept: DbMessage[];
  /** Number of older messages we collapsed. 0 means no compaction happened. */
  compacted: number;
}

/**
 * Apply rolling-summary compaction.
 *  - If history < SUMMARISE_AFTER, return as-is.
 *  - Otherwise, summarise oldest (history.length - KEEP_VERBATIM) messages
 *    and return the verbatim tail. Persist the summary so we don't
 *    regenerate every turn for the same prefix.
 */
export async function compactThread(args: {
  threadId: string;
  history: DbMessage[];
  env: SummaryEnv;
  /**
   * Phase F — the model id (qualified `"<provider>/<bare>"`) the
   * compaction call should use. Resolved by `derivePlannerModel`
   * in the agent caller; compactThread no longer reads AI_TITLE_MODEL.
   */
  compactionModelId: string;
  signal?: AbortSignal;
}): Promise<CompactResult> {
  const { threadId, history, env } = args;
  if (history.length < SUMMARISE_AFTER) {
    return { extraSystem: null, kept: history, compacted: 0 };
  }

  const splitIndex = history.length - KEEP_VERBATIM;
  const older = history.slice(0, splitIndex);
  const tail = history.slice(splitIndex);

  // Look up an existing summary for this prefix; persisted summaries
  // include a `digest` marker so we can detect drift cheaply.
  const persisted = await loadLatestSummary(threadId);
  const digest = digestOf(older);

  let summaryBody: string | null = null;
  if (persisted && persisted.digest === digest) {
    summaryBody = persisted.body;
  } else {
    summaryBody = await generateSummary(older, env, args.compactionModelId, args.signal);
    if (summaryBody) {
      await saveSummary(threadId, summaryBody, digest);
    }
  }

  if (!summaryBody) {
    // Worst-case: drop the older portion. Better to lose context than to
    // ship an OOM/expensive request.
    return { extraSystem: null, kept: tail, compacted: older.length };
  }

  return {
    extraSystem: `# Conversation so far (auto-summary)\n${summaryBody.slice(0, MAX_SUMMARY_CHARS)}`,
    kept: tail,
    compacted: older.length,
  };
}

// ---------------------------------------------------------------------------
// Persistence (summary stored as a system message with a `thread-summary` part)
// ---------------------------------------------------------------------------

interface PersistedSummary {
  body: string;
  digest: string;
}

async function loadLatestSummary(threadId: string): Promise<PersistedSummary | null> {
  const rows = await getDb()
    .select()
    .from(schema.chatMessages)
    .where(and(eq(schema.chatMessages.threadId, threadId), eq(schema.chatMessages.role, 'system')))
    .orderBy(desc(schema.chatMessages.createdAt))
    .limit(5);
  for (const r of rows) {
    const meta = readSummaryMeta(r.parts);
    if (meta) return { body: r.content, digest: meta.digest };
  }
  return null;
}

async function saveSummary(threadId: string, body: string, digest: string): Promise<void> {
  await getDb()
    .insert(schema.chatMessages)
    .values({
      threadId,
      role: 'system',
      content: body.slice(0, MAX_SUMMARY_CHARS),
      parts: [
        {
          type: 'thread-summary',
          digest,
          createdAt: Date.now(),
        },
      ],
    });
}

function readSummaryMeta(parts: unknown): { digest: string } | null {
  if (!Array.isArray(parts)) return null;
  for (const p of parts) {
    if (
      p !== null &&
      typeof p === 'object' &&
      'type' in (p as Record<string, unknown>) &&
      (p as { type: unknown }).type === 'thread-summary' &&
      typeof (p as { digest?: unknown }).digest === 'string'
    ) {
      return { digest: (p as { digest: string }).digest };
    }
  }
  return null;
}

// ---------------------------------------------------------------------------
// Summarisation (LLM with deterministic fallback)
// ---------------------------------------------------------------------------

async function generateSummary(
  older: DbMessage[],
  env: SummaryEnv,
  compactionModelId: string,
  signal?: AbortSignal,
): Promise<string | null> {
  // Hard budget guard — never spend on a memory side-effect we can do without.
  let allowed = true;
  let ctx: ReturnType<typeof maybeGetToolContext> = null;
  try {
    ctx = maybeGetToolContext();
    // Phase 3 §3.11 — use real userId from tool context; no __system__ fallback.
    // If no userId is available, skip the budget check rather than attributing
    // spend to a phantom user.
    if (ctx?.userId) {
      const spent = await dailySpendUsd(ctx.userId);
      if (spent >= env.MAX_DAILY_USD) allowed = false;
    }
  } catch {
    allowed = false;
  }
  if (!allowed) return deterministicSummary(older);

  const transcript = older
    .map((m) => `${m.role.toUpperCase()}: ${m.content.slice(0, 600)}`)
    .join('\n')
    .slice(0, 8_000);

  try {
    const callArgs: Parameters<typeof generateText>[0] = {
      model: resolveModel(compactionModelId, env, ctx?.userId),
      system:
        "You compress chat history into a 4-bullet system note for a trading copilot. Capture: (1) the symbol(s) under discussion, (2) the user's active question/setup, (3) any prior facts or numbers cited, (4) any open follow-up. No greetings, no filler.",
      prompt: transcript,
    };
    if (signal) callArgs.abortSignal = signal;
    const { text } = await generateText(callArgs);
    const cleaned = text.trim();
    return cleaned.length > 0 ? cleaned : deterministicSummary(older);
  } catch {
    return deterministicSummary(older);
  }
}

function deterministicSummary(older: DbMessage[]): string {
  const last = older[older.length - 1];
  return `Earlier (${older.length} messages) discussed trading topics; latest: ${
    last?.content.slice(0, 240) ?? '(empty)'
  }`;
}

function digestOf(messages: DbMessage[]): string {
  // Cheap, stable: roles + first-N chars of each message's content.
  const parts = messages.map((m) => `${m.role}:${m.content.slice(0, 120)}`).join('|');
  return djb2(parts).toString(16);
}

function djb2(input: string): number {
  let h = 5381;
  for (let i = 0; i < input.length; i += 1) {
    h = ((h << 5) + h + input.charCodeAt(i)) & 0xffffffff;
  }
  return h >>> 0;
}
