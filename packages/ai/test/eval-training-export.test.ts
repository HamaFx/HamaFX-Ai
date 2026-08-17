import { describe, expect, it } from 'vitest';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { join } from 'node:path';

import {
  buildTrainingRecords,
  buildDatasetManifest,
  writeTrainingExport,
} from '../src/eval/training-export';
import type { PromptResult } from '../src/eval/runner';

function result(overrides: Partial<PromptResult> = {}): PromptResult {
  return {
    id: 'case-1',
    prompt: 'Private user prompt with account details',
    ttftMs: 42,
    totalMs: 120,
    text: 'XAUUSD response with private user content',
    toolCalls: [{ name: 'get_price', args: { accountId: 'private' }, resultSummary: '{"price":2400}' }],
    agentProgress: [],
    metadata: { totalCostUsd: 0.012 },
    terminalStatus: 'complete',
    ok: true,
    assertions: [],
    ...overrides,
  };
}

describe('training export', () => {
  it('exports hashes and operational metadata without raw conversation content', () => {
    const [record] = buildTrainingRecords([result()], { datasetVersion: '2026-08-cases' });

    expect(record).toBeDefined();
    expect(record?.schemaVersion).toBe('kestrel.eval-record.v1');
    expect(record?.promptSha256).toHaveLength(64);
    expect(record?.assistantOutputSha256).toHaveLength(64);
    expect(record?.assistantText).toBeUndefined();
    expect(record?.toolNames).toEqual(['get_price']);
    expect(record?.costUsd).toBe(0.012);
    expect(record?.annotation.label).toBe('pass');
    expect(JSON.stringify(record)).not.toContain('Private user prompt');
    expect(JSON.stringify(record)).not.toContain('private user content');
    expect(JSON.stringify(record)).not.toContain('accountId');
  });

  it('requires explicit approval before including assistant text', () => {
    expect(() => buildTrainingRecords([result()], {
      datasetVersion: '2026-08-cases',
      includeAssistantText: true,
    })).toThrow('approvedBy is required');
  });

  it('includes sanitized text and reviewer annotation only after approval', () => {
    const [record] = buildTrainingRecords([result({ text: 'api_key=secret-value; reviewed answer' })], {
      datasetVersion: '2026-08-cases',
      includeAssistantText: true,
      approvedBy: 'reviewer-1',
      annotations: {
        'case-1': { label: 'pass', reviewerId: 'reviewer-1', issueCodes: [] },
      },
      now: new Date('2026-08-16T00:00:00.000Z'),
    });

    expect(record?.assistantText).toContain('<redacted>');
    expect(record?.assistantText).not.toContain('secret-value');
    expect(record?.annotation).toMatchObject({ label: 'pass', reviewerId: 'reviewer-1' });
    expect(record?.approval).toEqual({
      approvedBy: 'reviewer-1',
      approvedAt: '2026-08-16T00:00:00.000Z',
    });
  });

  it('requires reviewed labels for a governed training bundle', () => {
    expect(() => buildTrainingRecords([result()], {
      datasetVersion: '2026-08-cases',
      requireApprovedAnnotations: true,
      annotations: { 'case-1': { label: 'pass', reviewerId: 'reviewer-1' } },
    })).not.toThrow();
    expect(() => buildTrainingRecords([result({ assertions: [{ kind: 'unsafe_output', detail: 'bad' }] })], {
      datasetVersion: '2026-08-cases',
      requireApprovedAnnotations: true,
      annotations: { 'case-1': { label: 'needs_review', reviewerId: 'reviewer-1' } },
    })).toThrow('approved reviewer label');
  });

  it('builds a content-addressed manifest with label counts and provenance', () => {
    const records = buildTrainingRecords([result()], {
      datasetVersion: '2026-08-cases',
      source: 'offline-eval',
      provenance: { promptSet: 'cases.json' },
    });
    const manifest = buildDatasetManifest(records, {
      datasetVersion: '2026-08-cases',
      source: 'offline-eval',
      provenance: { promptSet: 'cases.json' },
    });

    expect(manifest.schemaVersion).toBe('kestrel.eval-manifest.v1');
    expect(manifest.recordCount).toBe(1);
    expect(manifest.contentSha256).toHaveLength(64);
    expect(manifest.labelCounts).toEqual({ pass: 1, fail: 0, needs_review: 0 });
    expect(manifest.splitCounts).toEqual({ train: 0, validation: 0, test: 0 });
    expect(manifest.provenance).toMatchObject({ promptSet: 'cases.json' });
  });

  it('requires explicit annotations and records deterministic dataset splits', () => {
    expect(() => buildTrainingRecords([result()], {
      datasetVersion: '2026-08-cases',
      requireApprovedAnnotations: true,
    })).toThrow('missing an explicit reviewer annotation');

    const [record] = buildTrainingRecords([result()], {
      datasetVersion: '2026-08-cases',
      annotations: { 'case-1': { label: 'pass', reviewerId: 'reviewer-1' } },
      splitByCaseId: () => 'validation',
    });
    const manifest = buildDatasetManifest(record ? [record] : [], {
      datasetVersion: '2026-08-cases',
      splitByCaseId: () => 'validation',
    });

    expect(record?.split).toBe('validation');
    expect(manifest.splitCounts).toEqual({ train: 0, validation: 1, test: 0 });
  });

  it('rejects approved assistant text containing PII after secret redaction', () => {
    expect(() => buildTrainingRecords([result({ text: 'Contact trader@example.com for the private answer.' })], {
      datasetVersion: '2026-08-cases',
      includeAssistantText: true,
      approvedBy: 'reviewer-1',
    })).toThrow('sensitive content (email)');
  });

  it('writes one JSONL record and a manifest sidecar per result', async () => {
    const directory = await mkdtemp(join(process.cwd(), '.test-training-export-'));
    const path = join(directory, 'records.jsonl');
    try {
      await writeTrainingExport(path, [result(), result({ id: 'case-2' })], {
        datasetVersion: '2026-08-cases',
      });
      const lines = (await readFile(path, 'utf8')).trim().split('\n');
      expect(lines).toHaveLength(2);
      expect(JSON.parse(lines[0]!).schemaVersion).toBe('kestrel.eval-record.v1');
      const manifest = JSON.parse(await readFile(`${path}.manifest.json`, 'utf8')) as { recordCount: number; contentSha256: string };
      expect(manifest.recordCount).toBe(2);
      expect(manifest.contentSha256).toHaveLength(64);
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });
});
