// SPDX-License-Identifier: Apache-2.0

// Phase 8 — Task 39: Database health check endpoint
//
// Verifies:
//   1. Database connectivity (SELECT 1)
//   2. Migration count matches the expected number from the journal
//
// Returns 200 if both checks pass, 503 if either fails.

import { NextResponse } from 'next/server';
import { getDb } from '@hamafx/ai';
import { sql } from 'drizzle-orm';
import { readFileSync } from 'node:fs';

import { withAuth } from '@/lib/api';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function getExpectedMigrationCount(): number {
  try {
    const here = dirname(fileURLToPath(import.meta.url));
    const journalPath = join(here, '..', '..', '..', '..', '..', '..', 'packages', 'db', 'drizzle', 'meta', '_journal.json');
    const journal = JSON.parse(readFileSync(journalPath, 'utf-8')) as { entries: unknown[] };
    return journal.entries.length;
  } catch {
    return 32; // 0000–0031
  }
}

interface DbHealthResult {
  ok: boolean;
  connectivity: { ok: boolean; latencyMs?: number; message?: string };
  migrations: { ok: boolean; expected: number; actual?: number; message?: string };
}

export const GET = withAuth<void>(async () => {
  const expectedMigrations = getExpectedMigrationCount();

  let connectivity: DbHealthResult['connectivity'] = { ok: false };
  const start = Date.now();
  try {
    const db = getDb();
    await db.execute(sql`SELECT 1`);
    connectivity = { ok: true, latencyMs: Date.now() - start };
  } catch (err) {
    connectivity = {
      ok: false,
      latencyMs: Date.now() - start,
      message: err instanceof Error ? err.message : 'connectivity check failed',
    };
  }

  let migrations: DbHealthResult['migrations'] = { ok: false, expected: expectedMigrations };
  try {
    const db = getDb();
    const rows = await db.execute<{ count: string }>(sql`
      SELECT count(*)::text AS count FROM "__drizzle_migrations"
    `);
    const actual = Number((rows[0] as { count: string })?.count ?? 0);
    migrations = {
      ok: actual >= expectedMigrations,
      expected: expectedMigrations,
      actual,
      ...(actual < expectedMigrations ? { message: `missing ${expectedMigrations - actual} migrations` } : {}),
    };
  } catch (err) {
    migrations = {
      ok: false,
      expected: expectedMigrations,
      message: err instanceof Error ? err.message : 'migration count check failed',
    };
  }

  const allOk = connectivity.ok && migrations.ok;
  const status = allOk ? 'ok' : 'error';
  const httpStatus = allOk ? 200 : 503;

  const result: DbHealthResult = { ok: allOk, connectivity, migrations };

  return NextResponse.json(
    { status, ts: new Date().toISOString(), ...result },
    { status: httpStatus },
  );
});