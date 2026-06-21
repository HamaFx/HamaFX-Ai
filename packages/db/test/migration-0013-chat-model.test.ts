/**
 * Copyright 2026 HamaFX
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 */

import { readFileSync } from 'node:fs';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { closePGliteDb, getPGliteDb } from '../src/pglite-client';

const HERE = dirname(fileURLToPath(import.meta.url));
const DRIZZLE_DIR = join(HERE, '..', 'drizzle');
const JOURNAL = JSON.parse(
  readFileSync(join(DRIZZLE_DIR, 'meta', '_journal.json'), 'utf-8'),
) as { entries: Array<{ tag: string }> };

// Inline copy of the sanitization filter from pglite-client.ts.
// We can't import the private helper, but the logic is small and
// must match exactly so tests exercise the same SQL the runner runs.
function sanitizeStatement(sql: string): string {
  return sql
    .replace(
      /CREATE\s+EXTENSION\s+IF\s+NOT\s+EXISTS\s+"vector".*?;/gi,
      '-- [pglite] pgvector extension skipped',
    )
    .replace(/"embedding"\s+vector\(\d+\)/gi, '"embedding" real[]')
    .replace(
      /CREATE\s+INDEX\s+.*?\s+USING\s+hnsw\s*\(.*?vector_cosine_ops.*?\);/gi,
      '-- [pglite] HNSW index skipped (requires pgvector)',
    );
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

async function applyOne(
  db: Awaited<ReturnType<typeof getPGliteDb>>,
  tag: string,
): Promise<void> {
  const rawSql = readFileSync(join(DRIZZLE_DIR, `${tag}.sql`), 'utf-8');
  for (const stmt of rawSql.split('--> statement-breakpoint')) {
    const trimmed = stripComments(stmt.trim());
    if (!trimmed) continue;
    const safe = sanitizeStatement(trimmed);
    await db.execute(safe);
  }
}

describe('Phase F — migration 0013_chat_model', () => {
  let dir: string;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'hamafx-mig-'));
  });

  afterEach(async () => {
    await closePGliteDb();
  });

  it('adds a nullable chat_model column to user_settings', async () => {
    const db = await getPGliteDb(dir);
    // Apply 0000..0012 (but NOT 0013 yet)
    for (const entry of JOURNAL.entries) {
      if (entry.tag === '0013_chat_model') break;
      await applyOne(db, entry.tag);
    }

    const before = await db.execute<{ column_name: string }>(
      `SELECT column_name FROM information_schema.columns
       WHERE table_name = 'user_settings' AND column_name = 'chat_model'`,
    );
    expect(before.rows).toHaveLength(0);

    // Apply 0013 alone
    await applyOne(db, '0013_chat_model');

    const after = await db.execute<{
      column_name: string;
      is_nullable: string;
    }>(
      `SELECT column_name, is_nullable FROM information_schema.columns
       WHERE table_name = 'user_settings' AND column_name = 'chat_model'`,
    );
    expect(after.rows).toHaveLength(1);
    expect(after.rows[0]?.is_nullable).toBe('YES');
  });

  it('backfills chat_model from default_models.technical (priority 1)', async () => {
    const db = await getPGliteDb(dir);
    for (const entry of JOURNAL.entries) {
      if (entry.tag === '0013_chat_model') break;
      await applyOne(db, entry.tag);
    }

    await db.execute(`INSERT INTO "user" (id, email, role)
                     VALUES ('u1', 'u1@test.com', 'user') ON CONFLICT DO NOTHING`);
    await db.execute(
      `INSERT INTO "user_settings" (user_id, default_models)
       VALUES ('u1', '{"technical":"google-vertex:gemini-2.5-pro"}'::jsonb)`,
    );

    await applyOne(db, '0013_chat_model');

    const r = await db.execute<{ chat_model: string | null }>(
      `SELECT chat_model FROM user_settings WHERE user_id = 'u1'`,
    );
    expect(r.rows[0]?.chat_model).toBe('google-vertex:gemini-2.5-pro');
  });

  it('falls back to fundamental when technical is missing', async () => {
    const db = await getPGliteDb(dir);
    for (const entry of JOURNAL.entries) {
      if (entry.tag === '0013_chat_model') break;
      await applyOne(db, entry.tag);
    }
    await db.execute(`INSERT INTO "user" (id, email, role)
                     VALUES ('u2', 'u2@test.com', 'user') ON CONFLICT DO NOTHING`);
    await db.execute(
      `INSERT INTO "user_settings" (user_id, default_models)
       VALUES ('u2', '{"fundamental":"anthropic:claude-sonnet-4-5"}'::jsonb)`,
    );
    await applyOne(db, '0013_chat_model');

    const r = await db.execute<{ chat_model: string | null }>(
      `SELECT chat_model FROM user_settings WHERE user_id = 'u2'`,
    );
    expect(r.rows[0]?.chat_model).toBe('anthropic:claude-sonnet-4-5');
  });

  it('falls back to summary when both technical and fundamental are missing', async () => {
    const db = await getPGliteDb(dir);
    for (const entry of JOURNAL.entries) {
      if (entry.tag === '0013_chat_model') break;
      await applyOne(db, entry.tag);
    }
    await db.execute(`INSERT INTO "user" (id, email, role)
                     VALUES ('u3', 'u3@test.com', 'user') ON CONFLICT DO NOTHING`);
    await db.execute(
      `INSERT INTO "user_settings" (user_id, default_models)
       VALUES ('u3', '{"summary":"groq:llama-3.3-70b"}'::jsonb)`,
    );
    await applyOne(db, '0013_chat_model');

    const r = await db.execute<{ chat_model: string | null }>(
      `SELECT chat_model FROM user_settings WHERE user_id = 'u3'`,
    );
    expect(r.rows[0]?.chat_model).toBe('groq:llama-3.3-70b');
  });

  it('prefers technical over fundamental when both are set', async () => {
    const db = await getPGliteDb(dir);
    for (const entry of JOURNAL.entries) {
      if (entry.tag === '0013_chat_model') break;
      await applyOne(db, entry.tag);
    }
    await db.execute(`INSERT INTO "user" (id, email, role)
                     VALUES ('u4', 'u4@test.com', 'user') ON CONFLICT DO NOTHING`);
    await db.execute(
      `INSERT INTO "user_settings" (user_id, default_models)
       VALUES ('u4', '{"technical":"openai:gpt-4o","fundamental":"anthropic:claude-sonnet-4-5"}'::jsonb)`,
    );
    await applyOne(db, '0013_chat_model');

    const r = await db.execute<{ chat_model: string | null }>(
      `SELECT chat_model FROM user_settings WHERE user_id = 'u4'`,
    );
    expect(r.rows[0]?.chat_model).toBe('openai:gpt-4o');
  });

  it('leaves chat_model NULL when default_models is empty', async () => {
    const db = await getPGliteDb(dir);
    for (const entry of JOURNAL.entries) {
      if (entry.tag === '0013_chat_model') break;
      await applyOne(db, entry.tag);
    }
    await db.execute(`INSERT INTO "user" (id, email, role)
                     VALUES ('u5', 'u5@test.com', 'user') ON CONFLICT DO NOTHING`);
    await db.execute(
      `INSERT INTO "user_settings" (user_id, default_models)
       VALUES ('u5', '{}'::jsonb)`,
    );
    await applyOne(db, '0013_chat_model');

    const r = await db.execute<{ chat_model: string | null }>(
      `SELECT chat_model FROM user_settings WHERE user_id = 'u5'`,
    );
    expect(r.rows[0]?.chat_model).toBeNull();
  });

  it('leaves chat_model NULL when default_models only has vision/embedding', async () => {
    const db = await getPGliteDb(dir);
    for (const entry of JOURNAL.entries) {
      if (entry.tag === '0013_chat_model') break;
      await applyOne(db, entry.tag);
    }
    // Vision/embedding are deliberately NOT carried forward — those
    // models have different semantics from a chat model.
    await db.execute(`INSERT INTO "user" (id, email, role)
                     VALUES ('u6', 'u6@test.com', 'user') ON CONFLICT DO NOTHING`);
    await db.execute(
      `INSERT INTO "user_settings" (user_id, default_models)
       VALUES ('u6', '{"vision":"google-vertex:gemini-2.5-pro","embedding":"openai/text-embedding-3-small"}'::jsonb)`,
    );
    await applyOne(db, '0013_chat_model');

    const r = await db.execute<{ chat_model: string | null }>(
      `SELECT chat_model FROM user_settings WHERE user_id = 'u6'`,
    );
    expect(r.rows[0]?.chat_model).toBeNull();
  });
});
