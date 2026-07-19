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

// OBS-03: Enhanced health endpoint.
//
// Checks:
//   db       — SELECT 1 to verify connectivity
//   env      — ensures critical env vars are present (no values exposed)
//   version  — deployed commit SHA from DEPLOYED_SHA env var
//
// Response schema:
//   200 — all checks passed; body: { status: 'ok', checks: {...}, ... }
//   503 — at least one check failed; body: { status: 'error', checks: {...}, ... }
//
// The full check response is deliberately kept low-sensitivity (no secrets,
// no user data). The per-check `ok` field surfaces in the Docker/Compose
// healthcheck and in uptime-monitoring alerts.
//
// OBS-04 addition: includes the count of jobs currently in `cron_runs` for
// the last 24 hours so the system-status card can detect stuck jobs.

import { NextResponse } from 'next/server';
import { getDb } from '@hamafx/db';
import { sql } from 'drizzle-orm';
import { REQUIRED_HEALTH_ENV_VARS } from '@hamafx/shared/env-secrets';

import { withAuth } from '@/lib/api';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

interface CheckResult {
  ok: boolean;
  latencyMs?: number;
  message?: string;
}

async function checkDb(): Promise<CheckResult> {
  const start = Date.now();
  try {
    const db = getDb();
    await db.execute(sql`SELECT 1`);
    return { ok: true, latencyMs: Date.now() - start };
  } catch (err) {
    return {
      ok: false,
      latencyMs: Date.now() - start,
      message: err instanceof Error ? err.message : 'db check failed',
    };
  }
}

// STAB-11: Verify pgvector extension is installed.
async function checkPgvector(): Promise<CheckResult> {
  try {
    const db = getDb();
    const rows = await db.execute<{ extname: string }>(sql`
      SELECT extname FROM pg_extension WHERE extname = 'vector'
    `);
    if (rows.length === 0) {
      return { ok: false, message: 'pgvector extension not installed' };
    }
    return { ok: true };
  } catch (err) {
    return { ok: false, message: err instanceof Error ? err.message : 'pgvector check failed' };
  }
}

async function checkCronRuns(): Promise<CheckResult & { recentRuns?: number; stuckRuns?: number }> {
  try {
    const db = getDb();
    const since = new Date(Date.now() - 24 * 60 * 60 * 1000);
    // Count recent cron runs and detect any that are stuck in 'started' > 5 min ago.
    const [row] = await db.execute<{ recent: string; stuck: string }>(sql`
      SELECT
        COUNT(*)::text AS recent,
        COUNT(*) FILTER (
          WHERE status = 'started'
          AND started_at < now() - INTERVAL '5 minutes'
        )::text AS stuck
      FROM cron_runs
      WHERE started_at >= ${since}
    `);
    return {
      ok: true,
      recentRuns: Number((row as { recent: string; stuck: string }).recent ?? 0),
      stuckRuns: Number((row as { recent: string; stuck: string }).stuck ?? 0),
    };
  } catch {
    // cron_runs table may not exist yet (pre-migration). Non-fatal.
    return { ok: true, message: 'cron_runs unavailable (may need migration)' };
  }
}

async function checkAnalysisJobs(): Promise<CheckResult & { pending?: number; stuckRunning?: number; stalePending?: number }> {
  try {
    const db = getDb();
    const [row] = await db.execute<{ pending: string; stuck_running: string; stale_pending: string }>(sql`
      SELECT
        COUNT(*) FILTER (WHERE status = 'pending')::text AS pending,
        COUNT(*) FILTER (
          WHERE status = 'running'
          AND started_at < now() - INTERVAL '30 seconds'
        )::text AS stuck_running,
        COUNT(*) FILTER (
          WHERE status = 'pending'
          AND created_at < now() - INTERVAL '10 minutes'
        )::text AS stale_pending
      FROM analysis_jobs
    `);
    return {
      ok: true,
      pending: Number(row?.pending ?? 0),
      stuckRunning: Number(row?.stuck_running ?? 0),
      stalePending: Number(row?.stale_pending ?? 0),
    };
  } catch {
    // analysis_jobs table may not exist yet (pre-migration). Non-fatal.
    return { ok: true, message: 'analysis_jobs unavailable (may need migration)' };
  }
}

function checkEnv(): CheckResult {
  const required = REQUIRED_HEALTH_ENV_VARS as readonly string[];
  const missing = required.filter((k) => !process.env[k]);
  if (missing.length > 0) {
    return { ok: false, message: `missing env vars: ${missing.join(', ')}` };
  }
  return { ok: true };
}

export const GET = withAuth<void>(async () => {
  const [dbCheck, cronCheck, analysisCheck] = await Promise.all([checkDb(), checkCronRuns(), checkAnalysisJobs()]);
  const envCheck = checkEnv();
  const pgvectorCheck = await checkPgvector();

  // OBS-13 (Phase 5.5): Include pgvector + stuck-cron in allOk.
  // Previously `allOk = dbCheck.ok && envCheck.ok` which meant a missing
  // pgvector extension or a stuck cron job still returned HTTP 200.
  // Now: a missing pgvector extension or stuck cron runs cause a 503
  // (degraded state), so uptime monitors correctly detect the issue.
  const cronOk = cronCheck.ok && (cronCheck.stuckRuns ?? 0) === 0;
  // CH-1: analysis jobs with stale pending rows (>10 min unclaimed) indicate
  // the worker is not processing the queue — treat as degraded.
  const analysisOk = analysisCheck.ok && (analysisCheck.stalePending ?? 0) === 0;
  const allOk = dbCheck.ok && envCheck.ok && pgvectorCheck.ok && cronOk && analysisOk;
  const status = allOk ? 'ok' : 'error';
  const httpStatus = allOk ? 200 : 503;

  return NextResponse.json(
    {
      status,
      ts: new Date().toISOString(),
      version: process.env.DEPLOYED_SHA ?? 'unknown',
      checks: {
        db: dbCheck,
        env: envCheck,
        cron: cronCheck,
        pgvector: pgvectorCheck,
        analysisJobs: analysisCheck,
      },
    },
    { status: httpStatus },
  );
});
