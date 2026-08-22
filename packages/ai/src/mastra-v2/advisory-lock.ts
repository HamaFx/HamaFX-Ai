// SPDX-License-Identifier: Apache-2.0

/**
 * Postgres advisory lock for multi-worker workflow claim safety.
 *
 * The durable full-analysis queue's `claimNextFullAnalysisRun` uses a
 * read-verify-write pattern that is safe for a single worker. When multiple
 * workers are deployed, a Postgres advisory lock serializes the claim scan
 * so two workers cannot both claim the same pending run.
 *
 * Advisory locks are session-scoped: they are automatically released when
 * the DB connection is returned to the pool (or the session disconnects),
 * so a worker crash never leaves a stuck lock. The lock is best-effort:
 * if the DB is not Postgres or the call fails, the caller falls back to
 * the existing read-verify-write pattern.
 */

import { sql } from 'drizzle-orm';
import { getDb } from '@kestrel/db';
import { createCategorizedLogger } from '@kestrel/shared/logger';

const alog = createCategorizedLogger('ai', { component: 'mastra-advisory-lock' });

/**
 * Try to acquire a Postgres advisory lock for a workflow claim.
 * Returns a release function. When the lock cannot be acquired (another
 * worker holds it) or the DB doesn't support advisory locks, returns a
 * no-op release and the caller falls back to read-verify-write.
 *
 * The release function is always safe to call — it no-ops when the lock
 * was never acquired or has already been released.
 */
export async function tryWorkflowClaimLock(
  workflowName: string,
): Promise<() => void> {
  let acquired = false;
  let key = 0;

  try {
    const db = getDb();
    key = hashTo32Bit(workflowName);
    const result = await db.execute(
      sql.raw(`SELECT pg_try_advisory_lock(${key}) AS acquired`),
    );
    const rows = result as unknown as Array<{ acquired?: boolean }>;
    acquired = rows[0]?.acquired === true;

    if (!acquired) {
      alog.debug('advisory lock not acquired (another worker holds it)', { workflowName, key });
    }
  } catch (error) {
    // Non-Postgres (PGlite), connection error, or missing getDb —
    // fall back to the existing read-verify-write claim.
    alog.warn('advisory lock failed; using read-verify-write fallback', {
      workflowName,
      error: error instanceof Error ? error.message : String(error),
    });
    return () => {};
  }

  if (!acquired) {
    return () => {};
  }

  return () => {
    try {
      const db = getDb();
      void db.execute(sql.raw(`SELECT pg_advisory_unlock(${key})`)).catch(() => {});
    } catch {
      // Best-effort — session disconnect releases automatically.
    }
  };
}

/**
 * Hash a workflow name into a positive 32-bit integer for the advisory
 * lock key. Uses a simple DJB2 variant — collisions only cause a missed
 * lock (not data corruption), and the workflow name space is tiny.
 */
function hashTo32Bit(input: string): number {
  let hash = 5381;
  for (let i = 0; i < input.length; i++) {
    hash = ((hash << 5) + hash + input.charCodeAt(i)) | 0;
  }
  return Math.abs(hash);
}
