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

// Unified database client for local/Docker development.
//
// Auto-selects PGlite (embedded Postgres) when no DATABASE_URL is set,
// or connects to a remote Postgres when DATABASE_URL/POSTGRES_URL is set.
//
// NEVER import this from Edge/middleware routes — it's Node-only.

import { getDb, closeDb } from './client.js';
import {
  getPGliteDb,
  applyMigrations as applyPGliteMigrations,
  closePGliteDb,
} from './pglite-client.js';

type AnyDb = ReturnType<typeof getDb> | Awaited<ReturnType<typeof getPGliteDb>>;

let _mode: 'postgres' | 'pglite' | null = null;

/**
 * Get the best available database instance.
 *
 * - If DATABASE_URL (or POSTGRES_URL) is set → remote Postgres (prod, Docker).
 * - Otherwise → embedded PGlite (local dev, zero config).
 */
export async function getLocalDb(): Promise<AnyDb> {
  const url = process.env.DATABASE_URL || process.env.POSTGRES_URL;

  if (url) {
    _mode = 'postgres';
    return getDb();
  }

  _mode = 'pglite';
  return getPGliteDb();
}

/**
 * Apply all pending Drizzle migrations. Safe to call on every boot —
 * already-applied migrations are skipped. When running on PGlite,
 * pgvector-dependent tables are gracefully skipped.
 */
export async function ensureMigrations(): Promise<void> {
  const url = process.env.DATABASE_URL || process.env.POSTGRES_URL;

  if (url) {
    // Remote Postgres — use drizzle-kit migrate CLI (already applied by the
    // deploy/CI pipeline). For local Docker, the entrypoint.sh runs this.
    // We skip programmatic migration for remote PG to avoid pulling
    // drizzle-kit as a runtime dependency.
    return;
  }

  // PGlite — run migrations in-process
  await applyPGliteMigrations();
}

/**
 * Close the database connection. Idempotent.
 */
export async function closeLocalDb(): Promise<void> {
  if (_mode === 'pglite') {
    await closePGliteDb();
  } else if (_mode === 'postgres') {
    await closeDb();
  }
  _mode = null;
}

/** Returns 'pglite', 'postgres', or null if never initialized. */
export function getLocalDbMode(): string | null {
  return _mode;
}