/**
 * Copyright 2026 Kestrel
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 */

// Metrics flush — pushes the in-process metrics registry to the configured
// Grafana Cloud transports once a minute, and records how fresh the live-tick
// pipeline is so the health of the feed is visible even when no chat turns
// have happened in a while. Fail-closed: without credentials the flush is a
// no-op and this job only produces the freshness observation.

import { desc } from 'drizzle-orm';

import { getDb } from '@kestrel/ai';
import { liveTicks } from '@kestrel/db/schema';
import { metrics } from '@kestrel/shared';
import { flushMetrics } from '@kestrel/shared/metrics-export';

import type { JobContext, JobResult } from './types.js';

export async function runMetricsFlush(ctx: JobContext): Promise<JobResult> {
  metrics.increment('worker_flush_total');

  let freshnessMs: number | null = null;
  try {
    const [row] = await getDb()
      .select({ ts: liveTicks.ts })
      .from(liveTicks)
      .orderBy(desc(liveTicks.ts))
      .limit(1);
    if (row?.ts) {
      freshnessMs = Math.max(0, Date.now() - new Date(row.ts).getTime());
      metrics.observe('worker_tick_freshness_ms', freshnessMs);
    }
  } catch (err) {
    ctx.log.warn('tick freshness probe failed', { err: String(err) });
  }

  await flushMetrics();

  return {
    processed: 1,
    note: `tick_freshness_ms=${freshnessMs === null ? 'no-ticks' : freshnessMs}`,
  };
}
