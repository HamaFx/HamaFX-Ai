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

// Verifies the migration-runner rename upgrade path.
//
// Background: when a migration file is renamed (see commit fd346ce),
// the persisted PGlite DB still records the OLD tag in
// __drizzle_migrations. Without the TAG_ALIASES self-heal in
// applyMigrations(), the runner would try to re-apply the new file
// and fail with "relation X already exists" because the tables were
// created by the OLD file.
//
// This test simulates that pre-fix state and proves the self-heal
// works without touching the real .hamafx/data/ directory.

import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import {
  applyMigrations,
  closePGliteDb,
  getPGliteDb,
} from '../src/pglite-client';

describe('applyMigrations — rename upgrade path (fd346ce)', () => {
  let dataDir: string;

  beforeEach(() => {
    dataDir = mkdtempSync(join(tmpdir(), 'hamafx-pglite-test-'));
  });

  afterEach(async () => {
    await closePGliteDb();
    rmSync(dataDir, { recursive: true, force: true });
  });

  it('applies a clean set of migrations on first run', async () => {
    await applyMigrations(dataDir);

    const db = await getPGliteDb(dataDir);
    const { rows } = await db.execute<{ hash: string }>(
      'SELECT hash FROM "__drizzle_migrations" ORDER BY id',
    );
    const tags = rows.map((r) => r.hash);

    // All canonical (post-rename) tags should be present.
    expect(tags).toContain('0003_alert_system');
    expect(tags).toContain('0009_news_articles');
    expect(tags).toContain('0012_default_models');
    // None of the OLD pre-rename tags should be recorded on a fresh DB.
    expect(tags).not.toContain('0003_phase_3');
  });

  it('self-heals when an OLD alias tag is in __drizzle_migrations', async () => {
    // First apply — populates tables and records canonical (NEW) tags.
    await applyMigrations(dataDir);

    // Now simulate the pre-fix state: a user who applied the OLD
    // migration names. Their __drizzle_migrations table has the OLD
    // hashes, and the tables exist.
    const db = await getPGliteDb(dataDir);
    await db.execute(
      `DELETE FROM "__drizzle_migrations"
       WHERE hash IN ('0003_alert_system', '0004_journal_system',
                      '0005_market_data', '0006_dashboard_layout',
                      '0007_idempotency_keys', '0008_handoff_tables',
                      '0009_news_articles')`,
    );
    await db.execute(
      `INSERT INTO "__drizzle_migrations" (hash, created_at) VALUES
        ('0003_phase_3', ${Date.now() - 1000}),
        ('0004_phase_7b_memory_index', ${Date.now() - 900}),
        ('0005_phase_8_live_data', ${Date.now() - 800}),
        ('0006_phase1_hardening', ${Date.now() - 700}),
        ('0007_high_gateway', ${Date.now() - 600}),
        ('0008_glamorous_lorna_dane', ${Date.now() - 500}),
        ('0009_rare_iron_fist', ${Date.now() - 400})`,
    );

    // Second apply — this is where the pre-fix code would crash with
    // "relation cot_reports already exists" because 0003_alert_system
    // tries to CREATE TABLE cot_reports but it already exists from
    // the previous apply. The self-heal should detect the alias and
    // skip without re-executing the SQL.
    await expect(applyMigrations(dataDir)).resolves.not.toThrow();

    // After self-heal, both OLD and NEW tags may be present — the
    // important assertion is that applyMigrations() did NOT throw.
    const { rows } = await db.execute<{ hash: string }>(
      'SELECT hash FROM "__drizzle_migrations" ORDER BY id',
    );
    const tags = rows.map((r) => r.hash);
    expect(tags).toContain('0003_alert_system');
    expect(tags).toContain('0009_news_articles');
  });

  it('is idempotent — running apply twice does not error', async () => {
    await applyMigrations(dataDir);
    await expect(applyMigrations(dataDir)).resolves.not.toThrow();
  });
});
