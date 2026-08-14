/**
 * Copyright 2026 Kestrel
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

import { beforeEach, describe, expect, it, vi } from 'vitest';

const { insertValues, db } = vi.hoisted(() => {
  const insertValues = vi.fn();
  const insertBuilder = {
    values: insertValues,
    onConflictDoUpdate: vi.fn().mockResolvedValue(undefined),
  };
  insertValues.mockReturnValue(insertBuilder);
  const db = {
    insert: vi.fn(() => insertBuilder),
  };
  return { insertValues, db };
});

vi.mock('../src/db', () => ({
  getDb: () => db,
}));

import { recordTelemetry, recordToolTelemetry } from '../src/persistence/telemetry-persistence';
import { getDiagnosticContext, withDiagnostics } from '../src/diagnostics/run-context';

describe('telemetry persistence correlation', () => {
  beforeEach(() => {
    insertValues.mockClear();
    db.insert.mockClear();
  });

  it('fills turn and tool telemetry correlation fields from the active diagnostic scope', async () => {
    let traceId: string | undefined;

    await withDiagnostics(
      'user-1',
      'thread-1',
      async () => {
        traceId = getDiagnosticContext()!.traceId;
        await recordTelemetry({
          userId: 'user-1',
          threadId: 'thread-1',
          messageId: 'message-1',
          model: 'test/model',
          inputTokens: 10,
          outputTokens: 5,
          toolCalls: 1,
          ms: 20,
        });
        await recordToolTelemetry({
          userId: 'user-1',
          threadId: 'thread-1',
          messageId: 'message-1',
          tool: 'get_price',
          ms: 4,
          ok: true,
        });
      },
      { requestId: 'request-1', runId: 'run-1', jobId: 'job-1' },
    );

    const telemetryRows = insertValues.mock.calls
      .map(([values]) => values as Record<string, unknown>)
      .filter((values) => values.model === 'test/model');
    const toolRows = insertValues.mock.calls
      .map(([values]) => values as Record<string, unknown>)
      .filter((values) => values.tool === 'get_price');

    expect(telemetryRows).toHaveLength(1);
    expect(toolRows).toHaveLength(1);
    expect(telemetryRows[0]).toMatchObject({
      traceId,
      runId: 'run-1',
      jobId: 'job-1',
    });
    expect(toolRows[0]).toMatchObject({
      traceId,
      runId: 'run-1',
      jobId: 'job-1',
    });
  });

  it('prefers explicit correlation values over the active scope', async () => {
    let traceId: string | undefined;

    await withDiagnostics('user-1', 'thread-1', async () => {
      traceId = getDiagnosticContext()!.traceId;
      await recordTelemetry({
        userId: 'user-1',
        threadId: 'thread-1',
        messageId: null,
        traceId: 'explicit-trace',
        runId: 'explicit-run',
        jobId: 'explicit-job',
        model: 'test/explicit',
        inputTokens: 0,
        outputTokens: 0,
        toolCalls: 0,
        ms: 0,
      });
    });

    const row = insertValues.mock.calls
      .map(([values]) => values as Record<string, unknown>)
      .find((values) => values.model === 'test/explicit');

    expect(traceId).not.toBe('explicit-trace');
    expect(row).toMatchObject({
      traceId: 'explicit-trace',
      runId: 'explicit-run',
      jobId: 'explicit-job',
    });
  });
});
