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

// Phase D2 — migration 0014 adds user_settings.vision_model +
// user_settings.embedding_model. Both nullable, no backfill.

import { readFileSync } from 'node:fs';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';

import { closePGliteDb, getPGliteDb, sanitizeStatement } from '../src/pglite-client';

const HERE = dirname(fileURLToPath(import.meta.url));
const DRIZZLE_DIR = join(HERE, '..', 'drizzle');

async function applyOne(
  db: Awaited<ReturnType<typeof getPGliteDb>>,
  tag: string,
): Promise<void> {
  const rawSql = readFileSync(join(DRIZZLE_DIR, `${tag}.sql`), 'utf-8');
  for (const stmt of rawSql.split('--> statement-breakpoint')) {
    const trimmed = stripComments(stmt.trim());
    if (!trimmed) continue;
    const safe = sanitizeStatement(trimmed);
    if (!safe.trim() || safe.trim().startsWith('--')) continue;
    await db.execute(safe);
  }
}

function stripComments(sql: string): string {
  const lines = sql.split('\n');
  while (
    lines.length > 0 &&
    (lines[0]!.trim() === '' || lines[0]!.trim().startsWith('--'))
  ) {
    lines.shift();
  }
  return lines.join('\n').trim();
}

async function applyAllExcept(db: Awaited<ReturnType<typeof getPGliteDb>>, exceptTag: string) {
  const journal = JSON.parse(
    readFileSync(join(DRIZZLE_DIR, 'meta', '_journal.json'), 'utf-8'),
  ) as { entries: Array<{ tag: string }> };
  for (const entry of journal.entries) {
    if (entry.tag === exceptTag) break;
    await applyOne(db, entry.tag);
  }
}

describe('Phase D2 — migration 0014_vision_embedding_model', () => {
  let dir: string;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'hamafx-mig14-'));
  });

  afterEach(async () => {
    await closePGliteDb();
  });

  it('adds a nullable vision_model column to user_settings', async () => {
    const db = await getPGliteDb(dir);
    await applyAllExcept(db, '0014_vision_embedding_model');

    const before = await db.execute<{ column_name: string }>(
      `SELECT column_name FROM information_schema.columns
       WHERE table_name = 'user_settings' AND column_name = 'vision_model'`,
    );
    expect(before.rows).toHaveLength(0);

    await applyOne(db, '0014_vision_embedding_model');

    const after = await db.execute<{
      column_name: string;
      is_nullable: string;
    }>(
      `SELECT column_name, is_nullable FROM information_schema.columns
       WHERE table_name = 'user_settings' AND column_name = 'vision_model'`,
    );
    expect(after.rows).toHaveLength(1);
    expect(after.rows[0]?.is_nullable).toBe('YES');
  });

  it('adds a nullable embedding_model column to user_settings', async () => {
    const db = await getPGliteDb(dir);
    await applyAllExcept(db, '0014_vision_embedding_model');
    await applyOne(db, '0014_vision_embedding_model');

    const after = await db.execute<{
      column_name: string;
      is_nullable: string;
    }>(
      `SELECT column_name, is_nullable FROM information_schema.columns
       WHERE table_name = 'user_settings' AND column_name = 'embedding_model'`,
    );
    expect(after.rows).toHaveLength(1);
    expect(after.rows[0]?.is_nullable).toBe('YES');
  });

  it('accepts "<providerId>:<bareModelId>" string values', async () => {
    const db = await getPGliteDb(dir);
    await applyAllExcept(db, '0014_vision_embedding_model');
    await applyOne(db, '0014_vision_embedding_model');

    // user_settings.user_id FKs to "user".id — insert a user first.
    await db.execute(
      `INSERT INTO "user" (id, email) VALUES ('u-test', 'u-test@localhost')`,
    );

    await db.execute(
      `INSERT INTO "user_settings" (user_id, vision_model, embedding_model)
       VALUES ('u-test', 'google-vertex:gemini-2.5-pro', 'openai:text-embedding-3-small')`,
    );

    const result = await db.execute<{
      vision_model: string;
      embedding_model: string;
    }>(`SELECT vision_model, embedding_model FROM "user_settings" WHERE user_id = 'u-test'`);
    expect(result.rows[0]).toEqual({
      vision_model: 'google-vertex:gemini-2.5-pro',
      embedding_model: 'openai:text-embedding-3-small',
    });
  });

  it('allows NULL on a fresh row (resolver falls back)', async () => {
    const db = await getPGliteDb(dir);
    await applyAllExcept(db, '0014_vision_embedding_model');
    await applyOne(db, '0014_vision_embedding_model');

    await db.execute(
      `INSERT INTO "user" (id, email) VALUES ('u-null', 'u-null@localhost')`,
    );
    await db.execute(`INSERT INTO "user_settings" (user_id) VALUES ('u-null')`);

    const result = await db.execute<{
      vision_model: string | null;
      embedding_model: string | null;
    }>(
      `SELECT vision_model, embedding_model FROM "user_settings" WHERE user_id = 'u-null'`,
    );
    expect(result.rows[0]).toEqual({
      vision_model: null,
      embedding_model: null,
    });
  });

  it('preserves existing rows (no destructive change to chat_model + default_models)', async () => {
    const db = await getPGliteDb(dir);
    await applyAllExcept(db, '0014_vision_embedding_model');
    // Insert a pre-0014 user + settings row
    await db.execute(
      `INSERT INTO "user" (id, email) VALUES ('u-existing', 'u-existing@localhost')`,
    );
    await db.execute(
      `INSERT INTO "user_settings" (user_id, chat_model) VALUES ('u-existing', 'google-vertex:gemini-2.5-flash')`,
    );
    // Now apply 0014
    await applyOne(db, '0014_vision_embedding_model');

    const result = await db.execute<{
      chat_model: string;
      vision_model: string | null;
      embedding_model: string | null;
    }>(
      `SELECT chat_model, vision_model, embedding_model FROM "user_settings" WHERE user_id = 'u-existing'`,
    );
    expect(result.rows[0]).toEqual({
      chat_model: 'google-vertex:gemini-2.5-flash',
      vision_model: null,
      embedding_model: null,
    });
  });

  it('selectable via Drizzle schema (no schema drift)', async () => {
    // The schema export should now have visionModel + embeddingModel
    // accessible via the Drizzle `select()` builder. This catches the
    // case where the SQL applied but the schema wasn't updated.
    const db = await getPGliteDb(dir);
    await applyAllExcept(db, '0014_vision_embedding_model');
    await applyOne(db, '0014_vision_embedding_model');
    await db.execute(
      `INSERT INTO "user" (id, email) VALUES ('u-schema', 'u-schema@localhost')`,
    );

    // Use the Drizzle select() builder rather than raw SQL — this
    // proves the schema/auth.ts update is in sync with the migration.
    const { userSettings } = await import('../src/schema/auth');
    const rows = await db
      .select({
        visionModel: userSettings.visionModel,
        embeddingModel: userSettings.embeddingModel,
      })
      .from(userSettings)
      .where(eq(userSettings.userId, 'u-schema'));
    expect(rows).toEqual([]);
  });
});
