import { metrics } from '@kestrel/shared';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  executeMastraTool,
  finishMastraRun,
  getMastraGenerationStats,
  mastraOutcomeForError,
} from '../src/mastra/telemetry';

const mocks = vi.hoisted(() => ({
  recordTelemetry: vi.fn().mockResolvedValue(undefined),
  recordToolTelemetry: vi.fn().mockResolvedValue(true),
  flushMetrics: vi.fn().mockResolvedValue(undefined),
  flushLangfuse: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('../src/persistence', () => ({
  recordTelemetry: mocks.recordTelemetry,
  recordToolTelemetry: mocks.recordToolTelemetry,
}));
vi.mock('@kestrel/shared/metrics-export', () => ({
  flushMetrics: mocks.flushMetrics,
}));
vi.mock('../src/instrumentation', () => ({
  flushLangfuse: mocks.flushLangfuse,
}));

describe('Mastra telemetry boundaries', () => {
  beforeEach(() => {
    metrics.reset();
    mocks.recordTelemetry.mockClear();
    mocks.recordToolTelemetry.mockClear();
    mocks.flushMetrics.mockClear();
    mocks.flushLangfuse.mockClear();
  });

  it('normalizes total usage and counts tool steps', () => {
    expect(
      getMastraGenerationStats({
        totalUsage: { inputTokens: 120, outputTokens: 45 },
        toolCalls: [{}, {}],
        steps: [{}, {}, {}],
      }),
    ).toEqual({ inputTokens: 120, outputTokens: 45, toolCalls: 2, steps: 3 });

    expect(
      getMastraGenerationStats({
        usage: { promptTokens: 7, completionTokens: 9 },
      }),
    ).toEqual({ inputTokens: 7, outputTokens: 9, toolCalls: 0, steps: 0 });
  });

  it('classifies aborts separately from ordinary failures', () => {
    const controller = new AbortController();
    controller.abort();

    expect(mastraOutcomeForError(new Error('cancelled'), controller.signal)).toBe('cancelled');
    expect(
      mastraOutcomeForError(Object.assign(new Error('cancelled'), { name: 'AbortError' })),
    ).toBe('cancelled');
    expect(mastraOutcomeForError(new Error('provider failed'))).toBe('failed');
  });

  it('records a successful tool without exposing its payload to telemetry', async () => {
    const span = vi.fn(<T>(_name: string, fn: () => T | Promise<T>): Promise<T> =>
      Promise.resolve(fn()),
    );
    const context = {
      requestContext: {
        get: (key: string) => ({ userId: 'user-1', runId: 'run-1', threadId: 'thread-1' })[key],
      },
      observe: {
        span,
        log: vi.fn(),
      },
    } as unknown as Parameters<typeof executeMastraTool>[1];

    const result = await executeMastraTool('get-xauusd-price', context, async () => ({
      secret: 'do-not-log',
    }));
    await vi.waitFor(() => expect(mocks.recordToolTelemetry).toHaveBeenCalledTimes(1));

    expect(result).toEqual({ secret: 'do-not-log' });
    expect(span).toHaveBeenCalledWith(
      'kestrel.mastra.tool.get-xauusd-price',
      expect.any(Function),
      expect.objectContaining({ tool: 'get-xauusd-price' }),
    );
    expect(mocks.recordToolTelemetry).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: 'user-1',
        runId: 'run-1',
        threadId: 'thread-1',
        tool: 'get-xauusd-price',
        ok: true,
        outputChars: expect.any(Number),
      }),
    );
    expect(
      metrics.snapshot().counters[
        'mastra_tool_call_total{agent=kestrel-xauusd-research-poc,outcome=success,tool=get-xauusd-price}'
      ],
    ).toBe(1);
  });

  it('records failed tools and rethrows the original error', async () => {
    const error = new Error('provider unavailable');
    const context = {
      requestContext: {
        get: (key: string) => ({ userId: 'user-1', runId: 'run-2' })[key],
      },
    };

    await expect(
      executeMastraTool('get-xauusd-candles', context, async () => {
        throw error;
      }),
    ).rejects.toBe(error);
    await vi.waitFor(() => expect(mocks.recordToolTelemetry).toHaveBeenCalledTimes(1));

    expect(mocks.recordToolTelemetry).toHaveBeenCalledWith(
      expect.objectContaining({
        runId: 'run-2',
        tool: 'get-xauusd-candles',
        ok: false,
        errorCode: 'Error',
      }),
    );
    expect(
      metrics.snapshot().counters[
        'mastra_tool_failed_total{agent=kestrel-xauusd-research-poc,error=Error,tool=get-xauusd-candles}'
      ],
    ).toBe(1);
  });

  it('records a terminal run, database telemetry, and exporter flushes', async () => {
    await finishMastraRun({
      userId: 'user-1',
      threadId: 'thread-1',
      runId: 'run-3',
      model: 'google/gemini-2.5-flash',
      providerId: 'google',
      startedAt: Date.now() - 20,
      inputTokens: 100,
      outputTokens: 40,
      toolCalls: 3,
      steps: 4,
      outcome: 'success',
    });

    expect(mocks.recordTelemetry).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: 'user-1',
        threadId: 'thread-1',
        runId: 'run-3',
        model: 'google/gemini-2.5-flash',
        inputTokens: 100,
        outputTokens: 40,
        toolCalls: 3,
        idempotencyKey: 'mastra.run:run-3:success',
        kind: 'mastra_xauusd_poc',
      }),
    );
    expect(mocks.flushLangfuse).toHaveBeenCalledOnce();
    expect(mocks.flushMetrics).toHaveBeenCalledOnce();
    expect(
      metrics.snapshot().counters[
        'mastra_run_total{agent=kestrel-xauusd-research-poc,outcome=success}'
      ],
    ).toBe(1);
  });

  it('labels canonical runs and keeps terminal telemetry idempotent', async () => {
    await finishMastraRun({
      userId: 'user-1',
      threadId: 'thread-1',
      runId: 'canonical-run-1',
      model: 'google/gemini-3.6-flash',
      providerId: 'google',
      startedAt: Date.now(),
      inputTokens: 2,
      outputTokens: 3,
      toolCalls: 0,
      steps: 1,
      outcome: 'success',
      telemetryKind: 'mastra_canonical_chat',
    });

    expect(mocks.recordTelemetry).toHaveBeenCalledWith(
      expect.objectContaining({
        idempotencyKey: 'mastra.run:canonical-run-1:success',
        kind: 'mastra_canonical_chat',
      }),
    );
  });

  it('does not fail the AI result when observability exporters are unavailable', async () => {
    mocks.flushLangfuse.mockRejectedValueOnce(new Error('Langfuse unavailable'));
    mocks.flushMetrics.mockRejectedValueOnce(new Error('Metrics exporter unavailable'));

    await expect(
      finishMastraRun({
        userId: 'user-1',
        threadId: 'thread-1',
        runId: 'run-exporter-failure',
        model: 'google/gemini-2.5-flash',
        providerId: 'google',
        startedAt: Date.now(),
        inputTokens: 1,
        outputTokens: 1,
        toolCalls: 0,
        steps: 1,
        outcome: 'success',
      }),
    ).resolves.toBeUndefined();

    expect(mocks.recordTelemetry).toHaveBeenCalledOnce();
    expect(mocks.flushLangfuse).toHaveBeenCalledOnce();
    expect(mocks.flushMetrics).toHaveBeenCalledOnce();
  });
});
