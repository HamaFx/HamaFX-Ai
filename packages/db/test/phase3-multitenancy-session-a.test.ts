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

import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { closePGliteDb, getPGliteDb, executeWithFallback, sanitizeStatement } from '../src/pglite-client';

const HERE = dirname(fileURLToPath(import.meta.url));
const DRIZZLE_DIR = join(HERE, '..', 'drizzle');

function stripComments(sql: string): string {
  const lines = sql.split('\n');
  while (lines.length > 0 && (lines[0]!.trim() === '' || lines[0]!.trim().startsWith('--'))) {
    lines.shift();
  }
  return lines.join('\n').trim();
}

async function applyOne(db: Awaited<ReturnType<typeof getPGliteDb>>, tag: string): Promise<void> {
  const rawSql = readFileSync(join(DRIZZLE_DIR, `${tag}.sql`), 'utf-8');
  for (const stmt of rawSql.split('--> statement-breakpoint')) {
    const trimmed = stripComments(stmt.trim());
    if (!trimmed) continue;
    const safe = sanitizeStatement(trimmed);
    if (!safe.trim() || safe.trim().startsWith('--')) continue;
    await executeWithFallback(db, safe);
  }
}

async function applyAllThrough(
  db: Awaited<ReturnType<typeof getPGliteDb>>,
  lastTag: string,
): Promise<void> {
  const journal = JSON.parse(readFileSync(join(DRIZZLE_DIR, 'meta', '_journal.json'), 'utf-8')) as {
    entries: Array<{ tag: string }>;
  };

  for (const entry of journal.entries) {
    await applyOne(db, entry.tag);
    if (entry.tag === lastTag) return;
  }

  throw new Error(`Migration ${lastTag} not found in journal`);
}

describe('Phase 3 Session A — multi-tenancy foundation', () => {
  let dir: string;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'hamafx-phase3-mt-'));
  });

  afterEach(async () => {
    await closePGliteDb();
  });

  it('backfills tenant_id on existing rows and finalizes required constraints', async () => {
    const db = await getPGliteDb(dir);
    await applyAllThrough(db, '0034_breezy_absorbing_man');

    await db.execute(
      `INSERT INTO "user" ("id", "email", "name", "role") VALUES ('u-phase3-existing', 'existing@example.com', 'Existing User', 'user')`,
    );
    await db.execute(`INSERT INTO "user_settings" ("user_id") VALUES ('u-phase3-existing')`);
    await db.execute(
      `INSERT INTO "chat_threads" ("id", "user_id", "title") VALUES ('11111111-1111-4111-8111-111111111111', 'u-phase3-existing', 'Legacy thread')`,
    );
    await db.execute(
      `INSERT INTO "chat_messages" ("id", "thread_id", "role", "content") VALUES ('22222222-2222-4222-8222-222222222222', '11111111-1111-4111-8111-111111111111', 'user', 'legacy message')`,
    );
    await db.execute(
      `INSERT INTO "decision_signals" ("id", "user_id", "symbol", "action", "bias", "horizon", "anchor_price", "anchor_at", "source_type") VALUES ('33333333-3333-4333-8333-333333333333', 'u-phase3-existing', 'XAUUSD', 'buy', 'bullish', 'intraday', 2300, now(), 'chat')`,
    );
    await db.execute(
      `INSERT INTO "decision_signal_outcomes" ("id", "signal_id", "horizon", "eval_status") VALUES ('44444444-4444-4444-8444-444444444444', '33333333-3333-4333-8333-333333333333', '1d', 'completed')`,
    );
    await db.execute(
      `INSERT INTO "journal_entries" ("id", "user_id", "symbol", "side", "opened_at", "entry") VALUES ('55555555-5555-4555-8555-555555555555', 'u-phase3-existing', 'XAUUSD', 'long', now(), 2310)`,
    );

    await applyOne(db, '0035_phase3_multitenancy_foundation');
    await applyOne(db, '0036_phase3_tenant_constraints');

    const org = await db.execute(
      `SELECT id, name FROM "organization" WHERE id = 'u-phase3-existing'`,
    );
    expect(org.rows).toHaveLength(1);

    const membership = await db.execute(
      `SELECT role FROM "organization_member" WHERE org_id = 'u-phase3-existing' AND user_id = 'u-phase3-existing'`,
    );
    expect(membership.rows[0]?.role).toBe('owner');

    for (const [table, predicate] of [
      ['user_settings', `user_id = 'u-phase3-existing'`],
      ['chat_threads', `id = '11111111-1111-4111-8111-111111111111'`],
      ['chat_messages', `id = '22222222-2222-4222-8222-222222222222'`],
      ['decision_signals', `id = '33333333-3333-4333-8333-333333333333'`],
      ['decision_signal_outcomes', `id = '44444444-4444-4444-8444-444444444444'`],
      ['journal_entries', `id = '55555555-5555-4555-8555-555555555555'`],
    ] as const) {
      const result = await db.execute(`SELECT tenant_id FROM "${table}" WHERE ${predicate}`);
      expect(result.rows[0]?.tenant_id).toBe('u-phase3-existing');
    }

    const tenantNullability = await db.execute(`
      SELECT table_name, is_nullable
      FROM information_schema.columns
      WHERE column_name = 'tenant_id'
        AND table_name IN ('journal_entries', 'chat_messages', 'decision_signal_outcomes')
      ORDER BY table_name
    `);
    expect(
      tenantNullability.rows.every((row: Record<string, unknown>) => row.is_nullable === 'NO'),
    ).toBe(true);

    const journalIndex = await db.execute(
      `SELECT indexname FROM pg_indexes WHERE schemaname = 'public' AND indexname = 'journal_entries_tenant_opened_idx'`,
    );
    expect(journalIndex.rows).toHaveLength(1);

    const candlesDupIndex = await db.execute(
      `SELECT indexname FROM pg_indexes WHERE schemaname = 'public' AND indexname = 'candles_1m_symbol_t_idx'`,
    );
    expect(candlesDupIndex.rows).toHaveLength(0);
  });

  it('keeps post-migration inserts working through provisioning and tenant triggers', async () => {
    const db = await getPGliteDb(dir);
    await applyAllThrough(db, '0036_phase3_tenant_constraints');

    await db.execute(
      `INSERT INTO "user" ("id", "email", "name", "role") VALUES ('u-phase3-new', 'new@example.com', 'New User', 'user')`,
    );

    const org = await db.execute(`SELECT id FROM "organization" WHERE id = 'u-phase3-new'`);
    expect(org.rows).toHaveLength(1);

    await db.execute(`INSERT INTO "user_settings" ("user_id") VALUES ('u-phase3-new')`);
    await db.execute(
      `INSERT INTO "chat_threads" ("id", "user_id", "title") VALUES ('66666666-6666-4666-8666-666666666666', 'u-phase3-new', 'Fresh thread')`,
    );
    await db.execute(
      `INSERT INTO "chat_messages" ("id", "thread_id", "role", "content") VALUES ('77777777-7777-4777-8777-777777777777', '66666666-6666-4666-8666-666666666666', 'assistant', 'fresh message')`,
    );
    await db.execute(
      `INSERT INTO "journal_entries" ("id", "user_id", "symbol", "side", "opened_at", "entry") VALUES ('88888888-8888-4888-8888-888888888888', 'u-phase3-new', 'EURUSD', 'short', now(), 1.08)`,
    );

    for (const [table, predicate] of [
      ['user_settings', `user_id = 'u-phase3-new'`],
      ['chat_threads', `id = '66666666-6666-4666-8666-666666666666'`],
      ['chat_messages', `id = '77777777-7777-4777-8777-777777777777'`],
      ['journal_entries', `id = '88888888-8888-4888-8888-888888888888'`],
    ] as const) {
      const result = await db.execute(`SELECT tenant_id FROM "${table}" WHERE ${predicate}`);
      expect(result.rows[0]?.tenant_id).toBe('u-phase3-new');
    }
  });
});
