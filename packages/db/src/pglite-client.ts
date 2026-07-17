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
 * Strip pgvector-specific statements from SQL and handle other
 * PGlite-incompatible constructs.
 *
 * Exported so test files can import the same sanitization logic instead
 * of duplicating it (MIG-6). This is the single source of truth.
 *
 * PGlite (WASM-embedded Postgres) does not support:
 *   - CREATE/ALTER ROLE (role management)
 *   - GRANT / ALTER DEFAULT PRIVILEGES (permissions model)
 *   - Row-Level Security (ALTER TABLE ... ENABLE/FORCE ROW LEVEL SECURITY)
 *   - CREATE/DROP POLICY (RLS policies)
 * These are silently replaced with -- comments so migrations apply cleanly
 * on local/dev PGlite instances while being no-ops.
 *
 * PL/pgSQL DO $$ blocks are NOT skipped here because many contain
 * legitimate operations (CHECK constraint creation, ENUM type creation).
 * Instead, multi-statement execution is handled by the callers via
 * a raw PGlite exec() fallback (see executeWithFallback).
 */
export function sanitizeStatement(sql: string): string {
  const trimmed = sql.trim();

  // Skip role management statements (not supported in PGlite).
  if (/^CREATE\s+ROLE\b/i.test(trimmed) || /^ALTER\s+ROLE\b/i.test(trimmed)) {
    return '-- [pglite] ROLE management skipped (not supported in embedded Postgres)';
  }

  // Skip GRANT and ALTER DEFAULT PRIVILEGES (permissions not applicable in PGlite).
  if (/^GRANT\b/i.test(trimmed) || /^ALTER\s+DEFAULT\s+PRIVILEGES\b/i.test(trimmed)) {
    return '-- [pglite] GRANT/PRIVILEGES skipped (not applicable in embedded Postgres)';
  }

  // Skip RLS-related statements (not supported in PGlite).
  if (
    /^ALTER\s+TABLE\s+.*?\s+(ENABLE|DISABLE|NO\s+FORCE)\s+ROW\s+LEVEL\s+SECURITY/i.test(trimmed) ||
    /^ALTER\s+TABLE\s+.*?\s+FORCE\s+ROW\s+LEVEL\s+SECURITY/i.test(trimmed) ||
    /^CREATE\s+POLICY\b/i.test(trimmed) ||
    /^DROP\s+POLICY\b/i.test(trimmed)
  ) {
    return '-- [pglite] Row-Level Security skipped (not supported in embedded Postgres)';
  }

  // Apply standard pgvector sanitization.
  return trimmed
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
        // drizzle-orm 0.45+ wraps PGlite errors with "Failed query:" prefix.
        // Extract the underlying message from err.cause when present.
        const causeMsg =
          err instanceof Error && err.cause instanceof Error
            ? err.cause.message
            : undefined;
        const msg =
          causeMsg ??
          (err instanceof Error ? err.message : String(err));
        // Silently skip pgvector-related failures (PGlite lacks the
        // vector extension; the schema has a `real[]` fallback).
        if (msg.includes('vector') || msg.includes('hnsw') || msg.includes('extension')) {
          continue;
        }
        // When drizzle's db.execute() fails with multi-statement errors
        // (e.g. DO $$ blocks, grouped DROP TRIGGER statements), retry
        // via the raw PGlite exec() which can handle multi-command SQL.
        if (msg.includes('cannot insert multiple commands')) {
          try {
            await _pglite!.exec(safeStmt);
          } catch (rawErr) {
            const rawMsg = rawErr instanceof Error ? rawErr.message : String(rawErr);
            // If raw exec() also fails with a PGlite-incompatible error,
            // skip the statement silently.
            if (
              rawMsg.includes('vector') || rawMsg.includes('hnsw') ||
              (rawMsg.includes('relation') && rawMsg.includes('does not exist')) ||
              (rawMsg.includes('column') && rawMsg.includes('does not exist')) ||
              rawMsg.includes('depend') || rawMsg.includes('already exists')
            ) {
              continue;
            }
            throw rawErr;
          }
          continue;
        }
        // Silently skip "relation does not exist" when dropping
        // indexes or policies that may not exist in PGlite.
        if (msg.includes('relation') && msg.includes('does not exist')) {
          continue;
        }
        // Silently skip "column does not exist" — may happen when
        // ALTER TABLE references columns from other migrations that
        // were skipped (e.g. tenant_id on ENABLE RLS statements).
        if (msg.includes('column') && msg.includes('does not exist')) {
          continue;
        }
        // Silently skip dependency errors — e.g. "cannot drop function...
        // because other objects depend on it" when DROP TRIGGER was
        // skipped (multi-statement). The CREATE OR REPLACE FUNCTION
        // that follows handles the update without needing the drop.
        if (msg.includes('depend') || msg.includes('dependent')) {
          continue;
        }
        // Silently skip "already exists" errors — PGlite may already
        // have objects (triggers, indexes) from earlier migration steps
        // that DROP statements (which were skipped) were meant to remove.
        if (msg.includes('already exists')) {
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
 * Get the raw PGlite instance for direct SQL execution.
 * @throws if PGlite has not been initialized via getPGliteDb().
 */
export function getRawPGlite(): PGlite {
  if (!_pglite) throw new Error('PGlite not initialized — call getPGliteDb() first');
  return _pglite;
}

/**
 * Execute SQL with automatic fallback: tries drizzle's prepared statement
 * path (db.execute) first, and if that fails with "cannot insert multiple
 * commands", retries via the raw PGlite exec() which supports multi-statement
 * SQL like DO $$ blocks.
 *
 * Exported so test files (which have their own applyOne functions) can use
 * the same fallback logic without duplicating the try/catch logic.
 */
export async function executeWithFallback(
  db: PgliteDatabase<typeof schema>,
  sql: string,
): Promise<void> {
  try {
    await db.execute(sql);
  } catch (err) {
    // drizzle-orm 0.45+ wraps PGlite errors with "Failed query:" prefix,
    // placing the original error in err.cause. We must check the
    // underlying error message, not the wrapper, to detect
    // PGlite-incompatible multi-statement SQL.
    const causeMsg =
      err instanceof Error && err.cause instanceof Error
        ? err.cause.message
        : undefined;
    const msg =
      causeMsg ??
      (err instanceof Error ? err.message : String(err));
    if (msg.includes('cannot insert multiple commands')) {
      try {
        await _pglite!.exec(sql);
      } catch {
        // If raw exec() also fails, the statement is PGlite-incompatible.
        // Silently skip — these migrations are validated on real Postgres.
      }
      return;
    }
    throw err;
  }
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
