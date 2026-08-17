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

/**
 * Dataset assembly — resolves annotations, builds governed training records,
 * and produces the JSONL + sidecar manifest. Storage-agnostic: callers write
 * the returned JSONL to the local datasets dir, Backblaze B2, Langfuse, etc.
 */

import { mkdir, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';

import {
  buildDatasetManifest,
  buildTrainingRecords,
  type DatasetManifest,
  type DatasetSplit,
  type TrainingExportOptions,
  type TrainingExportRecord,
} from './training-export';
import type { PromptResult } from './runner';
import {
  resolveEvaluationAnnotations,
  type FeedbackAnnotationInput,
} from './annotation-resolver';

export interface AssembleDatasetInput {
  results: readonly PromptResult[];
  datasetVersion: string;
  /** Feedback rows keyed by assistant message id. */
  feedbackByMessageId?: Readonly<Map<string, FeedbackAnnotationInput>>;
  /** Optional eval-case-id → assistant-message-id linkage. */
  caseToMessageId?: Readonly<Record<string, string>>;
  /** Require every record to carry an approved (non-`needs_review`) label. */
  requireApprovedAnnotations?: boolean;
  /** Include sanitized assistant text only for an explicitly approved export. */
  includeAssistantText?: boolean;
  approvedBy?: string;
  /** Deterministic train/validation/test split assignment. */
  splitByCaseId?: (caseId: string) => DatasetSplit;
  source?: string;
  provenance?: Readonly<Record<string, unknown>>;
  now?: Date;
}

export interface AssembledDataset {
  records: TrainingExportRecord[];
  manifest: DatasetManifest;
  jsonlContent: string;
}

/**
 * Build the governed dataset. Does not touch disk or any external store; the
 * caller decides where `jsonlContent` and the manifest are written.
 */
export function assembleTrainingDataset(input: AssembleDatasetInput): AssembledDataset {
  const annotations = resolveEvaluationAnnotations({
    results: input.results,
    ...(input.feedbackByMessageId ? { feedbackByMessageId: input.feedbackByMessageId } : {}),
    ...(input.caseToMessageId ? { caseToMessageId: input.caseToMessageId } : {}),
  });

  const options: TrainingExportOptions = {
    datasetVersion: input.datasetVersion,
    annotations,
    requireApprovedAnnotations: input.requireApprovedAnnotations ?? true,
    ...(input.includeAssistantText !== undefined ? { includeAssistantText: input.includeAssistantText } : {}),
    ...(input.approvedBy ? { approvedBy: input.approvedBy } : {}),
    ...(input.splitByCaseId ? { splitByCaseId: input.splitByCaseId } : {}),
    ...(input.source ? { source: input.source } : {}),
    ...(input.provenance ? { provenance: input.provenance } : {}),
    ...(input.now ? { now: input.now } : {}),
  };

  const records = buildTrainingRecords(input.results, options);
  const jsonlContent = `${records.map((record) => JSON.stringify(record)).join('\n')}\n`;
  const manifest = buildDatasetManifest(records, options, jsonlContent);

  return { records, manifest, jsonlContent };
}

/**
 * Assemble and write the JSONL + sidecar manifest to `path`. The manifest is
 * written to `${path}.manifest.json`, matching `writeTrainingExport`.
 */
export async function writeAssembledDataset(
  path: string,
  input: AssembleDatasetInput,
): Promise<DatasetManifest> {
  const { manifest, jsonlContent } = assembleTrainingDataset(input);
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, jsonlContent, 'utf8');
  await writeFile(`${path}.manifest.json`, `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');
  return manifest;
}
