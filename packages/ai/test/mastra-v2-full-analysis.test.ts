import { rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { LibSQLStore } from '@mastra/libsql';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import {
  _resetKestrelMastra,
  _setKestrelMastraForTest,
  createKestrelMastra,
  initializeKestrelMastra,
} from '../src/mastra-v2';
import {
  claimNextFullAnalysisRun,
  completeFullAnalysisRun,
  enqueueFullAnalysis,
  failFullAnalysisRun,
  fullAnalysisRunId,
  getFullAnalysisQueueHealth,
  getFullAnalysisRun,
  purgeOldFullAnalysisRuns,
  recoverStaleFullAnalysisRuns,
  requeueFullAnalysisRun,
  touchFullAnalysisRun,
} from '../src/mastra-v2/workflows/full-analysis';

// The durable queue reads the process-wide Mastra singleton's storage, so
// each test injects a temp LibSQL-backed instance and resets afterwards.
async function withTempStorage<T>(fn: () => Promise<T>): Promise<T> {
  const file = join(
    tmpdir(),
    `kestrel-durable-${Date.now()}-${Math.random().toString(36).slice(2)}.db`,
  );
  const url = `file:${file}`;
  const store = new LibSQLStore({ id: 'test-durable', url });
  const mastra = createKestrelMastra({ storage: store, storageKind: 'libsql', env: {} });
  await initializeKestrelMastra(mastra);
  _setKestrelMastraForTest(mastra);
  try {
    return await fn();
  } finally {
    _resetKestrelMastra();
    rmSync(file, { force: true });
    rmSync(`${file}-shm`, { force: true });
    rmSync(`${file}-wal`, { force: true });
  }
}

const INPUT = {
  userId: 'user-1',
  threadId: 'thread-1',
  userMessageText: 'Analyze XAUUSD',
  userMessageParts: [{ type: 'text', text: 'Analyze XAUUSD' }],
  idempotencyKey: 'full:thread-1:message-1',
};

describe('mastra-v2 durable full-analysis queue', () => {
  beforeEach(() => {
    _resetKestrelMastra();
  });

  afterEach(() => {
    _resetKestrelMastra();
  });

  it('round-trips enqueue → claim → complete → poll with user scoping', async () => {
    await withTempStorage(async () => {
      const runId = await enqueueFullAnalysis(INPUT);
      expect(runId).toBeTruthy();

      const claimed = await claimNextFullAnalysisRun('worker-1');
      expect(claimed?.runId).toBe(runId);
      expect(claimed?.payload.userId).toBe('user-1');
      expect(claimed?.payload.attemptCount).toBe(1);
      expect(claimed?.payload.workerRunId).toBe('worker-1');
      expect(claimed?.payload.startedAt).toBeDefined();

      await completeFullAnalysisRun(runId!, { finalText: 'done', mode: 'full' });

      const poll = await getFullAnalysisRun('user-1', runId!);
      expect(poll?.status).toBe('complete');
      expect(poll?.result).toMatchObject({ finalText: 'done' });
      expect(poll?.completedAt).not.toBeNull();

      // User scoping: another user cannot read the run.
      expect(await getFullAnalysisRun('user-2', runId!)).toBeNull();
    });
  });

  it('is exactly-once per (userId, idempotencyKey) — re-enqueue returns the same runId', async () => {
    await withTempStorage(async () => {
      const first = await enqueueFullAnalysis(INPUT);
      const second = await enqueueFullAnalysis({ ...INPUT, userMessageText: 'Analyze XAUUSD again' });
      expect(second).toBe(first);

      const health = await getFullAnalysisQueueHealth();
      expect(health.pending).toBe(1);
      expect(health.unavailable).toBeUndefined();
    });
  });

  it('makes runIds deterministic across submissions', () => {
    const a = fullAnalysisRunId('user-1', 'full:thread-1:message-1');
    const b = fullAnalysisRunId('user-1', 'full:thread-1:message-1');
    const c = fullAnalysisRunId('user-2', 'full:thread-1:message-1');
    expect(a).toBe(b);
    expect(a).not.toBe(c);
  });

  it('requeues retryable failures back to pending and reflects the lease in health', async () => {
    await withTempStorage(async () => {
      const runId = await enqueueFullAnalysis(INPUT);
      const claimed = await claimNextFullAnalysisRun('worker-1');
      expect(claimed?.runId).toBe(runId);

      let health = await getFullAnalysisQueueHealth();
      expect(health.pending).toBe(0);
      expect(health.running).toBe(1);

      await requeueFullAnalysisRun(runId!, 'attempt 1 failed; retrying');
      health = await getFullAnalysisQueueHealth();
      expect(health.pending).toBe(1);
      expect(health.running).toBe(0);

      // The requeued run is claimable again with attempts preserved.
      const reClaimed = await claimNextFullAnalysisRun('worker-2');
      expect(reClaimed?.payload.attemptCount).toBe(2);
      expect(reClaimed?.payload.workerRunId).toBe('worker-2');
    });
  });

  it('recovers stale running runs: requeues within attempts, fails at the cap', async () => {
    await withTempStorage(async () => {
      const runId = await enqueueFullAnalysis(INPUT);
      await claimNextFullAnalysisRun('worker-1');

      // Cutoff in the future makes every run stale relative to it.
      const future = new Date(Date.now() + 60_000);

      const first = await recoverStaleFullAnalysisRuns(future, 2);
      expect(first).toEqual({ requeued: 1, failed: 0 });

      await claimNextFullAnalysisRun('worker-2'); // attemptCount → 2
      const second = await recoverStaleFullAnalysisRuns(future, 2);
      expect(second).toEqual({ requeued: 0, failed: 1 });

      const poll = await getFullAnalysisRun('user-1', runId!);
      expect(poll?.status).toBe('failed');
      expect(poll?.error).toContain('No partial answer was returned');
    });
  });

  it('reports a terminal failure view for failFullAnalysisRun', async () => {
    await withTempStorage(async () => {
      const runId = await enqueueFullAnalysis(INPUT);
      await failFullAnalysisRun(runId!, new Error('model unavailable'));

      const poll = await getFullAnalysisRun('user-1', runId!);
      expect(poll?.status).toBe('failed');
      expect(poll?.result).toBeNull();
    });
  });

  it('purges terminal runs older than the retention cutoff', async () => {
    await withTempStorage(async () => {
      const runId = await enqueueFullAnalysis(INPUT);
      await completeFullAnalysisRun(runId!, { finalText: 'done' });

      const future = new Date(Date.now() + 60_000);
      const deleted = await purgeOldFullAnalysisRuns(future);
      expect(deleted).toBe(1);
      expect(await getFullAnalysisRun('user-1', runId!)).toBeNull();
    });
  });

  it('heartbeat touch keeps a running lease fresh', async () => {
    await withTempStorage(async () => {
      const runId = await enqueueFullAnalysis(INPUT);
      await claimNextFullAnalysisRun('worker-1');
      await expect(touchFullAnalysisRun(runId!)).resolves.toBeUndefined();

      const health = await getFullAnalysisQueueHealth();
      expect(health.running).toBe(1);
    });
  });
});
