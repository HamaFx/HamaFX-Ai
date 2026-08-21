#!/usr/bin/env node
/**
 * Copyright 2026 Kestrel
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

import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { drizzle } from 'drizzle-orm/postgres-js';
import { migrate } from 'drizzle-orm/postgres-js/migrator';
import postgres from 'postgres';

const __dirname = dirname(fileURLToPath(import.meta.url));
const DRIZZLE_DIR = resolve(__dirname, '..', 'drizzle');

const databaseUrl =
  process.env.DIRECT_URL ||
  process.env.POSTGRES_URL_NON_POOLING ||
  process.env.DATABASE_URL ||
  process.env.POSTGRES_URL;

if (!databaseUrl) {
  console.error('[migrate:apply] No database URL found in environment');
  process.exit(1);
}

const ca = process.env.SUPABASE_CA_CERT?.replace(/\\n/g, '\n').trim();
const productionTls =
  process.env.VERCEL_ENV === 'production' || process.env.NODE_ENV === 'production';

const sslOption = ca
  ? { ca, rejectUnauthorized: true }
  : process.env.DB_DISABLE_SSL === 'true'
    ? false
    : productionTls && !databaseUrl.includes('supabase.co') && !databaseUrl.includes('supabase.com') && !databaseUrl.includes('pooler')
      ? { rejectUnauthorized: true }
      : { rejectUnauthorized: false };

const sql = postgres(databaseUrl, {
  prepare: false,
  max: 1,
  ssl: sslOption,
});

try {
  const db = drizzle(sql);
  console.log('[migrate:apply] Applying migrations using postgres.js...');
  await migrate(db, { migrationsFolder: DRIZZLE_DIR });
  console.log('[migrate:apply] OK — migrations applied successfully.');
} catch (err) {
  console.error('[migrate:apply] Migration failed:', err);
  process.exit(1);
} finally {
  await sql.end({ timeout: 5 });
}
