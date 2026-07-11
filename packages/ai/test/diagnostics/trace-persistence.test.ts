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

import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';

import { persistTrace, type PersistedTrace } from '../../src/diagnostics/trace-persistence';

const mockInsert = vi.fn();
const mockTransaction = vi.fn();

vi.mock('@hamafx/db', () => ({
  getDb: () => ({
    insert: mockInsert,
    transaction: mockTransaction,
  }),
  schema: {
    diagnosticTraces: {
      $inferInsert: {} as Record<string, unknown>,
    },
  },
}));

vi.mock('node:fs/promises', () => ({
  writeFile: vi.fn(),
}));

import * as fs from 'node:fs/promises';

describe('persistTrace', () => {
  const baseTrace: PersistedTrace = {
    traceId: 'trace-123',
    userId: 'u-123',
    threadId: 'th-456',
    startedAt: Date.now(),
    durationMs: 100,
    stepCount: 3,
    errorCount: 0,
    status: 'completed',
    trace: { steps: [], errors: [] },
  };

  beforeEach(() => {
    vi.clearAllMocks();
    const valuesFn = vi.fn().mockResolvedValue(undefined);
    mockInsert.mockReturnValue({ values: valuesFn });
    mockTransaction.mockImplementation((cb: (tx: unknown) => Promise<unknown>) =>
      cb({
        insert: () => ({ values: valuesFn }),
      }),
    );
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('persists a trace to the database', async () => {
    await persistTrace(baseTrace);

    expect(mockInsert).toHaveBeenCalled();
    const valuesFn = mockInsert.mock.results[0]!.value as { values: ReturnType<typeof vi.fn> };
    const inserted = valuesFn.values.mock.calls[0]![0] as Record<string, unknown>;
    expect(inserted.id).toBe('trace-123');
    expect(inserted.userId).toBe('u-123');
    expect(inserted.threadId).toBe('th-456');
    expect(inserted.durationMs).toBe(100);
    expect(inserted.stepCount).toBe(3);
    expect(inserted.status).toBe('completed');
  });

  it('does not throw when database insert fails', async () => {
    mockInsert.mockImplementation(() => {
      throw new Error('DB connection lost');
    });

    await expect(persistTrace(baseTrace)).resolves.toBeUndefined();
  });

  it('writes trace to file when DEBUG_TRACE_PATH is set', async () => {
    vi.stubEnv('DEBUG_TRACE_PATH', '/tmp/traces');
    const writeFileSpy = vi.spyOn(fs, 'writeFile').mockResolvedValue(undefined);

    await persistTrace(baseTrace);

    expect(writeFileSpy).toHaveBeenCalledWith(
      '/tmp/traces/trace-123.json',
      JSON.stringify(baseTrace.trace, null, 2),
    );
  });

  it('does not write trace to file when DEBUG_TRACE_PATH is not set', async () => {
    const writeFileSpy = vi.spyOn(fs, 'writeFile');

    await persistTrace(baseTrace);

    expect(writeFileSpy).not.toHaveBeenCalled();
  });

  it('does not throw when file write fails', async () => {
    vi.stubEnv('DEBUG_TRACE_PATH', '/tmp/traces');
    vi.spyOn(fs, 'writeFile').mockRejectedValue(new Error('Disk full'));

    await expect(persistTrace(baseTrace)).resolves.toBeUndefined();
  });

  it('converts startedAt to a Date for the database', async () => {
    const now = Date.now();
    await persistTrace({ ...baseTrace, startedAt: now });

    const valuesFn = mockInsert.mock.results[0]!.value as { values: ReturnType<typeof vi.fn> };
    const inserted = valuesFn.values.mock.calls[0]![0] as Record<string, unknown>;
    expect(inserted.startedAt).toBeInstanceOf(Date);
    expect((inserted.startedAt as Date).getTime()).toBe(now);
  });
});
