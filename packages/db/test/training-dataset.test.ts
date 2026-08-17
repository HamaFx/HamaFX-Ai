/**
 * Copyright 2026 Kestrel
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 */

// Integration test for `listReviewedTrainingPairs` on a real PGlite instance:
// full migration chain, seeded rows, then the query asserting the prompt
// join picks the *nearest preceding user message* and only rows a reviewer
// explicitly labelled are exported.

import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { applyMigrations, closePGliteDb, getPGliteDb } from '../src/pglite-client';
import type * as ClientModule from '../src/client';

// The query module resolves getDb() through the client singleton; point it at
// the PGlite instance created per-test. The factory only reads the binding at
// call time (after beforeEach assigns it), so the closure is safe.
let pglite: Awaited<ReturnType<typeof getPGliteDb>>;

vi.mock('../src/client', async (importOriginal) => {
  const actual = await importOriginal<typeof ClientModule>();
  return { ...actual, getDb: () => pglite };
});

const UUID = (n: string) => `00000000-0000-4000-8000-${n.padStart(12, '0')}`;

describe('listReviewedTrainingPairs (PGlite integration)', { timeout: 60_000 }, () => {
  let dir: string;

  beforeEach(async () => {
    dir = mkdtempSync(join(tmpdir(), 'kestrel-training-ds-'));
    await applyMigrations(dir);
    pglite = await getPGliteDb(dir);
    await seed();
  });

  afterEach(async () => {
    await closePGliteDb();
  });

  async function seed(): Promise<void> {
    const db = pglite;
    await db.execute(`INSERT INTO "organization" ("id", "name") VALUES ('org-1', 'Test Org')`);
    await db.execute(`INSERT INTO "user" ("id", "email", "name", "role") VALUES ('u-1', 'u@example.com', 'U', 'user')`);

    // Thread 1 — approved (fail) with a preceding user prompt.
    await db.execute(
      `INSERT INTO "chat_threads" ("id", "user_id", "tenant_id", "title") VALUES ('${UUID('100000000001')}', 'u-1', 'org-1', 'T1')`,
    );
    await db.execute(
      `INSERT INTO "chat_messages" ("id", "thread_id", "tenant_id", "role", "content", "created_at") VALUES
        ('${UUID('200000000001')}', '${UUID('100000000001')}', 'org-1', 'user', 'What is gold at?', now() - interval '1 hour'),
        ('${UUID('200000000002')}', '${UUID('100000000001')}', 'org-1', 'assistant', 'Gold is at 2400.15', now() - interval '30 minutes')`,
    );
    // A user message *after* the assistant must NOT be chosen as the prompt.
    await db.execute(
      `INSERT INTO "chat_messages" ("id", "thread_id", "tenant_id", "role", "content", "created_at") VALUES
       ('${UUID('200000000003')}', '${UUID('100000000001')}', 'org-1', 'user', 'And silver?', now())`,
    );
    await db.execute(
      `INSERT INTO "ai_message_feedback" ("id", "user_id", "tenant_id", "thread_id", "message_id", "rating", "review_status", "reviewer_label", "issue_codes", "reviewed_at") VALUES
       ('${UUID('300000000001')}', 'u-1', 'org-1', '${UUID('100000000001')}', '${UUID('200000000002')}', 'negative', 'reviewed', 'fail', '["wrong-price"]', now())`,
    );

    // Thread 2 — reviewed but no reviewer label → must be excluded.
    await db.execute(
      `INSERT INTO "chat_threads" ("id", "user_id", "tenant_id", "title") VALUES ('${UUID('100000000002')}', 'u-1', 'org-1', 'T2')`,
    );
    await db.execute(
      `INSERT INTO "chat_messages" ("id", "thread_id", "tenant_id", "role", "content", "created_at") VALUES
       ('${UUID('200000000004')}', '${UUID('100000000002')}', 'org-1', 'user', 'Hi', now() - interval '10 minutes'),
       ('${UUID('200000000005')}', '${UUID('100000000002')}', 'org-1', 'assistant', 'Hello!', now() - interval '5 minutes')`,
    );
    await db.execute(
      `INSERT INTO "ai_message_feedback" ("id", "user_id", "tenant_id", "thread_id", "message_id", "rating", "review_status", "reviewed_at") VALUES
       ('${UUID('300000000002')}', 'u-1', 'org-1', '${UUID('100000000002')}', '${UUID('200000000005')}', 'positive', 'reviewed', now())`,
    );

    // Thread 3 — unreviewed feedback → must be excluded.
    await db.execute(
      `INSERT INTO "chat_threads" ("id", "user_id", "tenant_id", "title") VALUES ('${UUID('100000000003')}', 'u-1', 'org-1', 'T3')`,
    );
    await db.execute(
      `INSERT INTO "chat_messages" ("id", "thread_id", "tenant_id", "role", "content", "created_at") VALUES
       ('${UUID('200000000006')}', '${UUID('100000000003')}', 'org-1', 'user', 'Hi', now() - interval '10 minutes'),
       ('${UUID('200000000007')}', '${UUID('100000000003')}', 'org-1', 'assistant', 'Hey', now() - interval '5 minutes')`,
    );
    await db.execute(
      `INSERT INTO "ai_message_feedback" ("id", "user_id", "tenant_id", "thread_id", "message_id", "rating", "review_status") VALUES
       ('${UUID('300000000003')}', 'u-1', 'org-1', '${UUID('100000000003')}', '${UUID('200000000007')}', 'positive', 'unreviewed')`,
    );
  }

  it('returns reviewer-approved rows joined to the preceding user prompt', async () => {
    const { listReviewedTrainingPairs } = await import('../src/queries/training-dataset');
    const rows = await listReviewedTrainingPairs({ limit: 100 });

    expect(rows).toHaveLength(1);
    const row = rows[0]!;
    expect(row.messageId).toBe(UUID('200000000002'));
    expect(row.prompt).toBe('What is gold at?');
    expect(row.assistantText).toBe('Gold is at 2400.15');
    expect(row.reviewerLabel).toBe('fail');
    expect(row.issueCodes).toEqual(['wrong-price']);
    expect(row.rating).toBe('negative');
  });
});