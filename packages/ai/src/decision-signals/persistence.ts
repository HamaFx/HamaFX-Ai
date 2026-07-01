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

// F1 — Decision Signal Persistence.
//
// CRUD + evaluation helpers for decision_signals, decision_signal_outcomes,
// and decision_signal_feedback tables.

import { getDb, schema } from '@hamafx/db';
import type {
  DecisionSignal,
  Outcome,
  FirstHit,
  EvalHorizon,
} from '@hamafx/shared';
import { and, desc, eq, sql } from 'drizzle-orm';

import type { DecisionSignalPayload, OutcomeResult } from './types';

// ---------------------------------------------------------------------------
// Create
// ---------------------------------------------------------------------------

export async function createDecisionSignal(
  payload: DecisionSignalPayload,
): Promise<string> {
  const [row] = await getDb()
    .insert(schema.decisionSignals)
    .values({
      userId: payload.userId,
      threadId: payload.threadId,
      messageId: payload.messageId,
      symbol: payload.symbol,
      action: payload.action,
      bias: payload.bias,
      confidence: payload.confidence ?? null,
      entryLow: payload.entryLow ?? null,
      entryHigh: payload.entryHigh ?? null,
      stopLoss: payload.stopLoss ?? null,
      takeProfit: payload.takeProfit ?? null,
      horizon: payload.horizon,
      anchorPrice: payload.anchorPrice,
      anchorAt: new Date(),
      sourceType: payload.sourceType,
      model: payload.model ?? null,
      analysisMode: payload.analysisMode ?? null,
      status: 'active',
      metadata: payload.metadata,
    })
    .returning({ id: schema.decisionSignals.id });

  return row!.id;
}

// ---------------------------------------------------------------------------
// Read
// ---------------------------------------------------------------------------

export async function listSignals(
  userId: string,
  opts: { limit?: number; status?: string } = {},
): Promise<DecisionSignal[]> {
  const filters = [eq(schema.decisionSignals.userId, userId)];
  if (opts.status) filters.push(eq(schema.decisionSignals.status, opts.status));

  const rows = await getDb()
    .select()
    .from(schema.decisionSignals)
    .where(and(...filters))
    .orderBy(desc(schema.decisionSignals.createdAt))
    .limit(opts.limit ?? 50);

  return rows.map(rowToSignal);
}

export async function getSignal(
  userId: string,
  signalId: string,
): Promise<DecisionSignal | null> {
  const rows = await getDb()
    .select()
    .from(schema.decisionSignals)
    .where(
      and(
        eq(schema.decisionSignals.id, signalId),
        eq(schema.decisionSignals.userId, userId),
      ),
    )
    .limit(1);

  return rows[0] ? rowToSignal(rows[0]) : null;
}

// ---------------------------------------------------------------------------
// List signals needing evaluation (active + past their horizon + no outcome)
// ---------------------------------------------------------------------------

export async function listSignalsNeedingEvaluation(
  horizons: readonly EvalHorizon[],
): Promise<
  Array<{
    id: string;
    userId: string;
    symbol: string;
    bias: string;
    anchorPrice: number;
    stopLoss: number | null;
    takeProfit: number | null;
    anchorAt: Date;
    horizon: string;
  }>
> {
  // Active signals that don't yet have outcomes for all requested horizons.
  // We fetch active signals and check per-horizon in the cron loop.
  const rows = await getDb()
    .select({
      id: schema.decisionSignals.id,
      userId: schema.decisionSignals.userId,
      symbol: schema.decisionSignals.symbol,
      bias: schema.decisionSignals.bias,
      anchorPrice: schema.decisionSignals.anchorPrice,
      stopLoss: schema.decisionSignals.stopLoss,
      takeProfit: schema.decisionSignals.takeProfit,
      anchorAt: schema.decisionSignals.anchorAt,
      horizon: schema.decisionSignals.horizon,
    })
    .from(schema.decisionSignals)
    .where(eq(schema.decisionSignals.status, 'active'))
    .orderBy(desc(schema.decisionSignals.anchorAt))
    .limit(200);

  // Filter to signals whose anchorAt + max horizon days has passed.
  const maxDays = Math.max(...horizons.map((h) => HORIZON_DAYS_MAP[h] ?? 0));
  const cutoff = new Date(Date.now() - maxDays * 24 * 60 * 60 * 1000);

  return rows.filter((r) => r.anchorAt <= cutoff);
}

const HORIZON_DAYS_MAP: Record<string, number> = {
  '1d': 1,
  '3d': 3,
  '5d': 5,
  '10d': 10,
};

// ---------------------------------------------------------------------------
// Record outcome
// ---------------------------------------------------------------------------

export async function recordOutcome(
  signalId: string,
  horizon: string,
  result: OutcomeResult,
  engineVersion: string,
): Promise<void> {
  await getDb()
    .insert(schema.decisionSignalOutcomes)
    .values({
      signalId,
      horizon,
      evalStatus: 'completed',
      unableReason: null,
      outcome: result.outcome as Outcome,
      directionCorrect: result.directionCorrect,
      priceReturnPct: result.priceReturnPct,
      hitStopLoss: result.hitStopLoss,
      hitTakeProfit: result.hitTakeProfit,
      firstHit: result.firstHit as FirstHit,
      firstHitDays: result.firstHitDays,
      endPrice: result.endPrice,
      engineVersion,
    })
    .onConflictDoNothing();
}

export async function recordUnable(
  signalId: string,
  horizon: string,
  reason: string,
  engineVersion: string,
): Promise<void> {
  await getDb()
    .insert(schema.decisionSignalOutcomes)
    .values({
      signalId,
      horizon,
      evalStatus: 'unable',
      unableReason: reason,
      outcome: null,
      directionCorrect: null,
      priceReturnPct: null,
      hitStopLoss: null,
      hitTakeProfit: null,
      firstHit: null,
      firstHitDays: null,
      endPrice: null,
      engineVersion,
    })
    .onConflictDoNothing();
}

// ---------------------------------------------------------------------------
// Signal lifecycle: close when all horizons are evaluated
// ---------------------------------------------------------------------------

export async function maybeCloseSignal(signalId: string): Promise<void> {
  // Check if all eval horizons have outcomes.
  const outcomes = await getDb()
    .select({ horizon: schema.decisionSignalOutcomes.horizon })
    .from(schema.decisionSignalOutcomes)
    .where(eq(schema.decisionSignalOutcomes.signalId, signalId));

  const evaluatedHorizons = new Set(outcomes.map((o) => o.horizon));
  const allHorizons = ['1d', '3d', '5d', '10d'];
  const allEvaluated = allHorizons.every((h) => evaluatedHorizons.has(h));

  if (allEvaluated) {
    await getDb()
      .update(schema.decisionSignals)
      .set({ status: 'closed' })
      .where(eq(schema.decisionSignals.id, signalId));
  }
}

// ---------------------------------------------------------------------------
// Feedback
// ---------------------------------------------------------------------------

export async function recordFeedback(
  userId: string,
  signalId: string,
  feedback: 'useful' | 'not_useful',
): Promise<void> {
  await getDb()
    .insert(schema.decisionSignalFeedback)
    .values({
      signalId,
      userId,
      feedback,
    })
    .onConflictDoNothing();
}

// ---------------------------------------------------------------------------
// Stats
// ---------------------------------------------------------------------------

export async function computeSignalStats(
  userId: string,
): Promise<{
  total: number;
  evaluated: number;
  hitRate: number;
  avgReturnPct: number;
  byModel: Array<{ model: string; hitRate: number; count: number }>;
  byHorizon: Array<{ horizon: string; hitRate: number; count: number }>;
  byAction: Array<{ action: string; hitRate: number; count: number }>;
  recentSignals: DecisionSignal[];
}> {
  // Total signals for this user.
  const totalRows = await getDb()
    .select({ count: sql<number>`count(*)::int` })
    .from(schema.decisionSignals)
    .where(eq(schema.decisionSignals.userId, userId));
  const total = totalRows[0]?.count ?? 0;

  // Join signals with outcomes for stats.
  const outcomeRows = await getDb()
    .select({
      signalId: schema.decisionSignals.id,
      userId: schema.decisionSignals.userId,
      model: schema.decisionSignals.model,
      action: schema.decisionSignals.action,
      horizon: schema.decisionSignalOutcomes.horizon,
      outcome: schema.decisionSignalOutcomes.outcome,
      priceReturnPct: schema.decisionSignalOutcomes.priceReturnPct,
      evalStatus: schema.decisionSignalOutcomes.evalStatus,
    })
    .from(schema.decisionSignals)
    .innerJoin(
      schema.decisionSignalOutcomes,
      eq(schema.decisionSignals.id, schema.decisionSignalOutcomes.signalId),
    )
    .where(
      and(
        eq(schema.decisionSignals.userId, userId),
        eq(schema.decisionSignalOutcomes.evalStatus, 'completed'),
      ),
    );

  const evaluated = outcomeRows.length;
  const hits = outcomeRows.filter((r) => r.outcome === 'hit').length;
  const misses = outcomeRows.filter((r) => r.outcome === 'miss').length;
  const hitRate = hits + misses > 0 ? hits / (hits + misses) : 0;
  const avgReturnPct =
    evaluated > 0
      ? outcomeRows.reduce((sum, r) => sum + (r.priceReturnPct ?? 0), 0) / evaluated
      : 0;

  // Group by model.
  const modelMap = new Map<string, { hits: number; total: number }>();
  for (const r of outcomeRows) {
    const model = r.model ?? 'unknown';
    const entry = modelMap.get(model) ?? { hits: 0, total: 0 };
    entry.total++;
    if (r.outcome === 'hit') entry.hits++;
    modelMap.set(model, entry);
  }
  const byModel = Array.from(modelMap.entries()).map(([model, { hits, total }]) => ({
    model,
    hitRate: total > 0 ? hits / total : 0,
    count: total,
  }));

  // Group by horizon.
  const horizonMap = new Map<string, { hits: number; total: number }>();
  for (const r of outcomeRows) {
    const horizon = r.horizon ?? 'unknown';
    const entry = horizonMap.get(horizon) ?? { hits: 0, total: 0 };
    entry.total++;
    if (r.outcome === 'hit') entry.hits++;
    horizonMap.set(horizon, entry);
  }
  const byHorizon = Array.from(horizonMap.entries()).map(([horizon, { hits, total }]) => ({
    horizon,
    hitRate: total > 0 ? hits / total : 0,
    count: total,
  }));

  // Group by action.
  const actionMap = new Map<string, { hits: number; total: number }>();
  for (const r of outcomeRows) {
    const action = r.action ?? 'unknown';
    const entry = actionMap.get(action) ?? { hits: 0, total: 0 };
    entry.total++;
    if (r.outcome === 'hit') entry.hits++;
    actionMap.set(action, entry);
  }
  const byAction = Array.from(actionMap.entries()).map(([action, { hits, total }]) => ({
    action,
    hitRate: total > 0 ? hits / total : 0,
    count: total,
  }));

  // Recent signals.
  const recentRows = await getDb()
    .select()
    .from(schema.decisionSignals)
    .where(eq(schema.decisionSignals.userId, userId))
    .orderBy(desc(schema.decisionSignals.createdAt))
    .limit(10);

  const recentSignals = recentRows.map(rowToSignal);

  return {
    total,
    evaluated,
    hitRate,
    avgReturnPct,
    byModel,
    byHorizon,
    byAction,
    recentSignals,
  };
}

// ---------------------------------------------------------------------------
// Row mappers
// ---------------------------------------------------------------------------

function rowToSignal(row: typeof schema.decisionSignals.$inferSelect): DecisionSignal {
  return {
    id: row.id,
    userId: row.userId,
    threadId: row.threadId,
    messageId: row.messageId,
    symbol: row.symbol,
    action: row.action as DecisionSignal['action'],
    bias: row.bias as DecisionSignal['bias'],
    confidence: row.confidence,
    entryLow: row.entryLow,
    entryHigh: row.entryHigh,
    stopLoss: row.stopLoss,
    takeProfit: row.takeProfit,
    horizon: row.horizon as DecisionSignal['horizon'],
    anchorPrice: row.anchorPrice,
    anchorAt: row.anchorAt.getTime(),
    sourceType: row.sourceType as DecisionSignal['sourceType'],
    model: row.model,
    analysisMode: row.analysisMode,
    status: row.status as DecisionSignal['status'],
    metadata: (row.metadata ?? {}) as Record<string, unknown>,
    createdAt: row.createdAt.getTime(),
    updatedAt: row.updatedAt.getTime(),
  };
}