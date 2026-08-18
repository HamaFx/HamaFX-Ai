/**
 * Copyright 2026 Kestrel
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 */

// Nightly governed training-dataset export.
//
// Pipeline: latest eval JSON reports (from the nightly eval wrapper) +
// reviewer-approved feedback rows → resolve annotations → assemble the
// governed dataset (hashes by default; raw text only when an operator
// explicitly approves a text export) → write JSONL + manifest to
// DATASETS_DIR/<version>/ → register the content-addressed version in
// `eval_datasets` → upload to Backblaze B2 via rclone when configured.
//
// Fail-open design: every external step (eval reports missing, B2 not
// configured, rclone absent) logs a warning and continues — the local
// JSONL + DB registration are the source of truth; B2 is a replica.

import { execFile } from 'node:child_process';
import { readFile, readdir, mkdir, stat, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { promisify } from 'node:util';

import { eq } from 'drizzle-orm';

import {
  assembleTrainingDataset,
  getDb,
  publishTrainingDatasetToLangfuse,
  resolveEvaluationAnnotations,
  type FeedbackAnnotationInput,
  type PromptResult,
} from '@kestrel/ai';
import { listReviewedTrainingPairs, registerEvalDataset, schema } from '@kestrel/db';

import type { JobContext, JobResult } from './types.js';

const execFileAsync = promisify(execFile);

interface EvalReport {
  path: string;
  results: PromptResult[];
}

/** Days of eval reports to fold into one nightly snapshot. */
const MAX_REPORTS = 7;

/** Where nightly exports land. Overridable for tests / local dev. */
const DEFAULT_DATASETS_DIR = '/opt/kestrel/datasets';
/** Where the nightly eval wrapper (scripts/run-eval-nightly.mjs) writes reports. */
const DEFAULT_EVAL_REPORTS_DIR = '/opt/kestrel/datasets/eval-reports';

function utcStamp(d: Date): string {
  return d.toISOString().slice(0, 10); // YYYY-MM-DD
}

/** Load the newest JSON eval reports; a missing dir is not an error. */
async function loadLatestEvalReports(
  dir: string,
  count: number,
): Promise<EvalReport[]> {
  let entries: string[];
  try {
    entries = await readdir(dir);
  } catch {
    return []; // no reports yet — feedback-only export is still valid
  }

  const candidates = await Promise.all(
    entries
      .filter((name) => name.endsWith('.json'))
      .map(async (name) => {
        const path = join(dir, name);
        try {
          const info = await stat(path);
          return { path, mtimeMs: info.mtimeMs };
        } catch {
          return null;
        }
      }),
  );

  const reports: EvalReport[] = [];
  for (const entry of candidates
    .filter((e): e is NonNullable<typeof e> => e !== null)
    .sort((a, b) => b.mtimeMs - a.mtimeMs)
    .slice(0, count)) {
    try {
      const raw = await readFile(entry.path, 'utf8');
      const parsed = JSON.parse(raw) as { results?: PromptResult[] };
      if (Array.isArray(parsed.results) && parsed.results.length > 0) {
        reports.push({ path: entry.path, results: parsed.results });
      }
    } catch {
      // Skip malformed reports; never fail the whole export for one file.
    }
  }
  return reports;
}

/** Upload a directory to `kestrel:<bucket>/datasets/<version>` with rclone (in-memory remote). */
async function uploadToB2(sourceDir: string, version: string): Promise<void> {
  const bucket = process.env.B2_BUCKET ?? '';
  const keyId = process.env.B2_KEY_ID ?? '';
  const appKey = process.env.B2_APPLICATION_KEY ?? '';
  if (!bucket || !keyId || !appKey) {
    throw new Error('B2 env (B2_BUCKET/B2_KEY_ID/B2_APPLICATION_KEY) not configured');
  }
  await execFileAsync('rclone', ['copyto', join(sourceDir, version), `kestrel:${bucket}/datasets/${version}`], {
    env: {
      ...process.env,
      RCLONE_CONFIG_KESTREL_TYPE: 'b2',
      RCLONE_CONFIG_KESTREL_ACCOUNT: keyId,
      RCLONE_CONFIG_KESTREL_KEY: appKey,
    },
    timeout: 120_000,
  });
}

export async function runDatasetExport(ctx: JobContext): Promise<JobResult> {
  const log = ctx.log;
  const datasetsDir = process.env.DATASETS_DIR ?? DEFAULT_DATASETS_DIR;
  const reportsDir = process.env.EVAL_REPORTS_DIR ?? DEFAULT_EVAL_REPORTS_DIR;
  const version = `nightly-${utcStamp(new Date())}`;

  // 1 — Eval reports (best-effort; a fresh install may have none yet).
  let reportFiles = 0;
  let evalResults: PromptResult[] = [];
  try {
    const reports = await loadLatestEvalReports(reportsDir, MAX_REPORTS);
    reportFiles = reports.length;
    evalResults = reports.flatMap((report) => report.results);
  } catch (err) {
    log.warn('eval report load failed — continuing with feedback only', { err: String(err) });
  }

  // 2 — Reviewer-approved feedback, joined to prompt + answer text.
  const pairs = await listReviewedTrainingPairs({ limit: 1000 });

  // 3 — Link eval cases to feedback rows (via the assistant message id the
  // eval runner now records) and synthesize feedback-only results so real
  // user traffic can enter the dataset even without an eval run.
  const feedbackByMessageId = new Map<string, FeedbackAnnotationInput>();
  for (const pair of pairs) {
    feedbackByMessageId.set(pair.messageId, {
      rating: pair.rating,
      reviewStatus: 'reviewed',
      reviewerLabel: pair.reviewerLabel,
      issueCodes: pair.issueCodes,
      reviewerNote: pair.reviewerNote,
    });
  }
  const caseToMessageId: Record<string, string> = {};
  for (const result of evalResults) {
    if (result.assistantMessageId) caseToMessageId[result.id] = result.assistantMessageId;
  }
  const feedbackResults: PromptResult[] = pairs.map((pair) => ({
    id: pair.messageId,
    prompt: pair.prompt,
    ttftMs: null,
    totalMs: 0,
    text: pair.assistantText,
    toolCalls: [],
    agentProgress: [],
    metadata: {},
    terminalStatus: null,
    ok: true,
  }));
  const allResults = [...evalResults, ...feedbackResults];
  if (allResults.length === 0) {
    return { processed: 0, note: 'nothing to export: no eval reports and no reviewer-approved feedback' };
  }

  // 4 — Resolve annotations and keep only approved labels (the assembler
  //    refuses `needs_review` records, so filter before it runs).
  const annotations = resolveEvaluationAnnotations({
    results: allResults,
    feedbackByMessageId,
    caseToMessageId,
  });
  const approved = allResults.filter((result) => {
    const label = annotations[result.id]?.label;
    return label === 'pass' || label === 'fail';
  });
  if (approved.length === 0) {
    return { processed: 0, note: 'no reviewer-approved records (all pending review)' };
  }

  // 5 — Assemble + persist JSONL + manifest.
  const assembled = assembleTrainingDataset({
    results: approved,
    feedbackByMessageId,
    caseToMessageId,
    datasetVersion: version,
    requireApprovedAnnotations: true,
    // Privacy posture: hashes only. Raw assistant text exports require an
    // operator-approved export with `includeAssistantText` + `approvedBy`.
    source: 'worker:dataset-export',
    provenance: {
      generator: 'kestrel.worker.dataset-export',
      evalReportFiles: reportFiles,
      evalCases: evalResults.length,
      feedbackPairs: pairs.length,
      approvedRecords: approved.length,
    },
  });

  const outDir = join(datasetsDir, version);
  await mkdir(outDir, { recursive: true });
  await writeFile(join(outDir, 'dataset.jsonl'), assembled.jsonlContent, 'utf8');
  await writeFile(join(outDir, 'manifest.json'), `${JSON.stringify(assembled.manifest, null, 2)}\n`, 'utf8');

  // 6 — Register the content-addressed version (needs a real users.id).
  let registered = false;
  try {
    const [admin] = await getDb()
      .select({ id: schema.users.id })
      .from(schema.users)
      .where(eq(schema.users.role, 'admin'))
      .limit(1);
    if (admin) {
      const row = await registerEvalDataset({
        version,
        contentSha256: assembled.manifest.contentSha256,
        recordCount: assembled.manifest.recordCount,
        source: assembled.manifest.source,
        provenance: assembled.manifest.provenance,
        createdBy: admin.id,
      });
      registered = row !== null;
    }
  } catch (err) {
    log.warn('eval_datasets registration failed (non-fatal)', { err: String(err) });
  }

  // 7 — B2 replica (fail-open: skips until the operator configures rclone).
  let b2Uploaded = false;
  try {
    await uploadToB2(datasetsDir, version);
    b2Uploaded = true;
  } catch (err) {
    log.warn('B2 upload skipped or failed (dataset stays local)', { err: String(err) });
  }

  // 8 — Langfuse dataset publish (fail-open: disabled without LANGFUSE_* env).
  // Uses a stable dataset name — Langfuse versions items on every add, so a
  // nightly publish appends a new dataset version rather than replacing one.
  let langfuseStatus = 'skipped';
  try {
    const publishResult = await publishTrainingDatasetToLangfuse(assembled, {
      datasetName: 'kestrel-training',
      description: `Governed eval training records — ${version}`,
    });
    langfuseStatus = publishResult.status;
  } catch (err) {
    langfuseStatus = 'failed';
    log.warn('Langfuse dataset publish skipped or failed (dataset stays local)', { err: String(err) });
  }

  return {
    processed: assembled.manifest.recordCount,
    note:
      `version=${version} records=${assembled.manifest.recordCount} ` +
      `evalReports=${reportFiles} evalCases=${evalResults.length} ` +
      `feedback=${pairs.length} registered=${registered} b2=${b2Uploaded} ` +
      `langfuse=${langfuseStatus}`,
  };
}