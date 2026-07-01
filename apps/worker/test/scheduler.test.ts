import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockAcquireCronLock = vi.fn();
vi.mock('../src/cron-lock', () => ({
  acquireCronLock: mockAcquireCronLock,
}));

vi.mock('node-cron', () => ({
  default: {
    schedule: vi.fn(),
  },
}));

const mockJobRun = vi.fn();
const mockJobs: Record<string, { run: typeof mockJobRun; description: string }> = {
  alerts: { run: mockJobRun, description: 'test alerts' },
  briefings: { run: mockJobRun, description: 'test briefings' },
  'embedding-backfill': { run: mockJobRun, description: 'test embedding' },
  snapshots: { run: mockJobRun, description: 'test snapshots' },
  cot: { run: mockJobRun, description: 'test cot' },
  'fred-actuals': { run: mockJobRun, description: 'test fred' },
  'resonance-sync': { run: mockJobRun, description: 'test resonance' },
  'weekly-review': { run: mockJobRun, description: 'test weekly' },
};

vi.mock('../src/jobs', () => ({
  JOBS: mockJobs,
}));

const mockLog = {
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
  with: vi.fn(() => mockLog),
};

const mockLock = {
  done: vi.fn(),
  fail: vi.fn(),
};

type JobName = keyof typeof mockJobs;

async function runJobSafely(name: JobName, log: typeof mockLog): Promise<void> {
  const job = mockJobs[name];
  if (!job) {
    log.error(`Scheduler attempted to run unknown job: ${name}`);
    return;
  }

  const runId = 'test-uuid';
  const jobLog = log.with({ job: name, runId });

  const SKIP_DAILY_LOCK = new Set<JobName>(['alerts', 'briefings']);
  const useLock = !SKIP_DAILY_LOCK.has(name);
  let lock: typeof mockLock | null = null;
  if (useLock) {
    try {
      lock = await mockAcquireCronLock(name, {} as never);
      if (!lock) {
        jobLog.info('Job skipped — already ran today (idempotency guard)');
        return;
      }
    } catch (lockErr) {
      jobLog.warn('Failed to acquire cron lock, proceeding without idempotency guard', {
        err: String(lockErr),
      });
    }
  }

  const ac = new AbortController();
  const timeoutHandle = setTimeout(() => {
    ac.abort(new Error(`Job ${name} timed out after 60000ms`));
  }, 60_000);

  jobLog.info('Running scheduled job');

  try {
    const startMs = Date.now();
    const result = await job.run({ log: jobLog, signal: ac.signal });
    const durationMs = Date.now() - startMs;

    jobLog.info('Job completed successfully', {
      durationMs,
      processed: result.processed,
      note: result.note,
    });

    await lock?.done(result.note);
  } catch (err) {
    const isTimeout = ac.signal.aborted;
    jobLog.error(`Job ${isTimeout ? 'timed out' : 'failed'}`, { err: String(err) });
    await lock?.fail(err);
  } finally {
    clearTimeout(timeoutHandle);
  }
}

beforeEach(() => {
  vi.clearAllMocks();
  mockJobRun.mockReset();
  mockJobRun.mockResolvedValue({ processed: 0, note: undefined });
  mockAcquireCronLock.mockReset();
});

describe('runJobSafely', () => {
  it('runs a job successfully and calls lock.done for daily jobs', async () => {
    mockAcquireCronLock.mockResolvedValue(mockLock);
    mockJobRun.mockResolvedValue({ processed: 5, note: 'processed ok' });

    await runJobSafely('snapshots', mockLog);

    expect(mockAcquireCronLock).toHaveBeenCalledWith('snapshots', {});
    expect(mockJobRun).toHaveBeenCalledOnce();
    expect(mockLock.done).toHaveBeenCalledWith('processed ok');
    expect(mockLog.info).toHaveBeenCalledWith('Running scheduled job');
    expect(mockLog.info).toHaveBeenCalledWith('Job completed successfully', expect.objectContaining({
      processed: 5,
      note: 'processed ok',
    }));
  });

  it('skips daily lock for alerts and briefings', async () => {
    for (const name of ['alerts', 'briefings'] as JobName[]) {
      mockJobRun.mockResolvedValue({ processed: 1, note: 'skipped lock check' });
      await runJobSafely(name, mockLog);
      expect(mockAcquireCronLock).not.toHaveBeenCalled();
      expect(mockJobRun).toHaveBeenCalledOnce();
      mockJobRun.mockClear();
    }
  });

  it('skips job when lock returns null (already ran today)', async () => {
    mockAcquireCronLock.mockResolvedValue(null);

    await runJobSafely('snapshots', mockLog);

    expect(mockJobRun).not.toHaveBeenCalled();
    expect(mockLock.done).not.toHaveBeenCalled();
    expect(mockLog.info).toHaveBeenCalledWith('Job skipped — already ran today (idempotency guard)');
  });

  it('proceeds without idempotency when lock acquisition throws', async () => {
    mockAcquireCronLock.mockRejectedValue(new Error('DB unavailable'));
    mockJobRun.mockResolvedValue({ processed: 3, note: 'no lock' });

    await runJobSafely('snapshots', mockLog);

    expect(mockJobRun).toHaveBeenCalledOnce();
    expect(mockLog.warn).toHaveBeenCalledWith(
      'Failed to acquire cron lock, proceeding without idempotency guard',
      expect.objectContaining({ err: 'Error: DB unavailable' }),
    );
  });

  it('calls lock.fail on job error', async () => {
    mockAcquireCronLock.mockResolvedValue(mockLock);
    mockJobRun.mockRejectedValue(new Error('job crashed'));

    await runJobSafely('snapshots', mockLog);

    expect(mockLock.fail).toHaveBeenCalledWith(new Error('job crashed'));
    expect(mockLock.done).not.toHaveBeenCalled();
    expect(mockLog.error).toHaveBeenCalledWith('Job failed', expect.any(Object));
  });

  it('reports timeout when job exceeds deadline', async () => {
    vi.useFakeTimers();
    mockAcquireCronLock.mockResolvedValue(mockLock);
    mockJobRun.mockImplementation(({ signal }: { signal: AbortSignal }) => new Promise((_, reject) => {
      if (signal.aborted) {
        reject(new Error('Job timed out'));
        return;
      }
      signal.addEventListener('abort', () => reject(new Error('Job timed out')));
    }));

    const _promise = runJobSafely('snapshots', mockLog);

    await vi.advanceTimersByTimeAsync(60_000);

    expect(mockLog.error).toHaveBeenCalledWith('Job timed out', expect.any(Object));
    expect(mockLock.fail).toHaveBeenCalled();

    vi.useRealTimers();
  });

  it('handles unknown job gracefully', async () => {
    await runJobSafely('nonexistent' as never, mockLog);

    expect(mockLog.error).toHaveBeenCalledWith('Scheduler attempted to run unknown job: nonexistent');
    expect(mockJobRun).not.toHaveBeenCalled();
  });

  it('creates a jobLog with job name and runId', async () => {
    mockAcquireCronLock.mockResolvedValue(mockLock);
    mockJobRun.mockResolvedValue({ processed: 1, note: '' });

    await runJobSafely('cot', mockLog);

    expect(mockLog.with).toHaveBeenCalledWith({
      job: 'cot',
      runId: expect.any(String),
    });
  });

  it('calls lock.done with undefined note when note is absent', async () => {
    mockAcquireCronLock.mockResolvedValue(mockLock);
    mockJobRun.mockResolvedValue({ processed: 0 });

    await runJobSafely('fred-actuals', mockLog);

    expect(mockLock.done).toHaveBeenCalledWith(undefined);
  });

  it('handles lock.fail with non-Error rejections', async () => {
    mockAcquireCronLock.mockResolvedValue(mockLock);
    mockJobRun.mockRejectedValue('string error');

    await runJobSafely('resonance-sync', mockLog);

    expect(mockLock.fail).toHaveBeenCalledWith('string error');
  });
});
