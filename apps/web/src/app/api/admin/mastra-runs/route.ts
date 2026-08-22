// SPDX-License-Identifier: Apache-2.0

import { and, desc, gt, isNotNull, like, or } from 'drizzle-orm';
import { z } from 'zod';

import { getDb, schema } from '@kestrel/db';
import { getKestrelMastra, toMastraRunView, type RunTelemetryRow } from '@kestrel/ai/mastra';
import { withAdminAuth } from '@/lib/admin-auth';
import { parseSearchParams } from '@/lib/api';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const querySchema = z.object({
  hours: z.coerce.number().int().min(1).max(720).default(72),
  limit: z.coerce.number().int().min(1).max(500).default(100),
  /** Optional kind filter, e.g. `mastra_mode` or `mastra_full_job` (prefix match). */
  kind: z.string().min(2).max(64).optional(),
});

/**
 * Admin Mastra runs viewer (Phase 8).
 *
 * One row per Mastra run, joined across the three runId-keyed surfaces:
 * chat_telemetry (provider/cost/latency), workflow snapshots (stage/status),
 * and the scores domain (was it grounded). A single runId therefore answers
 * all four acceptance questions from the admin dashboard.
 */
export const GET = withAdminAuth(async (req) => {
  const { hours, limit, kind } = parseSearchParams(req, querySchema);
  const db = getDb();
  const since = new Date(Date.now() - hours * 60 * 60 * 1000);

  const rows = await db
    .select()
    .from(schema.chatTelemetry)
    .where(
      and(
        gt(schema.chatTelemetry.createdAt, since),
        isNotNull(schema.chatTelemetry.runId),
        or(
          like(schema.chatTelemetry.kind, 'mastra_%'),
          ...(kind ? [like(schema.chatTelemetry.kind, `${kind}%`)] : []),
        ),
      ),
    )
    .orderBy(desc(schema.chatTelemetry.createdAt))
    .limit(limit);

  // Latest row per runId (a run may emit several rows across retries).
  const latestByRun = new Map<string, (typeof rows)[number]>();
  for (const row of rows) {
    if (!row.runId) continue;
    const existing = latestByRun.get(row.runId);
    if (!existing || row.createdAt.getTime() > existing.createdAt.getTime()) {
      latestByRun.set(row.runId, row);
    }
  }

  const instance = getKestrelMastra().instance;
  const views = [];
  for (const row of latestByRun.values()) {
    const telemetry: RunTelemetryRow = {
      runId: row.runId,
      traceId: row.traceId,
      threadId: row.threadId,
      userId: row.userId,
      model: row.model,
      inputTokens: row.inputTokens,
      outputTokens: row.outputTokens,
      toolCalls: row.toolCalls,
      ms: row.ms,
      estCostUsd: row.estCostUsd,
      kind: row.kind,
      createdAt: row.createdAt,
    };
    views.push(await toMastraRunView(telemetry, instance));
  }

  views.sort((a, b) => b.createdAt.localeCompare(a.createdAt));

  const failed = views.filter(
    (view) => view.workflow.status === 'failed' || view.workflow.failedSteps.length > 0,
  ).length;
  const scored = views.filter((view) => view.scores.length > 0).length;

  return Response.json({
    hours,
    count: views.length,
    failed,
    scored,
    runs: views,
  });
});
