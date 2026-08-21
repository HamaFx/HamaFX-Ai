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

// drizzle-kit reads this when generating / applying migrations.
// Run from the package root: pnpm --filter @kestrel/db migrate:gen | migrate:apply

import { defineConfig } from 'drizzle-kit';

const databaseUrl =
  process.env.DIRECT_URL ||
  process.env.POSTGRES_URL_NON_POOLING ||
  process.env.DATABASE_URL ||
  process.env.POSTGRES_URL;
if (!databaseUrl) {
  // eslint-disable-next-line no-console
  console.warn(
    '[drizzle-kit] None of DIRECT_URL, POSTGRES_URL_NON_POOLING, DATABASE_URL, or POSTGRES_URL is set — generate-only commands will work, but migrate/studio will fail.',
  );
}

const ca = process.env.SUPABASE_CA_CERT?.replace(/\\n/g, '\n').trim();
const ssl = ca
  ? { ca, rejectUnauthorized: true }
  : process.env.DB_DISABLE_SSL === 'true'
    ? false
    : { rejectUnauthorized: false };

export default defineConfig({
  schema: './src/schema/index.ts',
  out: './drizzle',
  dialect: 'postgresql',
  dbCredentials: {
    url: databaseUrl ?? 'postgres://placeholder@localhost:5432/placeholder',
    ssl,
  },
  strict: true,
  verbose: true,
  // pgvector is enabled via a custom migration (see ./drizzle/0000_init_extensions.sql once generated).
  extensionsFilters: ['vector'] as unknown as ['postgis'],
});
