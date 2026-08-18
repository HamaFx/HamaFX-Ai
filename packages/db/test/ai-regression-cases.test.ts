/**
 * Copyright 2026 Kestrel
 *
 * Licensed under the Apache License, Version 2.0 (the "License").
 */

import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { applyMigrations, closePGliteDb, getPGliteDb } from '../src/pglite-client';
import type * as ClientModule from '../src/client';

let pglite: Awaited<ReturnType<typeof getPGliteDb>>;

vi.mock('../src/client', async (importOriginal) => {
  const actual = await importOriginal<typeof ClientModule>();
  return { ...actual, getDb: () => pglite };
});

const UUID = (suffix: string) => `00000000-0000-4000-8000-${suffix.padStart(12, '0')}`;

async function sql(query: string): Promise<void> {
  await pglite.execute(query);
}

describe('AI regression cases', { timeout: 60_000 }, () => {
  let dir: string;

  beforeEach(async () => {
    dir = mkdtempSync(join(tmpdir(), 'kestrel-regression-cases-'));
    await applyMigrations(dir);
    pglite = await getPGliteDb(dir);
    await sql(`INSERT INTO "organization" ("id", "name") VALUES ('org-1', 'Test Org')`);
    await sql(`INSERT INTO "user" ("id", "email", "name", "role") VALUES ('u-1', 'u@example.com', 'U', 'user')`);
    await sql(`INSERT INTO "chat_threads" ("id", "user_id", "tenant_id", "title") VALUES ('${UUID('100000000001')}', 'u-1', 'org-1', 'Gold')`);
    await sql(`INSERT INTO "chat_messages" ("id", "thread_id", "tenant_id", "role", "content", "created_at") VALUES
      ('${UUID('200000000001')}', '${UUID('100000000001')}', 'org-1', 'user', 'Analyse gold', now() - interval '1 hour'),
      ('${UUID('200000000002')}', '${UUID('100000000001')}', 'org-1', 'assistant', 'Gold is at 2400.15', now() - interval '30 minutes')`);
    await sql(`INSERT INTO "ai_message_feedback" ("id", "user_id", "tenant_id", "thread_id", "message_id", "rating", "review_status", "reviewer_label", "issue_codes", "reviewer_note") VALUES
      ('${UUID('300000000001')}', 'u-1', 'org-1', '${UUID('100000000001')}', '${UUID('200000000002')}', 'negative', 'reviewed', 'fail', '["wrong_number"]', 'Unsupported price')`);
  });

  afterEach(async () => {
    await closePGliteDb();
  });

  it('creates a hashed regression case from a reviewed failure', async () => {
    const { syncAiRegressionCase, listAiRegressionCases } = await import('../src/queries/ai-regression-cases');
    const created = await syncAiRegressionCase(UUID('300000000001'));
    expect(created?.status).toBe('open');
    expect(created?.issueCodes).toEqual(['wrong_number']);
    expect(created?.promptSha256).toMatch(/^[a-f0-9]{64}$/);
    expect(created?.assistantOutputSha256).toMatch(/^[a-f0-9]{64}$/);
    expect(created?.promptSha256).not.toContain('Analyse gold');

    const rows = await listAiRegressionCases({ status: 'open' });
    expect(rows).toHaveLength(1);
    expect(rows[0]?.feedbackId).toBe(UUID('300000000001'));
  });

  it('dismisses an existing case when the review is reclassified', async () => {
    const { syncAiRegressionCase, listAiRegressionCases } = await import('../src/queries/ai-regression-cases');
    await syncAiRegressionCase(UUID('300000000001'));
    await sql(`UPDATE "ai_message_feedback" SET "reviewer_label" = 'pass' WHERE "id" = '${UUID('300000000001')}'`);
    await syncAiRegressionCase(UUID('300000000001'));

    const rows = await listAiRegressionCases({ status: 'dismissed' });
    expect(rows).toHaveLength(1);
  });
});
