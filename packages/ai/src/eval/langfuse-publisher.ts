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

// Langfuse dataset publishing — bridges `assemble-dataset.ts` (governed
// training records) to a Langfuse dataset so the eval → annotation → dataset
// → experiment loop is closed. Publishing is governed: each item carries
// prompt/output *hashes*, reviewer labels, splits, and operational metrics —
// never raw prompts or outputs unless an operator explicitly approved an
// export that includes sanitized assistant text.

import { createHash } from 'node:crypto';

import { LangfuseClient } from '@langfuse/client';
import { createCategorizedLogger } from '@kestrel/shared/logger';
import { metrics } from '@kestrel/shared';

import type { AssembledDataset } from './assemble-dataset';
import type { TrainingExportRecord } from './training-export';

const plog = createCategorizedLogger('ai', { component: 'langfuse-dataset' });

/** Minimal surface we need from `@langfuse/client` — injectable for tests. */
export interface LangfuseDatasetClient {
  /** Create (or no-op if it already exists) a dataset. */
  ensureDataset(datasetName: string, description?: string, metadata?: unknown): Promise<void>;
  /** Upsert a single dataset item keyed by `id`. */
  publishItem(item: {
    datasetName: string;
    id: string;
    input: unknown;
    expectedOutput: unknown;
    metadata: unknown;
  }): Promise<void>;
}

export interface LangfusePublishOptions {
  /** Full dataset name (slashes create folders in the Langfuse UI). */
  datasetName: string;
  description?: string;
  /** Inject a client for tests; defaults to one built from `LANGFUSE_*` env. */
  client?: LangfuseDatasetClient | null;
  /** When false, do not create the dataset or items (dry run). */
  dryRun?: boolean;
}

export type LangfusePublishResult =
  | { status: 'skipped'; reason: 'not-configured'; datasetName: string }
  | {
      status: 'ok' | 'partial' | 'failed';
      datasetName: string;
      published: number;
      failed: number;
      total: number;
      errors: string[];
      dryRun?: boolean;
    };

/** Stable project-level item id — deterministic so re-publishing upserts. */
export function stableDatasetItemId(datasetName: string, caseId: string): string {
  return createHash('sha256').update(`${datasetName}:${caseId}`, 'utf8').digest('hex');
}

/** Map a governed training record to a Langfuse dataset item. */
export function recordToDatasetItem(
  record: TrainingExportRecord,
  datasetName: string,
): {
  datasetName: string;
  id: string;
  input: unknown;
  expectedOutput: unknown;
  metadata: unknown;
} {
  const expectedOutput: Record<string, unknown> = {
    label: record.annotation.label,
    ...(record.annotation.issueCodes ? { issueCodes: record.annotation.issueCodes } : {}),
    ...(record.assistantText !== undefined ? { assistantText: record.assistantText } : {}),
  };

  const metadata: Record<string, unknown> = {
    datasetVersion: record.datasetVersion,
    toolNames: record.toolNames,
    terminalStatus: record.terminalStatus,
    transportOk: record.transportOk,
    assertionKinds: record.assertionKinds,
    ttftMs: record.ttftMs,
    totalMs: record.totalMs,
    costUsd: record.costUsd,
    assistantOutputSha256: record.assistantOutputSha256,
    ...(record.split ? { split: record.split } : {}),
    ...(record.annotation.reviewerId ? { reviewerId: record.annotation.reviewerId } : {}),
    ...(record.annotation.note ? { note: record.annotation.note } : {}),
    ...(record.approval ? { approval: record.approval } : {}),
  };

  return {
    datasetName,
    id: stableDatasetItemId(datasetName, record.caseId),
    input: {
      caseId: record.caseId,
      promptSha256: record.promptSha256,
      schemaVersion: record.schemaVersion,
    },
    expectedOutput,
    metadata,
  };
}

/** Publish an assembled training dataset to Langfuse. */
export async function publishTrainingDatasetToLangfuse(
  dataset: AssembledDataset,
  options: LangfusePublishOptions,
): Promise<LangfusePublishResult> {
  const { datasetName } = options;
  const client = options.client === undefined ? createLangfuseClientFromEnv() : options.client;
  if (!client) {
    metrics.increment('dataset_publish_total', { tags: { result: 'skipped' } });
    return { status: 'skipped', reason: 'not-configured', datasetName };
  }

  const metadata = {
    schemaVersion: dataset.manifest.schemaVersion,
    datasetVersion: dataset.manifest.datasetVersion,
    recordCount: dataset.manifest.recordCount,
    labelCounts: dataset.manifest.labelCounts,
    splitCounts: dataset.manifest.splitCounts,
    contentSha256: dataset.manifest.contentSha256,
    provenance: dataset.manifest.provenance,
  };

  if (options.dryRun) {
    metrics.increment('dataset_publish_total', { tags: { result: 'ok' } });
    return {
      status: 'ok',
      datasetName,
      published: 0,
      failed: 0,
      total: dataset.records.length,
      errors: [],
      dryRun: true,
    };
  }

  try {
    await client.ensureDataset(datasetName, options.description, metadata);
  } catch (err) {
    metrics.increment('dataset_publish_total', { tags: { result: 'fail' } });
    plog.error('failed to create Langfuse dataset', {
      datasetName,
      err: err instanceof Error ? err.message : String(err),
    });
    return {
      status: 'failed',
      datasetName,
      published: 0,
      failed: dataset.records.length,
      total: dataset.records.length,
      errors: [err instanceof Error ? err.message : String(err)],
    };
  }

  let published = 0;
  let failed = 0;
  const errors: string[] = [];
  for (const record of dataset.records) {
    try {
      await client.publishItem(recordToDatasetItem(record, datasetName));
      published += 1;
    } catch (err) {
      failed += 1;
      const message = err instanceof Error ? err.message : String(err);
      errors.push(`${record.caseId}: ${message}`);
      plog.warn('failed to publish training record to Langfuse', {
        datasetName,
        caseId: record.caseId,
        err: message,
      });
    }
  }

  const status = failed === 0 ? 'ok' : published === 0 ? 'failed' : 'partial';
  metrics.increment('dataset_publish_total', { tags: { result: status === 'ok' ? 'ok' : 'fail' } });
  plog.info('Langfuse dataset publish complete', {
    datasetName,
    published,
    failed,
    total: dataset.records.length,
  });
  return { status, datasetName, published, failed, total: dataset.records.length, errors };
}

/**
 * Build a Langfuse client from `LANGFUSE_*` env vars, or null when they are
 * not configured. Mirrors `instrumentation.ts` so dataset publishing is
 * silently disabled in environments without Langfuse credentials.
 */
export function createLangfuseClientFromEnv(): LangfuseDatasetClient | null {
  const publicKey = process.env.LANGFUSE_PUBLIC_KEY;
  const secretKey = process.env.LANGFUSE_SECRET_KEY;
  const baseUrl = process.env.LANGFUSE_BASE_URL;
  if (!publicKey || !secretKey || !baseUrl) return null;
  return new LangfuseSdkClient({ publicKey, secretKey, baseUrl });
}

/** Thin adapter over the official `@langfuse/client` SDK. */
export class LangfuseSdkClient implements LangfuseDatasetClient {
  private readonly client: LangfuseClient;

  constructor(params?: { publicKey?: string; secretKey?: string; baseUrl?: string; timeout?: number }) {
    this.client = new LangfuseClient({
      ...(params?.publicKey ? { publicKey: params.publicKey } : {}),
      ...(params?.secretKey ? { secretKey: params.secretKey } : {}),
      ...(params?.baseUrl ? { baseUrl: params.baseUrl } : {}),
      ...(params?.timeout !== undefined ? { timeout: params.timeout } : {}),
    });
  }

  async ensureDataset(datasetName: string, description?: string, metadata?: unknown): Promise<void> {
    try {
      await this.client.api.datasets.create({
        name: datasetName,
        ...(description !== undefined ? { description } : {}),
        ...(metadata !== undefined ? { metadata } : {}),
      });
    } catch (err) {
      // Dataset names are unique per project; an existing dataset is fine for
      // idempotent publishing. LangfuseAPIClient surfaces HTTP status on the
      // error as `status` or via message; treat any "already exists" signal as
      // a no-op and rethrow everything else.
      if (isDatasetExistsError(err)) return;
      throw err;
    }
  }

  async publishItem(item: {
    datasetName: string;
    id: string;
    input: unknown;
    expectedOutput: unknown;
    metadata: unknown;
  }): Promise<void> {
    await this.client.dataset.createItem({
      datasetName: item.datasetName,
      id: item.id,
      input: item.input,
      expectedOutput: item.expectedOutput,
      metadata: item.metadata,
    });
  }
}

function isDatasetExistsError(err: unknown): boolean {
  if (typeof err !== 'object' || err === null) return false;
  const status = (err as { status?: unknown }).status;
  if (status === 409) return true;
  const message = (err as { message?: unknown }).message;
  return typeof message === 'string' && /already exists|conflict|unique/i.test(message);
}
