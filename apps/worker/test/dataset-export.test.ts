/**
 * Copyright 2026 Kestrel
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 */

import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// Hoisted mock controllers — vi.mock factories are hoisted above all other
// statements, so shared mock fns must live here to avoid TDZ failures.
const { mockAssemble, mockListPairs, mockRegister, mockDb, mockPublishLangfuse } = vi.hoisted(() => {
  const mockPublishLangfuse = vi.fn(async () => ({
    status: 'ok' as const,
    datasetName: 'kestrel-training',
    published: 3,
    failed: 0,
    total: 3,
    errors: [],
  }));
  const mockAssemble = vi.fn((input: { results: unknown[]; datasetVersion: string; source?: string; provenance?: Record<string, unknown> }) => ({
    jsonlContent: input.results.map((r) => JSON.stringify({ id: (r as { id: string }).id })).join('\n') + '\n',
    manifest: {
      datasetVersion: input.datasetVersion,
      recordCount: input.results.length,
      contentSha256: 'ab'.repeat(32),
      source: input.source ?? '',
      provenance: input.provenance ?? {},
    },
  }));
  const mockListPairs = vi.fn();
  const mockRegister = vi.fn(async (input: { version: string }) => ({ version: input.version }));
  const mockDb = {
    select: () => ({
      from: () => ({
        where: () => ({
          limit: async () => [{ id: 'admin-1' }],
        }),
      }),
    }),
  };
  return { mockAssemble, mockListPairs, mockRegister, mockDb, mockPublishLangfuse };
});

vi.mock('@kestrel/ai', () => ({
  getDb: () => mockDb,
  // Faithful stand-in for the real resolver: reviewer label wins, eval
  // fallback for unlinked cases, needs_review for hint-only feedback.
  resolveEvaluationAnnotations: (input: {
    results: Array<{ id: string }>;
    feedbackByMessageId?: Map<string, { reviewerLabel?: string | null }>;
    caseToMessageId?: Record<string, string>;
  }) => {
    const out: Record<string, { label: string }> = {};
    for (const result of input.results) {
      const linked = input.caseToMessageId?.[result.id];
      const messageId = input.feedbackByMessageId?.has(result.id) ? result.id : linked;
      const feedback = messageId ? input.feedbackByMessageId?.get(messageId) : undefined;
      out[result.id] = feedback?.reviewerLabel
        ? { label: feedback.reviewerLabel }
        : { label: 'needs_review' };
    }
    return out;
  },
  assembleTrainingDataset: mockAssemble,
  publishTrainingDatasetToLangfuse: mockPublishLangfuse,
}));

vi.mock('@kestrel/db', () => ({
  listReviewedTrainingPairs: mockListPairs,
  registerEvalDataset: mockRegister,
  schema: { users: {} },
}));

import { runDatasetExport } from '../src/jobs/dataset-export';
import { createLogger } from '../src/log';
import { TenantRouter } from '../src/tenant-router';

const log = createLogger({ service: 'test', forceJson: true });
const testRouter = new TenantRouter();

const msg1 = '00000000-0000-4000-8000-000000000001';
const msg2 = '00000000-0000-4000-8000-000000000002';
const msg3 = '00000000-0000-4000-8000-000000000003';

function pair(messageId: string, reviewerLabel: string | null) {
  return {
    messageId,
    threadId: 't-1',
    userId: 'u-1',
    prompt: `prompt-${messageId}`,
    assistantText: `answer-${messageId}`,
    rating: 'negative' as const,
    reviewerLabel,
    issueCodes: reviewerLabel === 'fail' ? ['wrong-tool'] : null,
    reviewerNote: null,
    reviewedAt: new Date(),
  };
}

describe('runDatasetExport', () => {
  let dir: string;
  let datasetsDir: string;
  let reportsDir: string;
  let previous: Record<string, string | undefined>;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'kestrel-ds-export-'));
    datasetsDir = join(dir, 'datasets');
    reportsDir = join(datasetsDir, 'eval-reports');
    mkdirSync(reportsDir, { recursive: true });
    previous = {
      DATASETS_DIR: process.env.DATASETS_DIR,
      EVAL_REPORTS_DIR: process.env.EVAL_REPORTS_DIR,
      B2_BUCKET: process.env.B2_BUCKET,
      B2_KEY_ID: process.env.B2_KEY_ID,
      B2_APPLICATION_KEY: process.env.B2_APPLICATION_KEY,
    };
    process.env.DATASETS_DIR = datasetsDir;
    process.env.EVAL_REPORTS_DIR = reportsDir;
    delete process.env.B2_BUCKET;
    delete process.env.B2_KEY_ID;
    delete process.env.B2_APPLICATION_KEY;
    mockAssemble.mockClear();
    mockListPairs.mockReset();
    mockRegister.mockClear();
  });

  afterEach(() => {
    for (const [key, value] of Object.entries(previous)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  });

  it('links eval cases to feedback, filters pending review, writes files and registers', async () => {
    // Eval report with one case whose assistant message has feedback (fail).
    writeFileSync(join(reportsDir, '2026-08-17T00-00-00Z.json'), JSON.stringify({
      schemaVersion: 'kestrel.eval-report.v1',
      results: [{
        id: 'case-1',
        prompt: 'eval prompt',
        text: 'eval answer',
        toolCalls: [],
        agentProgress: [],
        metadata: {},
        terminalStatus: 'complete',
        ok: true,
        assistantMessageId: msg1,
      }],
    }));

    mockListPairs.mockResolvedValue([
      pair(msg1, 'fail'),
      pair(msg2, 'pass'),
      pair(msg3, 'needs_review'), // must be filtered out
    ]);

    const result = await runDatasetExport({ log, signal: new AbortController().signal, tenantRouter: testRouter });

    // Assembler received the 3 approved records (case-1 + msg1 + msg2).
    expect(mockAssemble).toHaveBeenCalledTimes(1);
    const assembleInput = mockAssemble.mock.calls[0]![0];
    expect(assembleInput.results).toHaveLength(3);
    const ids = (assembleInput.results as Array<{ id: string }>).map((r) => r.id).sort();
    // ASCII sort: UUID digits land before the 'case-1' letters.
    expect(ids).toEqual([msg1, msg2, 'case-1']);

    const version = assembleInput.datasetVersion as string;
    expect(version).toMatch(/^nightly-\d{4}-\d{2}-\d{2}$/);

    // Files written.
    const outDir = join(datasetsDir, version);
    expect(existsSync(join(outDir, 'dataset.jsonl'))).toBe(true);
    expect(existsSync(join(outDir, 'manifest.json'))).toBe(true);
    const jsonl = readFileSync(join(outDir, 'dataset.jsonl'), 'utf8');
    expect(jsonl.split('\n')).toHaveLength(4); // 3 records + trailing newline

    // Registered with the admin user as the createdBy FK.
    expect(mockRegister).toHaveBeenCalledWith(expect.objectContaining({
      version,
      recordCount: 3,
      createdBy: 'admin-1',
    }));

    expect(result.processed).toBe(3);
    expect(result.note).toContain('feedback=3');
    expect(result.note).toContain('evalReports=1');
    expect(result.note).toContain('registered=true');
    expect(result.note).toContain('b2=false');
    expect(result.note).toContain('langfuse=ok');

    // Langfuse dataset publish closed the training loop.
    expect(mockPublishLangfuse).toHaveBeenCalledTimes(1);
    expect(mockPublishLangfuse).toHaveBeenCalledWith(
      expect.objectContaining({ manifest: expect.objectContaining({ recordCount: 3 }) }),
      expect.objectContaining({ datasetName: 'kestrel-training' }),
    );
  });

  it('returns a no-op note when there is nothing to export', async () => {
    mockListPairs.mockResolvedValue([]);
    const result = await runDatasetExport({ log, signal: new AbortController().signal, tenantRouter: testRouter });
    expect(result.processed).toBe(0);
    expect(result.note).toContain('nothing to export');
  });
});