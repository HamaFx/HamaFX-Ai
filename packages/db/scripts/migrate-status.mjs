#!/usr/bin/env node
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

// Phase 8 — Task 40: Migration status script
//
// Queries the database's __drizzle_migrations table and compares it
// against the journal to show which migrations have been applied and
// which are pending.
//
// Usage: pnpm --filter @hamafx/db migrate:status

import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const DRIZZLE_DIR = join(HERE, '..', 'drizzle');

const journalPath = join(DRIZZLE_DIR, 'meta', '_journal.json');
if (!existsSync(journalPath)) {
  console.error('No migration journal found. Run `pnpm migrate:gen` first.');
  process.exit(1);
}

const journal = JSON.parse(readFileSync(journalPath, 'utf-8'));
const journalEntries = journal.entries || [];

const sqlFiles = readdirSync(DRIZZLE_DIR).filter((f) => f.endsWith('.sql'));

console.log('\nMigration Status\n');
console.log(`   Journal entries: ${journalEntries.length}`);
console.log(`   SQL files found: ${sqlFiles.length}\n`);

let allFilesExist = true;
for (const entry of journalEntries) {
  const fileExists = sqlFiles.some((f) => f.startsWith(entry.tag));
  const status = fileExists ? 'OK' : 'MISSING';
  if (!fileExists) allFilesExist = false;
  console.log(`   [${status}]  ${entry.tag}`);
}

if (!allFilesExist) {
  console.log('\nSome migration files are missing. Run `pnpm migrate:gen` to regenerate.\n');
  process.exit(1);
}

const dbUrl = process.env.DATABASE_URL || process.env.POSTGRES_URL;
if (!dbUrl) {
  console.log('\nDATABASE_URL not set — showing file-based status only.');
  console.log('Set DATABASE_URL to check which migrations are applied in the database.\n');
  process.exit(0);
}

async function checkDatabase() {
  try {
    const { default: postgres } = await import('postgres');
    const sql = postgres(dbUrl, {
      prepare: false,
      ssl: { rejectUnauthorized: false },
    });

    try {
      const rows = await sql`
        SELECT hash, created_at FROM drizzle."__drizzle_migrations" ORDER BY id
      `;

      const appliedHashes = new Set(rows.map((r) => r.hash));

      const pending = [];
      for (const entry of journalEntries) {
        const sqlPath = join(DRIZZLE_DIR, `${entry.tag}.sql`);
        const fileContent = readFileSync(sqlPath);
        const fileHash = createHash('sha256').update(fileContent).digest('hex');
        if (!appliedHashes.has(fileHash)) {
          pending.push({ tag: entry.tag, hash: fileHash });
        }
      }

      console.log(`\n   Database has ${appliedHashes.size} applied migrations.\n`);

      if (pending.length > 0) {
        console.log('   Pending migrations:\n');
        for (const { tag, hash } of pending) {
          console.log(`      -> ${tag}  (hash: ${hash.substring(0, 12)}...)`);
        }
        console.log('\n   Run `pnpm migrate:apply` to apply pending migrations.\n');
      } else {
        console.log('   All migrations are applied.\n');
      }
    } finally {
      await sql.end({ timeout: 5 });
    }
  } catch (err) {
    console.error('\nCould not query database:', err instanceof Error ? err.message : err);
    process.exit(1);
  }
}

checkDatabase();