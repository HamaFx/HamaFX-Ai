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

// Tests for the Langfuse dataset publisher — governed record mapping,
// deterministic item ids, publish lifecycle (skip/ok/partial/failed/dry-run),
// and the env-config + SDK adapter.

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { metrics } from '@kestrel/shared';

import {
  createLangfuseClientFromEnv,
  LangfuseSdkClient,
  publishTrainingDatasetToLangfuse,
  recordToDatasetItem,
  stableDatasetItemId,
  type LangfuseDatasetClient,
} from '../src/eval/langfuse-publisher';
import { buildDatasetManifest, buildTrainingRecords } from '../src/eval/training-export';
import type { PromptResult } from '../src/eval/runner';
import type { AssembledDataset } from '../src/eval/assemble-dataset';

const mockLangfuseCtor = vi.fn();
const mockApiDatasetsCreate = vi.fn();
const mockDatasetCreateItem = vi.fn();

vi.mock('@langfuse/client', () => ({
  LangfuseClient: class {
    constructor(...args: unknown[]) {
      mockLangfuseCtor(...args);
    }
    api = { datasets: { create: mockApiDatasetsCreate } };
    dataset = { createItem: mockDatasetCreateItem };
  },
}));

function makeResult(id: string, ok: boolean): PromptResult {
  return {
    id,
    prompt: `prompt for ${id}`,
    text: `answer for ${id}`,
    ttftMs: 100,
    totalMs: 1000,
    toolCalls: [{ name: 'get_price' }],
    agentProgress: [],
    metadata: { totalCostUsd: 0.01 },
    terminalStatus: ok ? 'complete' : null,
    ok,
    assertions: [],
  } as unknown as PromptResult;
}

function makeDataset(): AssembledDataset {
  const results = [makeResult('case-1', true), makeResult('case-2', false)] as PromptResult[];
  const options = {
    datasetVersion: 'v1.0.0',
    splitByCaseId: (id: string) => (id === 'case-1' ? 'train' : 'test'),
    requireApprovedAnnotations: false,
  } as const;
  const records = buildTrainingRecords(results, options);
  const jsonlContent = `${records.map((record) => JSON.stringify(record)).join('\n')}\n`;
  const manifest = buildDatasetManifest(records, options, jsonlContent);
  return { records, manifest, jsonlContent };
}

function makeRecordingClient(): LangfuseDatasetClient & {
  ensured: Array<{ datasetName: string; description: string | undefined; metadata: unknown }>;
  published: unknown[];
  failEnsure?: boolean;
  failItemIds?: Set<string>;
} {
  return {
    ensured: [],
    published: [],
    failEnsure: false,
    failItemIds: new Set(),
    async ensureDataset(datasetName, description, metadata) {
      if (this.failEnsure) throw new Error('dataset create failed');
      this.ensured.push({ datasetName, description, metadata });
    },
    async publishItem(item) {
      if (this.failItemIds?.has(item.id)) throw new Error(`publish failed for ${item.id}`);
      this.published.push(item);
    },
  };
}

const ENV = {
  LANGFUSE_PUBLIC_KEY: 'pk-test',
  LANGFUSE_SECRET_KEY: 'sk-test',
  LANGFUSE_BASE_URL: 'https://cloud.langfuse.com',
};

beforeEach(() => {
  vi.clearAllMocks();
  metrics.reset();
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('stableDatasetItemId', () => {
  it('is deterministic', () => {
    expect(stableDatasetItemId('kestrel-eval', 'case-1')).toBe(stableDatasetItemId('kestrel-eval', 'case-1'));
  });

  it('differs across dataset name and case id', () => {
    const a = stableDatasetItemId('kestrel-eval', 'case-1');
    const b = stableDatasetItemId('kestrel-eval', 'case-2');
    const c = stableDatasetItemId('other-eval', 'case-1');
    expect(a).not.toBe(b);
    expect(a).not.toBe(c);
    expect(a).toHaveLength(64);
  });
});

describe('recordToDatasetItem', () => {
  it('maps a record to a governed item (hashes + labels, no raw prompt/output)', () => {
    const dataset = makeDataset();
    const record = dataset.records.find((r) => r.caseId === 'case-1')!;
    const item = recordToDatasetItem(record, 'kestrel-eval');

    expect(item.id).toBe(stableDatasetItemId('kestrel-eval', 'case-1'));
    expect(item.datasetName).toBe('kestrel-eval');
    expect(item.input).toEqual({
      caseId: 'case-1',
      promptSha256: expect.any(String),
      schemaVersion: 'kestrel.eval-record.v1',
    });
    expect(item.expectedOutput).toEqual({ label: 'pass' });
    expect(item.metadata).toMatchObject({
      datasetVersion: 'v1.0.0',
      split: 'train',
      transportOk: true,
      toolNames: ['get_price'],
    });

    // Never leaks raw prompt or output.
    const serialized = JSON.stringify(item);
    expect(serialized).not.toContain('prompt for case-1');
    expect(serialized).not.toContain('answer for case-1');
  });
});

describe('publishTrainingDatasetToLangfuse', () => {
  it('skips gracefully when no client is configured', async () => {
    const result = await publishTrainingDatasetToLangfuse(makeDataset(), {
      datasetName: 'kestrel-eval',
      client: null,
    });
    expect(result).toEqual({ status: 'skipped', reason: 'not-configured', datasetName: 'kestrel-eval' });
    expect(metrics.snapshot().counters['dataset_publish_total{result=skipped}']).toBe(1);
  });

  it('publishes every record on the happy path', async () => {
    const client = makeRecordingClient();
    const dataset = makeDataset();
    const result = await publishTrainingDatasetToLangfuse(dataset, {
      datasetName: 'kestrel-eval',
      description: 'governed eval training records',
      client,
    });

    expect(result).toMatchObject({ status: 'ok', published: 2, failed: 0, total: 2 });
    expect(client.ensured).toHaveLength(1);
    expect(client.ensured[0]?.metadata).toMatchObject({
      schemaVersion: 'kestrel.eval-manifest.v1',
      datasetVersion: 'v1.0.0',
      recordCount: 2,
    });
    expect(client.published).toHaveLength(2);
    expect(metrics.snapshot().counters['dataset_publish_total{result=ok}']).toBe(1);
  });

  it('reports partial failure when one item fails but keeps publishing', async () => {
    const dataset = makeDataset();
    const failingId = stableDatasetItemId('kestrel-eval', 'case-2');
    const client = makeRecordingClient();
    client.failItemIds = new Set([failingId]);

    const result = await publishTrainingDatasetToLangfuse(dataset, {
      datasetName: 'kestrel-eval',
      client,
    });

    expect(result.status).toBe('partial');
    if (result.status === 'partial') {
      expect(result.published).toBe(1);
      expect(result.failed).toBe(1);
    }
    expect(client.published).toHaveLength(1);
    expect(metrics.snapshot().counters['dataset_publish_total{result=fail}']).toBe(1);
  });

  it('fails fast when the dataset cannot be created', async () => {
    const client = makeRecordingClient();
    client.failEnsure = true;

    const result = await publishTrainingDatasetToLangfuse(makeDataset(), {
      datasetName: 'kestrel-eval',
      client,
    });

    expect(result.status).toBe('failed');
    expect(client.published).toHaveLength(0);
    expect(metrics.snapshot().counters['dataset_publish_total{result=fail}']).toBe(1);
  });

  it('dry run skips network calls but reports the record count', async () => {
    const client = makeRecordingClient();
    const result = await publishTrainingDatasetToLangfuse(makeDataset(), {
      datasetName: 'kestrel-eval',
      client,
      dryRun: true,
    });

    expect(result).toMatchObject({ status: 'ok', published: 0, total: 2, dryRun: true });
    expect(client.ensured).toHaveLength(0);
    expect(client.published).toHaveLength(0);
  });
});

describe('createLangfuseClientFromEnv', () => {
  it('returns null when LANGFUSE_* env is not configured', () => {
    expect(createLangfuseClientFromEnv()).toBeNull();
  });

  it('returns an SDK client when LANGFUSE_* env is configured', () => {
    vi.stubEnv('LANGFUSE_PUBLIC_KEY', ENV.LANGFUSE_PUBLIC_KEY);
    vi.stubEnv('LANGFUSE_SECRET_KEY', ENV.LANGFUSE_SECRET_KEY);
    vi.stubEnv('LANGFUSE_BASE_URL', ENV.LANGFUSE_BASE_URL);

    const client = createLangfuseClientFromEnv();
    expect(client).toBeInstanceOf(LangfuseSdkClient);
    expect(mockLangfuseCtor).toHaveBeenCalledWith({
      publicKey: ENV.LANGFUSE_PUBLIC_KEY,
      secretKey: ENV.LANGFUSE_SECRET_KEY,
      baseUrl: ENV.LANGFUSE_BASE_URL,
    });
  });
});

describe('LangfuseSdkClient', () => {
  it('treats an existing dataset (409) as a no-op', async () => {
    const client = new LangfuseSdkClient();
    mockApiDatasetsCreate.mockRejectedValueOnce({ status: 409, message: 'already exists' });

    await expect(client.ensureDataset('kestrel-eval', undefined, undefined)).resolves.toBeUndefined();
    expect(mockApiDatasetsCreate).toHaveBeenCalledWith({ name: 'kestrel-eval' });
  });

  it('rethrows non-conflict dataset create errors', async () => {
    const client = new LangfuseSdkClient();
    mockApiDatasetsCreate.mockRejectedValueOnce(new Error('network down'));

    await expect(client.ensureDataset('kestrel-eval')).rejects.toThrow('network down');
  });

  it('delegates item publishing to the SDK', async () => {
    const client = new LangfuseSdkClient();
    mockDatasetCreateItem.mockResolvedValueOnce(undefined);

    await client.publishItem({
      datasetName: 'kestrel-eval',
      id: 'item-1',
      input: { caseId: 'case-1' },
      expectedOutput: { label: 'pass' },
      metadata: { split: 'train' },
    });

    expect(mockDatasetCreateItem).toHaveBeenCalledWith({
      datasetName: 'kestrel-eval',
      id: 'item-1',
      input: { caseId: 'case-1' },
      expectedOutput: { label: 'pass' },
      metadata: { split: 'train' },
    });
  });
});
