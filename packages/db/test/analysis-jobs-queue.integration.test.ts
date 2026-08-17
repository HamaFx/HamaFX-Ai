import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { applyMigrations, closePGliteDb, getPGliteDb, getRawPGlite } from '../src/pglite-client';

const USER_ID = 'queue-user-1';
const ORG_ID = 'queue-org-1';
const THREAD_ID = '00000000-0000-4000-8000-000000000001';
const JOB_ID = '00000000-0000-4000-8000-000000000002';

async function seedQueueRows() {
  const raw = getRawPGlite();
  await raw.exec(`
    INSERT INTO organization (id, name) VALUES ('${ORG_ID}', 'Queue Test Org');
    INSERT INTO "user" (id, email, role) VALUES ('${USER_ID}', 'queue@example.com', 'user');
    INSERT INTO chat_threads (id, user_id, tenant_id, title) VALUES ('${THREAD_ID}', '${USER_ID}', '${ORG_ID}', 'Queue test');
  `);
}

describe('analysis_jobs real PGlite queue contract', () => {
  let dataDir: string;

  beforeEach(async () => {
    dataDir = mkdtempSync(join(tmpdir(), 'kestrel-analysis-jobs-'));
    await getPGliteDb(dataDir);
    await applyMigrations(dataDir);
    await seedQueueRows();
  });

  afterEach(async () => {
    await closePGliteDb();
  });

  it('enforces user-scoped idempotency for duplicate submissions', async () => {
    const raw = getRawPGlite();
    await raw.exec(`
      INSERT INTO analysis_jobs (id, user_id, thread_id, user_message_text, user_message_parts, history_parts, mode, status, idempotency_key)
      VALUES ('${JOB_ID}', '${USER_ID}', '${THREAD_ID}', 'Analyze XAUUSD', '{}'::jsonb, '[]'::jsonb, 'full', 'pending', 'full:thread-1:message-1');
    `);

    await expect(raw.exec(`
      INSERT INTO analysis_jobs (user_id, thread_id, user_message_text, user_message_parts, history_parts, mode, status, idempotency_key)
      VALUES ('${USER_ID}', '${THREAD_ID}', 'Retry', '{}'::jsonb, '[]'::jsonb, 'full', 'pending', 'full:thread-1:message-1');
    `)).rejects.toThrow();

    const result = await raw.query<{ count: string }>(`SELECT COUNT(*)::text AS count FROM analysis_jobs WHERE user_id = '${USER_ID}'`);
    expect(result.rows[0]?.count).toBe('1');
  });

  it('converges concurrent duplicate submissions to one row', async () => {
    const raw = getRawPGlite();
    const insert = `
      INSERT INTO analysis_jobs (user_id, thread_id, user_message_text, user_message_parts, history_parts, mode, status, idempotency_key)
      VALUES ('${USER_ID}', '${THREAD_ID}', 'Concurrent retry', '{}'::jsonb, '[]'::jsonb, 'full', 'pending', 'full:concurrent:message-1')
      ON CONFLICT (user_id, idempotency_key) DO NOTHING;
    `;

    await Promise.all(Array.from({ length: 8 }, () => raw.exec(insert)));

    const result = await raw.query<{ count: string }>(`SELECT COUNT(*)::text AS count FROM analysis_jobs WHERE user_id = '${USER_ID}' AND idempotency_key = 'full:concurrent:message-1'`);
    expect(result.rows[0]?.count).toBe('1');
  });

  it('requeues a stale lease while attempts remain', async () => {
    const raw = getRawPGlite();
    await raw.exec(`
      INSERT INTO analysis_jobs (id, user_id, thread_id, user_message_text, user_message_parts, history_parts, mode, status, idempotency_key, attempt_count, started_at, updated_at)
      VALUES ('${JOB_ID}', '${USER_ID}', '${THREAD_ID}', 'Retry stale XAUUSD', '{}'::jsonb, '[]'::jsonb, 'full', 'running', 'full:stale:message-1', 1, NOW() - INTERVAL '10 minutes', NOW() - INTERVAL '10 minutes');
    `);

    await raw.exec(`
      UPDATE analysis_jobs
      SET status = 'pending', error = 'Worker lease expired; retrying automatically.', started_at = NULL, worker_run_id = NULL, updated_at = NOW()
      WHERE id = '${JOB_ID}' AND status = 'running' AND attempt_count < 3 AND updated_at < NOW() - INTERVAL '5 minutes';
    `);

    const result = await raw.query<{ status: string; error: string }>(`SELECT status, error FROM analysis_jobs WHERE id = '${JOB_ID}'`);
    expect(result.rows[0]).toEqual({
      status: 'pending',
      error: 'Worker lease expired; retrying automatically.',
    });
  });

  it('preserves retryable pending state and terminally fails exhausted leases', async () => {
    const raw = getRawPGlite();
    await raw.exec(`
      INSERT INTO analysis_jobs (id, user_id, thread_id, user_message_text, user_message_parts, history_parts, mode, status, idempotency_key, attempt_count, started_at, updated_at)
      VALUES ('${JOB_ID}', '${USER_ID}', '${THREAD_ID}', 'Analyze XAUUSD', '{}'::jsonb, '[]'::jsonb, 'full', 'running', 'full:thread-1:message-1', 3, NOW() - INTERVAL '10 minutes', NOW() - INTERVAL '10 minutes');
    `);

    await raw.exec(`
      UPDATE analysis_jobs
      SET status = 'failed', error = 'Job timed out — maximum worker attempts reached.', completed_at = NOW(), updated_at = NOW()
      WHERE id = '${JOB_ID}' AND status = 'running' AND attempt_count >= 3;
    `);

    const result = await raw.query<{ status: string; error: string }>(`SELECT status, error FROM analysis_jobs WHERE id = '${JOB_ID}'`);
    expect(result.rows[0]).toEqual({
      status: 'failed',
      error: 'Job timed out — maximum worker attempts reached.',
    });
  });
});
