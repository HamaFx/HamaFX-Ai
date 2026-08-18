// SPDX-License-Identifier: Apache-2.0

// Manual (admin-triggered) training-dataset export.
//
// Assembles a governed dataset from reviewer-approved feedback rows right
// here on the web side (serverless): the nightly *worker* job additionally
// folds in eval reports and writes/upload the JSONL files. Both paths share
// the same assembly + registration pipeline in @kestrel/ai and @kestrel/db.

import { withAdminAuth } from '@/lib/admin-auth';
import { errorResponse } from '@/lib/api';
import { recordAdminAudit } from '@/lib/services/admin';
import { registerEvalDataset } from '@/lib/services/api-boundary';
import {
  assembleTrainingDataset,
  listReviewedTrainingPairs,
  resolveEvaluationAnnotations,
  type FeedbackAnnotationInput,
  type PromptResult,
} from '@/lib/services/api-boundary';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function utcStamp(d: Date): string {
  // manual-2026-08-17-22-45 — safe for version regex + filenames.
  return d.toISOString().slice(0, 16).replace(/[-:]/g, '-').replace('T', '-');
}

export const POST = withAdminAuth(async (req, { user }) => {
  try {
    const pairs = await listReviewedTrainingPairs({ limit: 500 });

    // Feedback rows become results whose annotation comes from the reviewer
    // label (resolution priority 1 — the resolver keys by message id).
    const feedbackByMessageId = new Map<string, FeedbackAnnotationInput>();
    for (const pair of pairs) {
      feedbackByMessageId.set(pair.messageId, {
        rating: pair.rating,
        reviewStatus: 'reviewed',
        reviewerLabel: pair.reviewerLabel,
        issueCodes: pair.issueCodes,
        reviewerNote: pair.reviewerNote,
        userNote: pair.userNote,
      });
    }
    const results: PromptResult[] = pairs.map((pair) => ({
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

    // Keep only reviewer-approved records; the assembler refuses needs_review.
    const annotations = resolveEvaluationAnnotations({ results, feedbackByMessageId });
    const approved = results.filter((result) => {
      const label = annotations[result.id]?.label;
      return label === 'pass' || label === 'fail';
    });

    if (approved.length === 0) {
      return Response.json({
        error: { code: 'NO_APPROVED_RECORDS', message: 'No reviewer-approved feedback to export yet' },
      }, { status: 409 });
    }

    const version = `manual-${utcStamp(new Date())}`;
    const assembled = assembleTrainingDataset({
      results: approved,
      feedbackByMessageId,
      datasetVersion: version,
      requireApprovedAnnotations: true,
      // Privacy posture: hashes only; raw text exports need explicit approval.
      source: 'admin:manual-export',
      provenance: {
        generator: 'kestrel.admin.manual-export',
        feedbackPairs: pairs.length,
        approvedRecords: approved.length,
        droppedNeedsReview: results.length - approved.length,
      },
    });

    const row = await registerEvalDataset({
      version,
      contentSha256: assembled.manifest.contentSha256,
      recordCount: assembled.manifest.recordCount,
      source: assembled.manifest.source,
      provenance: assembled.manifest.provenance,
      createdBy: user.userId,
    });
    if (!row) {
      return Response.json({ error: { code: 'CONFLICT', message: 'A dataset with this version already exists' } }, { status: 409 });
    }

    await recordAdminAudit(user.userId, 'ai.dataset.export', undefined, {
      version: row.version,
      recordCount: row.recordCount,
      contentSha256: row.contentSha256,
    });

    return Response.json({
      dataset: row,
      droppedNeedsReview: results.length - approved.length,
    }, { status: 201 });
  } catch (error) {
    return errorResponse(error, req);
  }
});
