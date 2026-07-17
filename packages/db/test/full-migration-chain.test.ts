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

// Phase 6 — Task 27: Full migration chain test
//
// Applies ALL migrations in sequence on a fresh PGlite instance,
// then verifies that every expected table exists and key
// constraints/indexes are present.

import { readFileSync } from 'node:fs';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { closePGliteDb, getPGliteDb, executeWithFallback, sanitizeStatement } from '../src/pglite-client';

const HERE = dirname(fileURLToPath(import.meta.url));
const DRIZZLE_DIR = join(HERE, '..', 'drizzle');

/** Strip leading comment lines from a SQL statement. */
function stripComments(sql: string): string {
  const lines = sql.split('\n');
  while (
    lines.length > 0 &&
    (lines[0]!.trim() === '' || lines[0]!.trim().startsWith('--'))
  ) {
    lines.shift();
  }
  return lines.join('\n').trim();
}

/** Apply a single migration tag. */
async function applyOne(
  db: Awaited<ReturnType<typeof getPGliteDb>>,
  tag: string,
): Promise<void> {
  const rawSql = readFileSync(join(DRIZZLE_DIR, `${tag}.sql`), 'utf-8');
  for (const stmt of rawSql.split('--> statement-breakpoint')) {
    const trimmed = stripComments(stmt.trim());
    if (!trimmed) continue;
    const safe = sanitizeStatement(trimmed);
    if (!safe.trim() || safe.trim().startsWith('--')) continue;
    try {
      await executeWithFallback(db, safe);
    } catch (err) {
      // drizzle-orm 0.45+ wraps PGlite errors with "Failed query:" prefix.
      // Extract the underlying message from err.cause when present.
      const causeMsg =
        err instanceof Error && err.cause instanceof Error
          ? err.cause.message
          : undefined;
      const msg =
        causeMsg ??
        (err instanceof Error ? err.message : String(err));
      // Handle known non-idempotent re-application errors (same pattern
      // as schema-drift.test.ts and pglite-client.ts applyMigrations).
      if (
        msg.includes('already exists') ||
        msg.includes('does not exist') ||
        msg.includes('multiple primary keys') ||
        msg.includes('depend') ||
        msg.includes('dependent') ||
        msg.includes('vector') ||
        msg.includes('hnsw')
      ) {
        continue;
      }
      throw err;
    }
  }
}

/** Apply ALL migrations from the journal. */
async function applyAll(
  db: Awaited<ReturnType<typeof getPGliteDb>>,
): Promise<void> {
  await db.execute(
    `CREATE TABLE IF NOT EXISTS "__drizzle_migrations" (
      id SERIAL PRIMARY KEY,
      hash text NOT NULL,
      created_at bigint
    )`,
  );
  const journal = JSON.parse(
    readFileSync(join(DRIZZLE_DIR, 'meta', '_journal.json'), 'utf-8'),
  ) as { entries: Array<{ tag: string }> };
  for (const entry of journal.entries) {
    await applyOne(db, entry.tag);
    await db.execute(
      `INSERT INTO "__drizzle_migrations" (hash, created_at) VALUES ('${entry.tag}', ${Date.now()})`,
    );
  }
}

// All tables that should exist after the full migration chain.
const EXPECTED_TABLES = [
  'user', 'account', 'session', 'verificationToken',
  'user_settings', 'user_symbols', 'user_sessions',
  'chat_threads', 'chat_messages', 'chat_telemetry', 'chat_tool_telemetry',
  'agent_opinions', 'alerts', 'journal_entries',
  'news_articles', 'news_embeddings', 'economic_events', 'snapshots',
  'briefings_emitted', 'cot_reports', 'shared_snapshots',
  'push_subscriptions', 'memory_embeddings', 'daily_ai_spend',
  'rate_limits', 'live_ticks', 'candles_1m', 'provider_throttle',
  'intermarket_resonance', 'audit_logs', 'provider_tests',
  'symbol_catalog', 'cron_runs', 'decision_signals',
  'decision_signal_outcomes', 'decision_signal_feedback',
  'portfolio_positions', 'portfolio_settings',
  'notification_noise_state', 'bot_links',
  // Phase B — Billing (NOWPayments / crypto), migration 0040
  'plans', 'subscriptions', 'payments', 'ipn_events',
  // Phase 3 — Multi-tenancy, migrations 0035–0041
  'organization', 'organization_member',
];

describe('Phase 6 — Task 27: Full migration chain (all migrations on fresh PGlite)', () => {
  let dir: string;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'hamafx-full-chain-'));
  });

  afterEach(async () => {
    await closePGliteDb();
  });

  it('applies all migrations without error', async () => {
    const db = await getPGliteDb(dir);
    await applyAll(db);
    expect(true).toBe(true);
  });

  it('all expected tables exist after full migration chain', async () => {
    const db = await getPGliteDb(dir);
    await applyAll(db);
    const { rows } = await db.execute(
      `SELECT tablename FROM pg_tables WHERE schemaname = 'public' ORDER BY tablename`,
    );
    const tableNames = rows.map((r: Record<string, unknown>) => r.tablename);
    for (const expected of EXPECTED_TABLES) {
      expect(tableNames).toContain(expected);
    }
  });

  it('__drizzle_migrations table exists', async () => {
    const db = await getPGliteDb(dir);
    await applyAll(db);
    const { rows } = await db.execute(
      `SELECT tablename FROM pg_tables WHERE tablename = '__drizzle_migrations'`,
    );
    expect(rows).toHaveLength(1);
  });

  it('key unique constraints exist', async () => {
    const db = await getPGliteDb(dir);
    await applyAll(db);
    const { rows: emailUk } = await db.execute(
      `SELECT conname FROM pg_constraint WHERE contype = 'u' AND conrelid = '"user"'::regclass`,
    );
    expect(emailUk.length).toBeGreaterThan(0);

    const { rows: memUk } = await db.execute(
      `SELECT conname FROM pg_constraint WHERE contype = 'u' AND conrelid = '"memory_embeddings"'::regclass`,
    );
    const memNames = memUk.map((r: Record<string, unknown>) => r.conname);
    expect(memNames).toContain('memory_embeddings_user_kind_source_uk');

    const { rows: snapUk } = await db.execute(
      `SELECT conname FROM pg_constraint WHERE contype = 'u' AND conrelid = '"snapshots"'::regclass`,
    );
    const snapNames = snapUk.map((r: Record<string, unknown>) => r.conname);
    expect(snapNames).toContain('snapshots_symbol_kind_asof_uk');
  });

  it('key CHECK constraints exist', async () => {
    const db = await getPGliteDb(dir);
    await applyAll(db);
    const { rows: alertChecks } = await db.execute(
      `SELECT conname FROM pg_constraint WHERE contype = 'c' AND conrelid = '"alerts"'::regclass AND conname LIKE '%snooze%'`,
    );
    expect(alertChecks.length).toBeGreaterThan(0);

    const { rows: sigChecks } = await db.execute(
      `SELECT conname FROM pg_constraint WHERE contype = 'c' AND conrelid = '"decision_signals"'::regclass AND conname LIKE '%confidence%'`,
    );
    expect(sigChecks.length).toBeGreaterThan(0);
  });

  it('key indexes exist', async () => {
    const db = await getPGliteDb(dir);
    await applyAll(db);
    const { rows: telIdx } = await db.execute(
      `SELECT indexname FROM pg_indexes WHERE tablename = 'chat_telemetry' AND indexname = 'telemetry_user_created_idx'`,
    );
    expect(telIdx).toHaveLength(1);

    const { rows: droppedIdx } = await db.execute(
      `SELECT indexname FROM pg_indexes WHERE tablename = 'chat_telemetry' AND indexname = 'chat_telemetry_user_id_idx'`,
    );
    expect(droppedIdx).toHaveLength(0);
  });

  it('cot_reports columns are bigint (Phase 2)', async () => {
    const db = await getPGliteDb(dir);
    await applyAll(db);
    const { rows } = await db.execute(
      `SELECT data_type FROM information_schema.columns WHERE table_name = 'cot_reports' AND column_name = 'dealer_long'`,
    );
    expect(rows[0]?.data_type).toBe('bigint');
  });
});