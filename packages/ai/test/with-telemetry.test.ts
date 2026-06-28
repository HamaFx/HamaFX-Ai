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

import { describe, expect, it, vi, beforeEach } from 'vitest';

import { withTelemetry } from '../src/tools/with-telemetry';
import {
  getDiagnosticContext,
  withDiagnostics,
} from '../src/diagnostics/run-context';

// Mock persistence so we can verify recordToolTelemetry was called.
const mockRecordToolTelemetry = vi.fn();
vi.mock('../src/persistence', () => ({
  recordToolTelemetry: (...args: unknown[]) => mockRecordToolTelemetry(...args),
}));

// Mock tool-context to return predictable values.
// The import in with-telemetry.ts resolves to src/tool-context.ts.
const mockMaybeGetToolContext = vi.fn();
vi.mock('../src/tool-context', () => ({
  maybeGetToolContext: () => mockMaybeGetToolContext(),
}));

function makeTool(execute: (input: unknown, opts?: unknown) => unknown) {
  return {
    description: 'test tool',
    parameters: { type: 'object', properties: {}, required: [] } as const,
    execute,
  };
}

describe('withTelemetry — diagnostics integration', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockMaybeGetToolContext.mockReturnValue(null);
  });

  it('records a diagnostic step on execute', async () => {
    const tool = withTelemetry('test_tool', makeTool(async () => 'ok'));
    await withDiagnostics('user-1', 'thread-1', async () => {
      await tool.execute!({ foo: 'bar' }, {});

      const ctx = getDiagnosticContext()!;
      // completeStep mutates the step in-place (status → 'completed'),
      // so only 1 entry exists with both recordStep metadata + duration.
      const step = ctx.steps.find((s) => s.name === 'tool:test_tool');
      expect(step).toBeTruthy();
      expect(step!.status).toBe('completed');
      expect(step!.metadata?.input).toEqual({ foo: 'bar' });
      expect(step!.durationMs).toBeGreaterThanOrEqual(0);
    });
  });

  it('records a diagnostic error on thrown exception', async () => {
    const tool = withTelemetry(
      'failing_tool',
      makeTool(async () => {
        throw new TypeError('boom');
      }),
    );

    await withDiagnostics('user-1', 'thread-1', async () => {
      await expect(tool.execute!({}, {})).rejects.toThrow('boom');

      const ctx = getDiagnosticContext()!;
      const step = ctx.steps.find((s) => s.name === 'tool:failing_tool');
      expect(step).toBeTruthy();
      expect(step!.status).toBe('failed');
      expect(step!.durationMs).toBeGreaterThanOrEqual(0);

      expect(ctx.errors).toHaveLength(1);
      expect(ctx.errors[0]!.name).toBe('TypeError');
      expect(ctx.errors[0]!.message).toContain('boom');
    });
  });

  it('calls recordToolTelemetry on success', async () => {
    const tool = withTelemetry('ok_tool', makeTool(async () => 'done'));

    mockMaybeGetToolContext.mockReturnValue({
      threadId: 'tid-1',
      userId: 'uid-1',
      env: {} as never,
      signal: null,
      budget: { spent: 0, max: 100 },
      userSettings: {} as never,
    });

    await tool.execute!({}, {});
    expect(mockRecordToolTelemetry).toHaveBeenCalledTimes(1);
    expect(mockRecordToolTelemetry).toHaveBeenCalledWith(
      expect.objectContaining({
        threadId: 'tid-1',
        tool: 'ok_tool',
        ok: true,
      }),
    );
  });

  it('calls recordToolTelemetry on failure', async () => {
    const tool = withTelemetry(
      'bad_tool',
      makeTool(async () => {
        throw Object.assign(new Error('fail'), { code: 'MY_ERROR' });
      }),
    );

    mockMaybeGetToolContext.mockReturnValue({
      threadId: 'tid-2',
      userId: 'uid-2',
      env: {} as never,
      signal: null,
      budget: { spent: 0, max: 100 },
      userSettings: {} as never,
    });

    await expect(tool.execute!({}, {})).rejects.toThrow();
    expect(mockRecordToolTelemetry).toHaveBeenCalledTimes(1);
    expect(mockRecordToolTelemetry).toHaveBeenCalledWith(
      expect.objectContaining({
        threadId: 'tid-2',
        tool: 'bad_tool',
        ok: false,
        errorCode: 'MY_ERROR',
      }),
    );
  });

  it('uses error name for errorCode when no code field exists', async () => {
    const tool = withTelemetry(
      'no_code_tool',
      makeTool(async () => {
        throw new RangeError('out of range');
      }),
    );

    await expect(tool.execute!({}, {})).rejects.toThrow();
    expect(mockRecordToolTelemetry).toHaveBeenCalledWith(
      expect.objectContaining({ errorCode: 'RangeError', ok: false }),
    );
  });

  it('uses "unknown" errorCode for non-object errors', async () => {
    const tool = withTelemetry(
      'str_err_tool',
      makeTool(async () => {
        throw 'just a string'; // eslint-disable-line no-throw-literal
      }),
    );

    await expect(tool.execute!({}, {})).rejects.toBe('just a string');
    expect(mockRecordToolTelemetry).toHaveBeenCalledWith(
      expect.objectContaining({ errorCode: 'unknown', ok: false }),
    );
  });

  it('passes through the tool result unchanged', async () => {
    const tool = withTelemetry('passthrough', makeTool(async () => ({ data: [1, 2, 3] })));
    const result = await tool.execute!({}, {});
    expect(result).toEqual({ data: [1, 2, 3] });
  });

  it('propagates abortSignal from tool context', async () => {
    const ac = new AbortController();
    let capturedOpts: { abortSignal?: AbortSignal } = {};

    const tool = withTelemetry(
      'signal_aware',
      makeTool(async (_input, opts) => {
        capturedOpts = opts as { abortSignal?: AbortSignal };
        return 'ok';
      }),
    );

    mockMaybeGetToolContext.mockReturnValue({
      threadId: 'tid-3',
      userId: 'uid-3',
      env: {} as never,
      signal: ac.signal,
      budget: { spent: 0, max: 100 },
      userSettings: {} as never,
    });

    await tool.execute!({}, {});
    expect(capturedOpts.abortSignal).toBe(ac.signal);
  });

  it('returns tool as-is when execute is missing', () => {
    const toolDef = { description: 'schema only', parameters: { type: 'object' as const, properties: {}, required: [] as string[] } };
    const wrapped = withTelemetry('schema_only', toolDef);
    expect(wrapped).toBe(toolDef);
  });
});
