// Drizzle client. Node runtime only — postgres-js does not work on Edge.
// Routes that touch this module must export `runtime = 'nodejs'`.

import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';

import * as schema from './schema/index';

let _client: ReturnType<typeof drizzle> | null = null;
let _sql: ReturnType<typeof postgres> | null = null;

/**
 * Lazy-initialised drizzle client. We use a module-scope singleton so cold
 * Vercel functions reuse the same connection pool across invocations within
 * the same Node process.
 */
export function getDb(): ReturnType<typeof drizzle> {
  if (_client) return _client;

  // Accept DATABASE_URL or POSTGRES_URL (the Supabase Vercel integration
  // provisions POSTGRES_URL on the transaction pooler).
  const url = process.env.DATABASE_URL || process.env.POSTGRES_URL;
  if (!url) {
    throw new Error(
      'Neither DATABASE_URL nor POSTGRES_URL is set — getDb() called without env config',
    );
  }

  // Supabase pooler in transaction mode requires `prepare: false`. The pooler
  // doesn't support prepared statements; postgres-js otherwise tries to use them.
  _sql = postgres(url, {
    prepare: false,
    max: 1,
    idle_timeout: 20,
    connect_timeout: 10,
  });

  _client = drizzle(_sql, { schema });
  return _client;
}

/** For tests / scripts only — closes the underlying pool. */
export async function closeDb(): Promise<void> {
  if (_sql) {
    await _sql.end({ timeout: 5 });
    _sql = null;
    _client = null;
  }
}

export { schema };
