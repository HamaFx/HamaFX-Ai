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

// Title_Generator — produces a 3–7 word title for a chat thread on its first
// turn. Server-only. Goes through the Vercel AI Gateway via `generateText`
// (no provider SDK). Best-effort: any failure or budget block falls back to
// a deterministic title derived from the first user message; the caller
// records telemetry and chooses whether to display the title.
//
// See .kiro/specs/phase-1-completion/design.md §1 for the full contract.

import type { ServerEnv } from '@hamafx/shared';
import { generateText } from 'ai';

import { dailySpendUsd } from './cost';
import { resolveModel } from './model';
import { maybeGetToolContext } from './tool-context';

export interface GenerateTitleArgs {
  threadId: string;
  /** Plain text of the first user UIMessage. */
  firstUser: string;
  /** Plain text of the first assistant UIMessage. */
  firstAssistant: string;
  env: Pick<
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
  /**
   * Phase F — the model id (qualified `"<provider>/<bare>"`) the title
   * generator should use. Resolved by `deriveTitleModel(userSettings, env)`
   * in the agent caller; title.ts no longer reads AI_TITLE_MODEL itself.
   * (AI_TITLE_MODEL remains in ServerEnv as an operator-set fallback for
   * the very rare case where the resolver returns null.)
   */
  titleModelId: string;
  /** Aborts the LLM call when the originating request goes away. */
  signal?: AbortSignal;
}

export interface GenerateTitleResult {
  /** ≤ 60 codepoints, trimmed. Always set, even on fallback. */
  title: string;
  source: 'llm' | 'fallback';
  /** Populated only when `source === 'fallback'`. */
  reason?: 'budget' | 'empty' | 'error';
  /** Token usage on the LLM path; absent on fallback. */
  inputTokens?: number;
  outputTokens?: number;
  /** Wall-clock latency of the LLM call in ms; absent on fallback. */
  latencyMs?: number;
}

const MAX_CODEPOINTS = 60;
const PROMPT_INPUT_BUDGET = 1024;

const SYSTEM_PROMPT =
  'Reply with a 3–7 word title for this conversation. No quotes. No trailing punctuation.';

/**
 * Codepoint-safe truncation to 60 codepoints with a trailing ellipsis when the
 * source is longer. Used both as the fallback path and to clip the LLM output.
 *
 * Pure function — no I/O. Exported so unit + property tests can target it
 * directly without going through the LLM.
 */
export function deterministicFallbackTitle(firstUser: string): string {
  const trimmed = firstUser.trim();
  const codepoints = Array.from(trimmed);
  if (codepoints.length <= MAX_CODEPOINTS) {
    return codepoints.join('');
  }
  return codepoints.slice(0, MAX_CODEPOINTS).join('') + '…';
}

/**
 * Strip a single matching pair of surrounding quotes (`"`, `'`, or backtick)
 * from a string. Models occasionally wrap titles in quotes despite the system
 * prompt; this is a one-shot cleanup, not a recursive unwrap.
 */
function stripSurroundingQuotes(s: string): string {
  if (s.length < 2) return s;
  const first = s[0];
  const last = s[s.length - 1];
  if ((first === '"' || first === "'" || first === '`') && first === last) {
    return s.slice(1, -1);
  }
  return s;
}

/**
 * Apply the same codepoint-safe truncation to an arbitrary cleaned-up LLM
 * response so the persisted title length invariant holds regardless of source.
 */
function clipToCodepoints(s: string): string {
  const codepoints = Array.from(s);
  if (codepoints.length <= MAX_CODEPOINTS) {
    return codepoints.join('');
  }
  return codepoints.slice(0, MAX_CODEPOINTS).join('') + '…';
}

export async function generateTitle(args: GenerateTitleArgs): Promise<GenerateTitleResult> {
  const { firstUser, firstAssistant, env, signal } = args;

  // Hard ceiling. We deliberately probe the budget here (separate from
  // the chat turn's own reservation) so a title is skipped even if the
  // assistant turn was the one that pushed us over.
  //
  // Phase 3 hardening §4 — prefer the cached snapshot from
  // AsyncLocalStorage so a turn that runs both the planner and title
  // generator does at most one `dailySpendUsd` query. When the title
  // generator is invoked outside `withToolContext` (e.g. a future
  // ad-hoc backfill script) we fall back to the live query.
  const ctx = maybeGetToolContext();
  const userId = ctx?.userId ?? '__system__';
  const spent = ctx ? ctx.budget.spent : await dailySpendUsd(userId);
  if (spent >= env.MAX_DAILY_USD) {
    return {
      title: deterministicFallbackTitle(firstUser),
      source: 'fallback',
      reason: 'budget',
    };
  }

  const userPrompt = `${firstUser.slice(0, PROMPT_INPUT_BUDGET)}\n\n---\n\n${firstAssistant.slice(
    0,
    PROMPT_INPUT_BUDGET,
  )}`;

  const startedAt = Date.now();
  try {
    const generateArgs: Parameters<typeof generateText>[0] = {
      // Resolve the id either to a gateway-routed string or a direct provider
      // model instance, depending on which transport is configured.
      model: resolveModel(args.titleModelId, env),
      system: SYSTEM_PROMPT,
      prompt: userPrompt,
    };
    if (signal) generateArgs.abortSignal = signal;

    const result = await generateText(generateArgs);
    const latencyMs = Date.now() - startedAt;

    const cleaned = stripSurroundingQuotes(result.text.trim()).trim();
    if (cleaned.length === 0) {
      return {
        title: deterministicFallbackTitle(firstUser),
        source: 'fallback',
        reason: 'empty',
      };
    }

    const title = clipToCodepoints(cleaned);
    return {
      title,
      source: 'llm',
      inputTokens: result.usage?.inputTokens ?? 0,
      outputTokens: result.usage?.outputTokens ?? 0,
      latencyMs,
    };
  } catch (err) {
    if (env.LOG_PROMPTS) {
      console.warn('[ai] generateTitle failed', err);
    }
    return {
      title: deterministicFallbackTitle(firstUser),
      source: 'fallback',
      reason: 'error',
    };
  }
}
