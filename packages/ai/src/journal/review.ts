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

// 2.3 — AI trade review for closed journal entries.
// Generates a concise post-trade review using an LLM. The review is
// deterministic in format (markdown) and scoped to the entry + recent
// journal stats so the model can compare this trade to the user's baseline.

import { generateText } from 'ai';
import type { JournalEntry, JournalStats, ServerEnv } from '@hamafx/shared';
import type { UserSettingsRow } from '@hamafx/db/schema';

import { computeStats } from './persistence';
import { resolveChatModel } from '../model';
import { tryReserveBudget, applyBudgetDelta, estimateCostUsd } from '../cost';

export interface ReviewTradeArgs {
  userId: string;
  entry: JournalEntry;
  userSettings: UserSettingsRow;
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
  signal?: AbortSignal;
}

export interface TradeReviewResult {
  review: string;
  modelId: string;
  inputTokens: number;
  outputTokens: number;
  costUsd: number;
  latencyMs: number;
}

const SYSTEM_PROMPT = `You are a disciplined trading coach reviewing a single closed trade from the user's journal.

Output a concise post-trade review in markdown with exactly these sections:

1. **What happened** — one sentence summarizing the setup, entry, stop, target, and outcome.
2. **Execution grade (A-F)** — grade the execution, not the outcome. Explain in one bullet.
3. **Risk management** — comment on stop placement, position size (if known), and R-multiple realized.
4. **Edge & process** — note whether the trade followed a repeatable setup, any emotional/deviation signals from the notes, and what to keep or change.
5. **One action item** — a single, specific improvement for the next similar trade.

Rules:
- Be direct and specific. No generic platitudes.
- If notes are empty, say "No notes recorded" and focus on the numbers.
- Never give financial advice; this is a review of a completed trade.
- Keep the total response under 250 words.`;

function formatEntryForPrompt(entry: JournalEntry, stats: JournalStats): string {
  const lines = [
    `Symbol: ${entry.symbol}`,
    `Side: ${entry.side}`,
    `Opened: ${new Date(entry.openedAt).toISOString()}`,
    `Entry: ${entry.entry}`,
    `Stop: ${entry.stop ?? 'none'}`,
    `Target: ${entry.target ?? 'none'}`,
    `Exit: ${entry.exit ?? 'unknown'}`,
    `Outcome: ${entry.outcome}`,
    `R-multiple: ${entry.rMultiple ?? 'unknown'}`,
    `Size (lots): ${entry.size ?? 'unknown'}`,
    `Tags: ${entry.tags.length > 0 ? entry.tags.join(', ') : 'none'}`,
    `Notes: ${entry.notes ?? 'none'}`,
    '',
    `User baseline (last closed trades):`,
    `- Win rate: ${(stats.winRate * 100).toFixed(1)}%`,
    `- Average R: ${stats.avgR.toFixed(2)}`,
    `- Total R: ${stats.totalR.toFixed(2)}`,
    `- Best trade: +${(stats.maxWinStreak ?? 0).toFixed(2)}R streak count shown; extremes not available in stats`,
  ];
  return lines.join('\n');
}

export async function reviewTrade(args: ReviewTradeArgs): Promise<TradeReviewResult> {
  const { userId, entry, userSettings, env, signal } = args;
  const startedAt = Date.now();

  if (entry.outcome === 'open') {
    throw new Error('Cannot review an open trade; close it first.');
  }

  // Resolve the user's default chat model (BYOK or env fallback).
  const { model, modelId } = resolveChatModel(userSettings, env);

  // Budget guardrail: reserve a small estimate before the call.
  const estimatedUsd = 0.005;
  const maxDailyUsd = userSettings.maxDailyUsd ?? env.MAX_DAILY_USD;
  const reservation = await tryReserveBudget(userId, estimatedUsd, maxDailyUsd);
  if (!reservation.ok) {
    throw new Error(
      `Daily AI budget exceeded ($${reservation.spent.toFixed(2)} / $${reservation.max.toFixed(2)}).`,
    );
  }

  const stats = await computeStats(userId);
  const userPrompt = formatEntryForPrompt(entry, stats);

  try {
    const callArgs: Parameters<typeof generateText>[0] = {
      model,
      system: SYSTEM_PROMPT,
      prompt: userPrompt,
      maxOutputTokens: 800,
    };
    if (signal) callArgs.abortSignal = signal;

    const result = await generateText(callArgs);
    const latencyMs = Date.now() - startedAt;
    const inputTokens = result.usage?.inputTokens ?? 0;
    const outputTokens = result.usage?.outputTokens ?? 0;
    const costUsd = estimateCostUsd(modelId, inputTokens, outputTokens);

    // Reconcile the budget reservation with actual cost.
    const delta = costUsd - estimatedUsd;
    if (Math.abs(delta) > 0.0001) {
      void applyBudgetDelta(userId, delta).catch((err) => {
        console.warn('[journal/review] applyBudgetDelta failed', err);
      });
    }

    return {
      review: result.text.trim(),
      modelId,
      inputTokens,
      outputTokens,
      costUsd,
      latencyMs,
    };
  } catch (err) {
    // Release the reservation on failure so the user isn't charged.
    void applyBudgetDelta(userId, -estimatedUsd).catch(() => undefined);
    if (env.LOG_PROMPTS) {
      console.warn('[journal/review] LLM failed', err);
    }
    throw err;
  }
}
