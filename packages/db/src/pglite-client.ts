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

// PGlite client — in-process Postgres for local development.
//
// Activated when neither DATABASE_URL nor POSTGRES_URL is set.
// Stores data in .hamafx/data/ (gitignored). Runs migrations on first boot.
//
// NEVER import this module from Edge/middleware code — PGlite is Node-only.

import { existsSync, mkdirSync, readFileSync, readdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { PGlite } from '@electric-sql/pglite';
import { drizzle, type PgliteDatabase } from 'drizzle-orm/pglite';
import * as schema from './schema/index';

const DEFAULT_DATA_DIR = resolve('.hamafx/data');
const MIGRATIONS_DIR = new URL('../drizzle', import.meta.url).pathname;

let _pglite: PGlite | null = null;
let _db: PgliteDatabase<typeof schema> | null = null;
let _migrationsApplied = false;
let _activeDataDir: string | null = null;

/**
 * Strip pgvector-specific statements from SQL.
 */
function sanitizeStatement(sql: string): string {
  return sql
    .replace(
      /CREATE\s+EXTENSION\s+IF\s+NOT\s+EXISTS\s+"vector".*?;/gi,
      '-- [pglite] pgvector extension skipped',
    )
    .replace(
      /"embedding"\s+vector\(\d+\)/gi,
      '"embedding" real[]',
    )
    .replace(
      /CREATE\s+INDEX\s+.*?\s+USING\s+hnsw\s*\(.*?vector_cosine_ops.*?\);/gi,
      '-- [pglite] HNSW index skipped (requires pgvector)',
    );
}

/**
 * Read journal entries in order.
 */
function readJournal(): Array<{ tag: string }> {
  const journalPath = join(MIGRATIONS_DIR, 'meta', '_journal.json');
  if (!existsSync(journalPath)) return [];
  const journal = JSON.parse(readFileSync(journalPath, 'utf-8'));
  return (journal.entries ?? []).map((e: { tag: string }) => ({ tag: e.tag }));
}

/**
 * Tag alias map for migration renames.
 *
 * The PGlite runner keys migrations by `journal.tag` (the SQL filename
 * prefix). When a migration file is renamed in a later commit, the
 * journal entry updates but any persisted PGlite DB still records the
 * OLD tag in `__drizzle_migrations`. Without this map the runner would
 * try to re-apply the new file and fail with "relation already exists".
 *
 * This map documents those renames so the runner can recognise an OLD
 * tag as equivalent to its NEW replacement. Add a new entry here when
 * renaming a migration file in a future commit — keep the old name as
 * the key, the new name as the value.
 *
 * History:
 *   fd346ce — synced migration file names with their journal entries
 *             (e.g. 0003_phase_3 → 0003_alert_system). Persisted
 *             PGlite DBs from before that commit still hold the OLD
 *             hashes; this map makes the rename transparent.
 */
const TAG_ALIASES: Record<string, string> = {
  '0003_phase_3': '0003_alert_system',
  '0004_phase_7b_memory_index': '0004_journal_system',
  '0005_phase_8_live_data': '0005_market_data',
  '0006_phase1_hardening': '0006_dashboard_layout',
  '0007_high_gateway': '0007_idempotency_keys',
  '0008_glamorous_lorna_dane': '0008_handoff_tables',
  '0009_rare_iron_fist': '0009_news_articles',
};

/**
 * Get a PGlite drizzle instance. Pass `dataDir` to override the
 * default `.hamafx/data/` location (used by tests to isolate state).
 */
export async function getPGliteDb(
  dataDir: string = DEFAULT_DATA_DIR,
): Promise<PgliteDatabase<typeof schema>> {
  if (_db && _activeDataDir === dataDir) return _db;
  // Reset module state when switching to a different data dir so the
  // singleton doesn't leak across test boundaries.
  if (_pglite && _activeDataDir !== dataDir) {
    await _pglite.close().catch(() => {});
    _pglite = null;
    _db = null;
    _migrationsApplied = false;
  }
  _activeDataDir = dataDir;
  mkdirSync(dataDir, { recursive: true });
  _pglite = new PGlite(dataDir);
  _db = drizzle(_pglite, { schema });
  return _db;
}

/**
 * Apply migrations one SQL statement at a time.
 * Splits drizzle migration files on '--> statement-breakpoint'
 * and executes each chunk individually, silently skipping
 * any statement that references pgvector features.
 *
 * Pass `dataDir` to isolate state from the default `.hamafx/data/`
 * location (used by tests).
 */
export async function applyMigrations(dataDir?: string): Promise<void> {
  if (dataDir) {
    // Bypass the singleton cache so tests can target a temp dir.
    _migrationsApplied = false;
    if (_pglite && _activeDataDir !== dataDir) {
      await _pglite.close().catch(() => {});
      _pglite = null;
      _db = null;
    }
    _activeDataDir = dataDir;
  }

  if (_migrationsApplied) return;

  const db = await getPGliteDb(dataDir);
  const journal = readJournal();

  // Create tracking table
  await db.execute(
    `CREATE TABLE IF NOT EXISTS "__drizzle_migrations" (
      id SERIAL PRIMARY KEY,
      hash text NOT NULL,
      created_at bigint
    )`,
  );

  // Get already-applied tags
  const { rows } = await db.execute(
    'SELECT hash FROM "__drizzle_migrations"',
  );
  const applied = new Set(rows.map((r: Record<string, unknown>) => String(r.hash)));

  // Self-heal renames: if any OLD alias tag is in `applied`, insert the
  // NEW tag (idempotent) so future runs use the canonical name. This
  // handles the fd346ce migration-file rename for users (and tests)
  // who already applied the old hashes to a persisted PGlite DB.
  for (const oldTag of Object.keys(TAG_ALIASES)) {
    if (applied.has(oldTag) && !applied.has(TAG_ALIASES[oldTag]!)) {
      const newTag = TAG_ALIASES[oldTag]!;
      await db.execute(
        `INSERT INTO "__drizzle_migrations" (hash, created_at)
         VALUES ('${newTag}', ${Date.now()})
         ON CONFLICT DO NOTHING`,
      );
      applied.add(newTag);
    }
  }

  let ok = 0;

  for (const entry of journal) {
    if (applied.has(entry.tag)) continue;

    const files = readdirSync(MIGRATIONS_DIR);
    const sqlFile = files.find(
      (f) => f.startsWith(entry.tag) && f.endsWith('.sql'),
    );
    if (!sqlFile) continue;

    const rawSql = readFileSync(join(MIGRATIONS_DIR, sqlFile), 'utf-8');

    // Split on drizzle's statement breakpoint marker
    const statements = rawSql.split('--> statement-breakpoint');

    for (const stmt of statements) {
      let trimmed = stmt.trim();
      if (!trimmed) continue;

      // Strip leading `--` comment lines AND blank lines from the chunk.
      // Drizzle's statement-breakpoint separates executable statements,
      // but the preceding lines are usually a `-- comment block` followed
      // by a blank line before the actual statement. Skip both.
      const lines = trimmed.split('\n');
      while (
        lines.length > 0 &&
        (lines[0]!.trim() === '' || lines[0]!.trim().startsWith('--'))
      ) {
        lines.shift();
      }
      trimmed = lines.join('\n').trim();
      if (!trimmed) continue;

      const safeStmt = sanitizeStatement(trimmed);

      try {
        await db.execute(safeStmt);
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        // Silently skip pgvector-related failures (PGlite lacks the
        // vector extension; the schema has a `real[]` fallback).
        if (msg.includes('vector') || msg.includes('hnsw') || msg.includes('extension')) {
          continue;
        }
        // Anything else is a real bug — surface it so the dev sees
        // the problem instead of a silently-broken DB.
        // (Previously this branch swallowed the error, which is how
        // we ended up with `_migrationsApplied=true` and zero tables.)
        throw new Error(
          `[pglite] statement in ${entry.tag} failed: ${msg.slice(0, 200)}`,
        );
      }
    }

    // Mark this migration as applied
    await db.execute(
      `INSERT INTO "__drizzle_migrations" (hash, created_at) VALUES ('${entry.tag}', ${Date.now()})`,
    );
    applied.add(entry.tag);
    ok++;
  }

  _migrationsApplied = true;
  console.info(`[pglite] migrations: ${ok} applied, vector features skipped`);
}

/**
 * Close the PGlite connection.
 */
export async function closePGliteDb(): Promise<void> {
  if (_pglite) {
    await _pglite.close();
    _pglite = null;
    _db = null;
    _migrationsApplied = false;
  }
}