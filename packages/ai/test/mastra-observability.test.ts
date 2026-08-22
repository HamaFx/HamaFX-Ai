// SPDX-License-Identifier: Apache-2.0

import { rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { LibSQLStore } from '@mastra/libsql';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  createKestrelMastra,
  initializeKestrelMastra,
  createMastraObservability,
  langfuseSamplingRatio,
  langfuseTraceUrl,
  providerFromModel,
  runTracingOptions,
  summarizeWorkflowRunState,
  toMastraRunView,
  workflowIdForKind,
  type RunTelemetryRow,
} from '../src/mastra-v2';

let dbFile: string;

beforeEach(() => {
  dbFile = join(tmpdir(), `kestrel-obs-${Date.now()}-${Math.random().toString(36).slice(2)}.db`);
});

afterEach(() => {
  rmSync(dbFile, { recursive: true, force: true });
  vi.restoreAllMocks();
});

async function buildInstance() {
  const storage = new LibSQLStore({ id: 'test', url: `file:${dbFile}` });
  // `observability: false` keeps the instance hermetic even when the test
  // environment carries LANGFUSE_* vars.
  const { instance } = createKestrelMastra({ storage, observability: false });
  await initializeKestrelMastra({ instance, storageKind: 'libsql' });
  return instance;
}

function telemetryRow(overrides: Partial<RunTelemetryRow> = {}): RunTelemetryRow {
  return {
    runId: 'run-1',
    traceId: 'trace-1',
    threadId: 'thread-1',
    userId: 'user-1',
    model: 'google/gemini-2.5-pro',
    inputTokens: 100,
    outputTokens: 50,
    toolCalls: 3,
    ms: 1234,
    estCostUsd: 0.01,
    kind: 'mastra_mode',
    createdAt: new Date('2026-08-21T12:00:00Z'),
    ...overrides,
  };
}

describe('mastra observability — telemetry helpers', () => {
  it('builds run tracing options with runId metadata and stable tags', () => {
    const options = runTracingOptions({
      runId: 'run-9',
      userId: 'user-9',
      threadId: 'thread-9',
      kind: 'mastra_mode',
      tags: ['full'],
    });
    expect(options.metadata).toMatchObject({
      runId: 'run-9',
      userId: 'user-9',
      threadId: 'thread-9',
      kind: 'mastra_mode',
    });
    expect(options.tags).toContain('kestrel');
    expect(options.tags).toContain('mastra_mode');
    expect(options.tags).toContain('full');
  });

  it('langfuse sampling defaults to 1 and respects a valid override', () => {
    const prev = process.env.MASTRA_OBSERVABILITY_SAMPLING;
    try {
      delete process.env.MASTRA_OBSERVABILITY_SAMPLING;
      expect(langfuseSamplingRatio()).toBe(1);
      process.env.MASTRA_OBSERVABILITY_SAMPLING = '0.25';
      expect(langfuseSamplingRatio()).toBe(0.25);
      process.env.MASTRA_OBSERVABILITY_SAMPLING = 'bogus';
      expect(langfuseSamplingRatio()).toBe(1);
    } finally {
      if (prev === undefined) delete process.env.MASTRA_OBSERVABILITY_SAMPLING;
      else process.env.MASTRA_OBSERVABILITY_SAMPLING = prev;
    }
  });

  it('langfuse trace url is null without config and a deep link with it', () => {
    const prev = {
      key: process.env.LANGFUSE_PUBLIC_KEY,
      secret: process.env.LANGFUSE_SECRET_KEY,
      base: process.env.LANGFUSE_BASE_URL,
    };
    try {
      delete process.env.LANGFUSE_PUBLIC_KEY;
      delete process.env.LANGFUSE_SECRET_KEY;
      delete process.env.LANGFUSE_BASE_URL;
      expect(langfuseTraceUrl('abc')).toBeNull();

      process.env.LANGFUSE_PUBLIC_KEY = 'pk';
      process.env.LANGFUSE_SECRET_KEY = 'sk';
      process.env.LANGFUSE_BASE_URL = 'https://cloud.langfuse.com/';
      expect(langfuseTraceUrl('abc')).toBe('https://cloud.langfuse.com/trace/abc');
    } finally {
      process.env.LANGFUSE_PUBLIC_KEY = prev.key;
      process.env.LANGFUSE_SECRET_KEY = prev.secret;
      process.env.LANGFUSE_BASE_URL = prev.base;
    }
  });

  it('createMastraObservability is undefined without Langfuse and an entrypoint with it', async () => {
    const prev = {
      key: process.env.LANGFUSE_PUBLIC_KEY,
      secret: process.env.LANGFUSE_SECRET_KEY,
      base: process.env.LANGFUSE_BASE_URL,
    };
    try {
      delete process.env.LANGFUSE_PUBLIC_KEY;
      delete process.env.LANGFUSE_SECRET_KEY;
      delete process.env.LANGFUSE_BASE_URL;
      expect(createMastraObservability()).toBeUndefined();

      process.env.LANGFUSE_PUBLIC_KEY = 'pk';
      process.env.LANGFUSE_SECRET_KEY = 'sk';
      process.env.LANGFUSE_BASE_URL = 'https://cloud.langfuse.com';
      const entrypoint = createMastraObservability();
      expect(entrypoint).toBeDefined();
      expect(typeof entrypoint?.flush).toBe('function');
      await entrypoint?.shutdown();
    } finally {
      process.env.LANGFUSE_PUBLIC_KEY = prev.key;
      process.env.LANGFUSE_SECRET_KEY = prev.secret;
      process.env.LANGFUSE_BASE_URL = prev.base;
    }
  });

  it('provider is derived from the model id prefix', () => {
    expect(providerFromModel('google/gemini-2.5-pro')).toBe('google');
    expect(providerFromModel('google-vertex/gemini-2.5-flash')).toBe('google-vertex');
    expect(providerFromModel('openai:gpt-4o')).toBe('openai');
    expect(providerFromModel('nonsense')).toBe('unknown');
  });

  it('maps telemetry kinds to workflow ids', () => {
    expect(workflowIdForKind('mastra_mode')).toBe('symbol-research');
    expect(workflowIdForKind('mastra_mode_failed')).toBe('symbol-research');
    expect(workflowIdForKind('mastra_full_job')).toBe('full-analysis');
    expect(workflowIdForKind('mastra_full_job_failed')).toBe('full-analysis');
    expect(workflowIdForKind('mastra_xauusd_poc')).toBe('xauusd-report');
    expect(workflowIdForKind('mastra_canonical_chat')).toBeNull();
    expect(workflowIdForKind(null)).toBeNull();
  });

  it('summarizes workflow run state including failed steps', () => {
    const empty = summarizeWorkflowRunState(null, 'symbol-research');
    expect(empty.status).toBeNull();
    expect(empty.failedSteps).toEqual([]);

    const snapshot = {
      status: 'failed',
      steps: {
        'collect-packet': { status: 'succeeded' },
        technical: { status: 'failed' },
        fusion: { status: 'running' },
      },
    } as never;
    const summary = summarizeWorkflowRunState(snapshot, 'symbol-research');
    expect(summary.workflowId).toBe('symbol-research');
    expect(summary.status).toBe('failed');
    expect(summary.failedSteps).toEqual(['technical']);
    expect(summary.completedSteps).toBe(1);
    expect(summary.totalSteps).toBe(3);
  });
});

describe('mastra observability — unified run view', () => {
  it('degrades to telemetry-only when no instance is provided', async () => {
    // Clear Langfuse env so the view does not produce a deep link.
    const prev = {
      key: process.env.LANGFUSE_PUBLIC_KEY,
      secret: process.env.LANGFUSE_SECRET_KEY,
      base: process.env.LANGFUSE_BASE_URL,
    };
    try {
      delete process.env.LANGFUSE_PUBLIC_KEY;
      delete process.env.LANGFUSE_SECRET_KEY;
      delete process.env.LANGFUSE_BASE_URL;
      const view = await toMastraRunView(telemetryRow(), undefined);
      expect(view.runId).toBe('run-1');
      expect(view.provider).toBe('google');
      expect(view.workflow.status).toBeNull();
      expect(view.scores).toEqual([]);
      expect(view.scoreMean).toBeNull();
      expect(view.langfuseUrl).toBeNull();
    } finally {
      process.env.LANGFUSE_PUBLIC_KEY = prev.key;
      process.env.LANGFUSE_SECRET_KEY = prev.secret;
      process.env.LANGFUSE_BASE_URL = prev.base;
    }
  });

  it('joins workflow snapshot status and score records for a run', async () => {
    const instance = await buildInstance();

    // Seed a workflow snapshot + a score row for the same runId.
    const storage = instance.getStorage() as never as {
      getStore(domain: string): Promise<{
        persistWorkflowSnapshot(input: unknown): Promise<void>;
      }>;
    };
    const workflowsDomain = await storage.getStore('workflows');
    await workflowsDomain.persistWorkflowSnapshot({
      workflowName: 'symbol-research',
      runId: 'run-1',
      resourceId: 'user-1',
      snapshot: {
        runId: 'run-1',
        status: 'running',
        value: {},
        context: {},
        serializedStepGraph: [],
        activePaths: [],
        activeStepsPath: {},
        suspendedPaths: {},
        resumeLabels: {},
        waitingPaths: {},
        timestamp: Date.now(),
      },
    });

    const view = await toMastraRunView(
      telemetryRow({ kind: 'mastra_mode', traceId: null }),
      instance,
    );
    expect(view.workflow.workflowId).toBe('symbol-research');
    expect(view.workflow.status).toBe('running');
    expect(view.scores).toEqual([]);
    expect(view.langfuseUrl).toBeNull();
  });

  it('computes the mean score when score records exist', async () => {
    const instance = await buildInstance();
    const storage = instance.getStorage() as never as {
      getStore(domain: string): Promise<{ saveScore(input: unknown): Promise<unknown> }>;
    };
    const scoresDomain = await storage.getStore('scores');
    for (const score of [0.9, 0.7]) {
      await scoresDomain.saveScore({
        runId: 'run-2',
        entityId: 'entity-2',
        entityType: 'AGENT',
        scorerId: 'faithfulness',
        score,
        output: score >= 0.8 ? 'good' : 'bad',
        source: 'LIVE',
        scorer: { id: 'faithfulness' },
        entity: { id: 'entity-2' },
      });
    }
    const view = await toMastraRunView(telemetryRow({ runId: 'run-2' }), instance);
    expect(view.scores.length).toBe(2);
    expect(view.scoreMean).toBeCloseTo(0.8, 5);
    expect(view.scores[0]).toMatchObject({ scorerId: 'faithfulness', source: 'LIVE' });
  });
});
