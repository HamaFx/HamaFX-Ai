// SPDX-License-Identifier: Apache-2.0

/**
 * Phase 6 evals — score record access.
 *
 * Mastra persists every scorer run into the `scores` storage domain (both
 * live sampled scoring and `runEvals` experiment scoring). This module
 * defines the Kestrel view of a score row and the helpers used by the gate
 * and the training-export join — reading back records by run/batch without
 * depending on Mastra internals.
 */

import type { Mastra } from '@mastra/core';
import type { ScoreRowData } from '@mastra/core/evals';
import { createCategorizedLogger } from '@kestrel/shared/logger';

const slog = createCategorizedLogger('ai', { component: 'mastra-evals-scores' });

/** Kestrel's projection of a Mastra score row. */
export interface ScoreRecord {
  id: string;
  scorerId: string;
  runId: string;
  entityId: string;
  score: number;
  reason?: string;
  createdAt: Date;
  source: 'LIVE' | 'TEST';
  input?: unknown;
  output?: unknown;
  metadata?: {
    ttftMs?: number;
    totalMs?: number;
    costUsd?: number;
    [key: string]: unknown;
  };
}

/**
 * Read score records for a run (or all runs in a batch) from the Mastra
 * scores domain. Returns an empty array when the instance exposes no scores
 * storage (e.g. minimal in-memory test instances).
 */
interface ScoresDomain {
  listScoresByRunId(input: {
    runId: string;
    pagination?: { page: number; perPage?: number | false };
  }): Promise<{ scores: ScoreRowData[] }>;
}

/**
 * Read score records for a run (or all runs in a batch) from the Mastra
 * scores domain. Returns an empty array when the instance exposes no scores
 * storage (e.g. minimal in-memory test instances).
 */
export async function listScoresForRun(
  instance: Mastra,
  runId: string,
): Promise<ScoreRecord[]> {
  const storage = instance.getStorage() as (typeof instance extends never ? never : { getStore?: (domain: string) => Promise<unknown> }) | null;
  if (!storage || typeof storage.getStore !== 'function') {
    slog.warn('Mastra storage exposes no scores domain', { runId });
    return [];
  }
  try {
    const scoresDomain = (await storage.getStore('scores')) as ScoresDomain | undefined;
    if (!scoresDomain || typeof scoresDomain.listScoresByRunId !== 'function') {
      slog.warn('Mastra storage exposes no scores domain', { runId });
      return [];
    }
    // Note: the installed libsql/postgres pagination helpers treat `page` as
    // 0-indexed internally (offset = page * perPage), so page 0 is the first
    // page. perPage false fetches all rows for the run.
    const response = await scoresDomain.listScoresByRunId({
      runId,
      pagination: { page: 0, perPage: false },
    });
    return response.scores.map(toScoreRecord);
  } catch (error) {
    slog.warn('Failed to read score records', {
      runId,
      error: error instanceof Error ? error.message : String(error),
    });
    return [];
  }
}

/** Project a Mastra score row into the Kestrel view. */
export function toScoreRecord(row: ScoreRowData): ScoreRecord {
  const metadata = (row.metadata as ScoreRecord['metadata']) ?? undefined;
  const record: ScoreRecord = {
    id: row.id,
    scorerId: row.scorerId,
    runId: row.runId,
    entityId: row.entityId,
    score: row.score,
    createdAt: row.createdAt,
    source: row.source,
  };
  if (row.reason !== undefined && row.reason !== null) record.reason = row.reason;
  if (row.input !== undefined) record.input = row.input;
  if (row.output !== undefined) record.output = row.output;
  if (metadata !== undefined) record.metadata = metadata;
  return record;
}
