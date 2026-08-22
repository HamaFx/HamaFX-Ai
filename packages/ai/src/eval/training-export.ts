/**
 * Copyright 2026 Kestrel
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 */

/**
 * Vendor-neutral evaluation record export.
 *
 * The default record contains hashes, tool names, lifecycle outcomes, quality
 * labels, and operational metrics — never prompts, tool arguments, or model
 * output. Raw assistant text is only included when an operator explicitly
 * marks the export approved and supplies an approval identity.
 */

import { createHash } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';

import { redactString } from '../diagnostics/redact';
import type { PromptResult } from './runner';
import type { ScoreRecord } from '../mastra-v2/evals/scores';

export const TRAINING_RECORD_SCHEMA = 'kestrel.eval-record.v1' as const;
export const DATASET_MANIFEST_SCHEMA = 'kestrel.eval-manifest.v1' as const;

export type EvaluationLabel = 'pass' | 'fail' | 'needs_review';
export type DatasetSplit = 'train' | 'validation' | 'test';

export interface EvaluationAnnotation {
  label: EvaluationLabel;
  /** Stable reviewer identity; do not put email/PII here. */
  reviewerId?: string;
  issueCodes?: string[];
  note?: string;
}

export interface TrainingExportOptions {
  datasetVersion: string;
  /**
   * Live scorer records (from the Mastra `scores` domain) joined onto the
   * export by run id. Only numeric scores are stored — prompts/outputs stay
   * in the score domain, never duplicated here.
   */
  scoreRecords?: ReadonlyMap<string, ScoreRecord[]>;
  annotations?: Readonly<Record<string, EvaluationAnnotation>>;
  /** Include sanitized assistant text only for an explicitly approved export. */
  includeAssistantText?: boolean;
  approvedBy?: string;
  /** Refuse to write a training bundle unless every record has an explicit approved label. */
  requireApprovedAnnotations?: boolean;
  /** Deterministic split assignment for train/validation/test governance. */
  splitByCaseId?: (caseId: string) => DatasetSplit;
  /** Stable provenance fields stored in the sidecar manifest. */
  source?: string;
  provenance?: Readonly<Record<string, unknown>>;
  now?: Date;
}

export interface TrainingExportRecord {
  schemaVersion: typeof TRAINING_RECORD_SCHEMA;
  datasetVersion: string;
  caseId: string;
  createdAt: string;
  promptSha256: string;
  assistantOutputSha256: string;
  assistantText?: string;
  toolNames: string[];
  terminalStatus: string | null;
  transportOk: boolean;
  assertionKinds: string[];
  ttftMs: number | null;
  totalMs: number;
  costUsd: number | null;
  /** Live scorer scores joined from the Mastra `scores` domain, keyed by scorer id. */
  liveScores?: Record<string, number>;
  annotation: EvaluationAnnotation;
  split?: DatasetSplit;
  approval?: {
    approvedBy: string;
    approvedAt: string;
  };
}

export interface DatasetManifest {
  schemaVersion: typeof DATASET_MANIFEST_SCHEMA;
  datasetVersion: string;
  createdAt: string;
  recordCount: number;
  contentSha256: string;
  source: string;
  provenance: Record<string, unknown>;
  labelCounts: Record<EvaluationLabel, number>;
  splitCounts: Record<DatasetSplit, number>;
  approval?: {
    approvedBy: string;
    approvedAt: string;
  };
}

export function buildTrainingRecords(
  results: readonly PromptResult[],
  options: TrainingExportOptions,
): TrainingExportRecord[] {
  const includeAssistantText = options.includeAssistantText ?? false;
  if (includeAssistantText && !options.approvedBy?.trim()) {
    throw new Error('approvedBy is required when including assistant text in a training export');
  }

  const now = (options.now ?? new Date()).toISOString();
  const records = results.map((result) => {
    const explicitAnnotation = options.annotations?.[result.id];
    const annotation = explicitAnnotation ?? {
      label: result.ok && (result.assertions?.length ?? 0) === 0 ? 'pass' : 'needs_review',
    };
    if (options.requireApprovedAnnotations && !explicitAnnotation) {
      throw new Error(`Record ${result.id} is missing an explicit reviewer annotation`);
    }
    const scoreRecords = options.scoreRecords?.get(result.id) ?? [];
    const liveScores: Record<string, number> = {};
    for (const score of scoreRecords) {
      // Last score per scorer id wins; records are ordered by creation time.
      liveScores[score.scorerId] = score.score;
    }

    const record: TrainingExportRecord = {
      schemaVersion: TRAINING_RECORD_SCHEMA,
      datasetVersion: options.datasetVersion,
      caseId: result.id,
      createdAt: now,
      promptSha256: sha256(result.prompt),
      assistantOutputSha256: sha256(result.text),
      toolNames: [...new Set(result.toolCalls.map((toolCall) => toolCall.name))],
      terminalStatus: result.terminalStatus,
      transportOk: result.ok,
      assertionKinds: [...new Set((result.assertions ?? []).map((assertion) => assertion.kind))],
      ttftMs: result.ttftMs,
      totalMs: result.totalMs,
      costUsd: result.metadata.totalCostUsd ?? null,
      ...(Object.keys(liveScores).length > 0 ? { liveScores } : {}),
      annotation,
      ...(options.splitByCaseId ? { split: options.splitByCaseId(result.id) } : {}),
    };

    if (includeAssistantText) {
      const sanitizedText = redactString(result.text);
      const sensitiveMatch = findSensitiveTrainingContent(sanitizedText);
      if (sensitiveMatch) {
        throw new Error(`Assistant text contains sensitive content (${sensitiveMatch})`);
      }
      record.assistantText = sanitizedText;
      record.approval = {
        approvedBy: options.approvedBy!.trim(),
        approvedAt: now,
      };
    }
    return record;
  });

  if (options.requireApprovedAnnotations && records.some((record) => record.annotation.label === 'needs_review')) {
    throw new Error('Every record must have an approved reviewer label before export');
  }
  return records;
}

export function buildDatasetManifest(
  records: readonly TrainingExportRecord[],
  options: TrainingExportOptions,
  jsonlContent?: string,
): DatasetManifest {
  const now = (options.now ?? new Date()).toISOString();
  const content = jsonlContent ?? `${records.map((record) => JSON.stringify(record)).join('\n')}\n`;
  const labelCounts: Record<EvaluationLabel, number> = { pass: 0, fail: 0, needs_review: 0 };
  const splitCounts: Record<DatasetSplit, number> = { train: 0, validation: 0, test: 0 };
  for (const record of records) {
    labelCounts[record.annotation.label] += 1;
    if (record.split) splitCounts[record.split] += 1;
  }

  const manifest: DatasetManifest = {
    schemaVersion: DATASET_MANIFEST_SCHEMA,
    datasetVersion: options.datasetVersion,
    createdAt: now,
    recordCount: records.length,
    contentSha256: sha256(content),
    source: options.source ?? 'eval-runner',
    provenance: {
      generator: 'kestrel.eval.training-export',
      ...options.provenance,
    },
    labelCounts,
    splitCounts,
  };
  if (options.approvedBy?.trim()) {
    manifest.approval = { approvedBy: options.approvedBy.trim(), approvedAt: now };
  }
  return manifest;
}

export async function writeTrainingExport(
  path: string,
  results: readonly PromptResult[],
  options: TrainingExportOptions,
): Promise<DatasetManifest> {
  const records = buildTrainingRecords(results, options);
  const jsonlContent = `${records.map((record) => JSON.stringify(record)).join('\n')}\n`;
  const manifest = buildDatasetManifest(records, options, jsonlContent);
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, jsonlContent, 'utf8');
  await writeFile(`${path}.manifest.json`, `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');
  return manifest;
}

function sha256(value: string): string {
  return createHash('sha256').update(value, 'utf8').digest('hex');
}

/** Return a category rather than the matched value so secrets never enter errors/logs. */
function findSensitiveTrainingContent(value: string): 'email' | 'phone' | 'credential' | null {
  if (/\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/i.test(value)) return 'email';
  if (/(?:\+?\d[\d\s().-]{8,}\d)/.test(value)) return 'phone';
  if (/(?:api[_ -]?key|access[_ -]?token|bearer)\s*[:=]\s*(?!<redacted>)(?:\S+)/i.test(value)) return 'credential';
  return null;
}
