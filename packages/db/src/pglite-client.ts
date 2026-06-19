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

const DATA_DIR = resolve('.hamafx/data');
const MIGRATIONS_DIR = new URL('../drizzle', import.meta.url).pathname;

let _pglite: PGlite | null = null;
let _db: PgliteDatabase<typeof schema> | null = null;
let _migrationsApplied = false;

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
 * Get a PGlite drizzle instance.
 */
export async function getPGliteDb(): Promise<PgliteDatabase<typeof schema>> {
  if (_db) return _db;
  mkdirSync(DATA_DIR, { recursive: true });
  _pglite = new PGlite(DATA_DIR);
  _db = drizzle(_pglite, { schema });
  return _db;
}

/**
 * Apply migrations one SQL statement at a time.
 * Splits drizzle migration files on '--> statement-breakpoint'
 * and executes each chunk individually, silently skipping
 * any statement that references pgvector features.
 */
export async function applyMigrations(): Promise<void> {
  if (_migrationsApplied) return;

  const db = await getPGliteDb();
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