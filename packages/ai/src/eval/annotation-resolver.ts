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
 * Annotation resolver — the merge point that "closes the training loop".
 *
 * Turns eval results + real user feedback into per-case `EvaluationAnnotation`s
 * that `training-export.ts` can consume. Resolution order (authoritative first):
 *
 *   1. A reviewer's explicit label + issue codes (only when the review was
 *      completed, not rejected).
 *   2. A user rating is a *hint only*: it can never promote a record to
 *      `pass` or demote it to `fail` by itself — it maps to `needs_review`.
 *   3. Fallback: the eval assertion outcome (pass when transport ok and no
 *      assertions failed, otherwise `needs_review`).
 *
 * `buildTrainingRecords(..., { requireApprovedAnnotations: true })` then
 * refuses any record still labelled `needs_review`, so only reviewer-approved
 * (or cleanly passing) records can ever be exported.
 */

import type { EvaluationAnnotation } from './training-export';
import type { PromptResult } from './runner';

/** Structural subset of `ai_message_feedback` rows the resolver needs. */
export interface FeedbackAnnotationInput {
  rating: 'positive' | 'negative';
  reviewStatus: 'unreviewed' | 'in_review' | 'reviewed' | 'rejected';
  reviewerLabel?: 'pass' | 'fail' | 'needs_review' | null;
  reviewerId?: string | null;
  issueCodes?: string[] | null;
  reviewerNote?: string | null;
}

export interface ResolveAnnotationsInput {
  results: readonly PromptResult[];
  /** Feedback rows keyed by assistant message id. */
  feedbackByMessageId?: Readonly<Map<string, FeedbackAnnotationInput>>;
  /** Optional eval-case-id → assistant-message-id linkage. */
  caseToMessageId?: Readonly<Record<string, string>>;
}

/**
 * Resolve an `EvaluationAnnotation` for every eval case. The returned map is
 * keyed by eval case id and can be passed straight into
 * `buildTrainingRecords`'s `annotations` option.
 */
export function resolveEvaluationAnnotations(
  input: ResolveAnnotationsInput,
): Record<string, EvaluationAnnotation> {
  const { results, feedbackByMessageId, caseToMessageId } = input;
  const annotations: Record<string, EvaluationAnnotation> = {};

  for (const result of results) {
    // A case resolves to feedback via the explicit linkage map — or, when the
    // case id *is* the assistant message id (feedback-only results built from
    // `listReviewedTrainingPairs`), by identity.
    const linkedMessageId = caseToMessageId?.[result.id];
    const messageId = feedbackByMessageId?.has(result.id) ? result.id : linkedMessageId;
    const feedback = messageId ? feedbackByMessageId?.get(messageId) : undefined;
    annotations[result.id] = resolveOne(result, feedback);
  }

  return annotations;
}

function resolveOne(
  result: PromptResult,
  feedback: FeedbackAnnotationInput | undefined,
): EvaluationAnnotation {
  if (!feedback) return evalFallback(result);

  // A reviewer explicitly rejected this feedback — it contributes nothing, so
  // fall through to the eval outcome rather than forcing the record into review.
  if (feedback.reviewStatus === 'rejected') return evalFallback(result);

  if (feedback.reviewerLabel) {
    return {
      label: feedback.reviewerLabel,
      ...(feedback.reviewerId ? { reviewerId: feedback.reviewerId } : {}),
      ...(feedback.issueCodes?.length ? { issueCodes: feedback.issueCodes } : {}),
      ...(feedback.reviewerNote ? { note: feedback.reviewerNote } : {}),
    };
  }

  // A user rating without a reviewer decision is only a hint. Per the locked
  // operator decision, it flags the record for review — never auto-pass/fail.
  return {
    label: 'needs_review',
    note: `user ${feedback.rating} feedback awaiting review`,
  };
}

function evalFallback(result: PromptResult): EvaluationAnnotation {
  const assertions = result.assertions?.length ?? 0;
  return result.ok && assertions === 0 ? { label: 'pass' } : { label: 'needs_review' };
}
