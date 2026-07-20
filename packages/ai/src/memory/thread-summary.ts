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

// M6: Use a non-cryptographic hash (MD5) instead of SHA-256 for cache
// invalidation. Collision resistance is irrelevant — we're checking whether
// a known set of messages changed. MD5 is ~2x faster than SHA-256.
import { createHash } from 'node:crypto';

import { schema } from '@hamafx/db';
import { getDb } from '../db';
import type { ServerEnv } from '@hamafx/shared';
import { generateText } from 'ai';
import { and, desc, eq } from 'drizzle-orm';

import { dailySpendUsd } from '../cost';
import { resolveModel } from '../model';
import { maybeGetToolContext } from '../tool-context';
import { telemetryConfig } from '../telemetry';
import type { DbMessage } from '../persistence';

const KEEP_VERBATIM = 12;
const SUMMARISE_AFTER = 30;
const MAX_SUMMARY_CHARS = 1400;
// H2: Only regenerate summary when at least 5 new messages have been
// added since the last compaction. Prevents 1-3s LLM call on every turn
// for threads hovering just above the SUMMARISE_AFTER threshold.
const MIN_NEW_MESSAGES_FOR_RECOMPACT = 5;

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

  // H2: Check if we have a recent-enough summary that still covers the
  // older portion. If fewer than MIN_NEW_MESSAGES_FOR_RECOMPACT messages
  // were added since last compaction, reuse the existing summary.
  const persisted = await loadLatestSummary(threadId);
  const digest = digestOf(older);

  let summaryBody: string | null = null;
  if (persisted && persisted.digest === digest) {
    // Exact match — reuse cached summary.
    summaryBody = persisted.body;
  } else if (persisted && persisted.messageCount != null) {
    // Check if this is a "close enough" match — fewer than threshold
    // new messages since last compaction.
    const newSinceLastCompact = history.length - persisted.messageCount;
    if (newSinceLastCompact < MIN_NEW_MESSAGES_FOR_RECOMPACT && newSinceLastCompact > 0) {
      summaryBody = persisted.body;
    } else {
      summaryBody = await generateSummary(older, env, args.compactionModelId, args.signal);
      if (summaryBody) {
        await saveSummary(threadId, summaryBody, digest, history.length);
      }
    }
  } else {
    summaryBody = await generateSummary(older, env, args.compactionModelId, args.signal);
    if (summaryBody) {
      await saveSummary(threadId, summaryBody, digest, history.length);
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
  /** H2: total message count at time of compaction, used for
   *  incremental compaction detection. */
  messageCount: number | undefined;
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
    if (meta) return { body: r.content, digest: meta.digest, messageCount: meta.messageCount };
  }
  return null;
}

async function saveSummary(threadId: string, body: string, digest: string, messageCount?: number): Promise<void> {
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
          ...(messageCount != null ? { messageCount } : {}),
        },
      ],
    });
}

function readSummaryMeta(parts: unknown): { digest: string; messageCount: number | undefined } | null {
  if (!Array.isArray(parts)) return null;
  for (const p of parts) {
    if (
      p !== null &&
      typeof p === 'object' &&
      'type' in (p as Record<string, unknown>) &&
      (p as { type: unknown }).type === 'thread-summary' &&
      typeof (p as { digest?: unknown }).digest === 'string'
    ) {
      const obj = p as { digest: string; messageCount?: number };
      return { digest: obj.digest, messageCount: obj.messageCount };
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
      ...telemetryConfig(),
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
  // M6: use MD5 instead of SHA-256 — ~2x faster for cache invalidation.
  // Collision resistance is not needed here; we're checking whether a
  // known message set changed, not authenticating content.
  const parts = messages.map((m) => `${m.role}:${m.content.slice(0, 500)}`).join('|');
  return createHash('md5').update(parts).digest('hex');
}
