import { rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { LibSQLStore } from '@mastra/libsql';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  createKestrelMastra,
  initializeKestrelMastra,
  loadLegacyEvalCases,
  migrateLegacyEvalCasesToDatasets,
  runDatasetExperiment,
  DATASET_IDS,
} from '../src/mastra-v2';
import { createDeterministicScorer } from '../src/mastra-v2/evals/scorers';

const mocks = vi.hoisted(() => ({
  runEvals: vi.fn(),
}));

vi.mock('@mastra/core/evals', async () => {
  const actual = await vi.importActual<Record<string, unknown>>('@mastra/core/evals');
  return { ...actual, runEvals: mocks.runEvals };
});

let dbFile: string;

beforeEach(() => {
  dbFile = join(tmpdir(), `kestrel-evals-datasets-${Date.now()}-${Math.random().toString(36).slice(2)}.db`);
});

afterEach(() => {
  rmSync(dbFile, { recursive: true, force: true });
  vi.restoreAllMocks();
});

async function buildInstance() {
  const storage = new LibSQLStore({ id: 'test', url: `file:${dbFile}` });
  const { instance } = createKestrelMastra({ storage });
  await initializeKestrelMastra({ instance, storageKind: 'libsql' });
  return instance;
}

describe('mastra evals — datasets migration', () => {
  it('loads legacy eval cases from all three source files', () => {
    expect(loadLegacyEvalCases(DATASET_IDS.cases).length).toBeGreaterThan(0);
    expect(loadLegacyEvalCases(DATASET_IDS.prompts).length).toBeGreaterThan(0);
    expect(loadLegacyEvalCases(DATASET_IDS.regression).length).toBeGreaterThan(0);
  });

  it('creates datasets and inserts items (idempotent on re-run)', async () => {
    const instance = await buildInstance();
    const first = await migrateLegacyEvalCasesToDatasets(instance);
    expect(first.created.length).toBe(3);
    expect(first.skipped).toEqual([]);

    const second = await migrateLegacyEvalCasesToDatasets(instance);
    expect(second.created).toEqual([]);
    expect(second.skipped.length).toBe(3);
  });

  it('regression dataset retains its external case ids', async () => {
    const instance = await buildInstance();
    await migrateLegacyEvalCasesToDatasets(instance, { skipExisting: false });
    const dataset = await instance.datasets.get({ id: DATASET_IDS.regression });
    const items = (await dataset.listItems({ perPage: 100 })) as unknown as { items: Array<{ externalId: string }> };
    expect(items.items.length).toBeGreaterThanOrEqual(55);
    expect(items.items.some((item) => item.externalId === 'reg-51-unicode-control-char-bypass')).toBe(true);
  });
});

describe('mastra evals — dataset experiment runner', () => {
  it('runs the dataset against a target and summarizes per-scorer means', async () => {
    const instance = await buildInstance();
    const scorer = createDeterministicScorer('test-quality', 'Scores 1 on good output', ({ output }) => {
      return String(output).includes('ok');
    });

    mocks.runEvals.mockResolvedValue({
      scores: {},
      summary: { totalItems: 3 },
      verdict: 'passed',
      thresholdResults: [{ id: 'test-quality', passed: true, averageScore: 1, threshold: 0.5 }],
      gateResults: [{ id: 'test-quality', passed: true, score: 1 }],
    });

    const summary = await runDatasetExperiment(instance, { id: 'kestrel-mastra-canonical-chat' } as never, {
      scorers: [scorer],
      gates: [scorer],
      datasetId: DATASET_IDS.prompts,
    });

    expect(mocks.runEvals).toHaveBeenCalledTimes(1);
    expect(summary.datasetId).toBe(DATASET_IDS.prompts);
    expect(summary.total).toBe(3);
    expect(summary.passed).toBe(1);
    expect(summary.perScorer['test-quality']).toEqual({ count: 3, mean: 1 });
  });
});
