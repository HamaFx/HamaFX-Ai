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

// Phase 10 — Migration hash stability CI guard
//
// This test ensures that applied migration files are never edited.
// Editing a migration file changes its SHA-256 hash, which causes
// drizzle-kit to try to re-apply it on the next deploy — typically
// failing because the DDL is non-idempotent.
//
// The baseline file (_hashes.json) is committed to the repo and
// checked by this test. New migrations are automatically handled:
// if a migration tag exists in the journal but not in _hashes.json,
// the test still passes (allowing new migrations to be added).
//
// To update the baseline after generating new migrations, run:
//   pnpm --filter @hamafx/db test -- --run migration-hash-stability
// and commit the regenerated _hashes.json.

import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

const HERE = dirname(fileURLToPath(import.meta.url));
const DRIZZLE_DIR = join(HERE, '..', 'drizzle');
const HASHES_PATH = join(DRIZZLE_DIR, 'meta', '_hashes.json');

interface HashEntry {
  tag: string;
  hash: string;
}

interface HashesFile {
  entries: HashEntry[];
}

function computeCurrentHashes(): Record<string, string> {
  const journal = JSON.parse(
    readFileSync(join(DRIZZLE_DIR, 'meta', '_journal.json'), 'utf-8'),
  ) as { entries: Array<{ tag: string }> };

  const hashes: Record<string, string> = {};
  for (const entry of journal.entries) {
    const sqlPath = join(DRIZZLE_DIR, `${entry.tag}.sql`);
    const content = readFileSync(sqlPath);
    hashes[entry.tag] = createHash('sha256').update(content).digest('hex');
  }
  return hashes;
}

function loadBaseline(): HashesFile | null {
  if (!existsSync(HASHES_PATH)) return null;
  return JSON.parse(readFileSync(HASHES_PATH, 'utf-8')) as HashesFile;
}

function saveBaseline(hashes: Record<string, string>): void {
  const entries: HashEntry[] = Object.entries(hashes)
    .map(([tag, hash]) => ({ tag, hash }))
    .sort((a, b) => a.tag.localeCompare(b.tag));
  writeFileSync(HASHES_PATH, JSON.stringify({ entries }, null, 2) + '\n');
}

describe('Phase 10 — Migration hash stability guard', () => {
  it('no previously-applied migration file has been edited', () => {
    const currentHashes = computeCurrentHashes();
    const baseline = loadBaseline();

    if (!baseline) {
      // No baseline exists yet — create one and pass.
      saveBaseline(currentHashes);
      return;
    }

    const baselineMap = new Map(baseline.entries.map((e) => [e.tag, e.hash]));
    const changed: string[] = [];

    for (const [tag, currentHash] of Object.entries(currentHashes)) {
      const baselineHash = baselineMap.get(tag);
      if (baselineHash && baselineHash !== currentHash) {
        changed.push(tag);
      }
    }

    if (changed.length > 0) {
      const list = changed.map((t) => `  - ${t}`).join('\n');
      expect.fail(
        `The following migration files have been edited since they were last baselined:\n${list}\n\n` +
          'Do NOT edit applied migration files. Create a NEW migration to fix issues.\n' +
          'If you intentionally changed these files, update the baseline by deleting\n' +
          `${HASHES_PATH} and re-running this test.`,
      );
    }

    // Update baseline with any new migrations that have been added.
    const hasNew = Object.keys(currentHashes).some((tag) => !baselineMap.has(tag));
    if (hasNew) {
      saveBaseline(currentHashes);
    }
  });
});
