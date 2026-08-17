import { describe, expect, it } from 'vitest';

import {
  resolveEvaluationAnnotations,
  type FeedbackAnnotationInput,
} from '../src/eval/annotation-resolver';
import { assembleTrainingDataset } from '../src/eval/assemble-dataset';
import type { PromptResult } from '../src/eval/runner';

function result(overrides: Partial<PromptResult> = {}): PromptResult {
  return {
    id: 'case-1',
    prompt: 'what is the current XAUUSD structure?',
    ttftMs: 42,
    totalMs: 120,
    text: 'XAUUSD is ranging near 2400.',
    toolCalls: [{ name: 'get_price', args: {}, resultSummary: '{"price":2400}' }],
    agentProgress: [],
    metadata: {},
    terminalStatus: 'complete',
    ok: true,
    assertions: [],
    ...overrides,
  };
}

function feedback(overrides: Partial<FeedbackAnnotationInput> = {}): FeedbackAnnotationInput {
  return {
    rating: 'positive',
    reviewStatus: 'unreviewed',
    reviewerLabel: null,
    reviewerId: null,
    issueCodes: null,
    reviewerNote: null,
    ...overrides,
  };
}

describe('resolveEvaluationAnnotations', () => {
  it('prefers an explicit reviewer label (authoritative)', () => {
    const annotations = resolveEvaluationAnnotations({
      results: [result()],
      feedbackByMessageId: new Map([
        ['msg-1', feedback({
          reviewStatus: 'reviewed',
          reviewerLabel: 'fail',
          reviewerId: 'reviewer-1',
          issueCodes: ['unsafe_output'],
          reviewerNote: 'cited an unsupported price',
        })],
      ]),
      caseToMessageId: { 'case-1': 'msg-1' },
    });

    expect(annotations['case-1']).toEqual({
      label: 'fail',
      reviewerId: 'reviewer-1',
      issueCodes: ['unsafe_output'],
      note: 'cited an unsupported price',
    });
  });

  it('maps a user rating to needs_review — never auto pass or fail', () => {
    for (const rating of ['positive', 'negative'] as const) {
      const annotations = resolveEvaluationAnnotations({
        results: [result()],
        feedbackByMessageId: new Map([['msg-1', feedback({ rating })]]),
        caseToMessageId: { 'case-1': 'msg-1' },
      });
      expect(annotations['case-1']?.label).toBe('needs_review');
      expect(annotations['case-1']?.note).toContain('awaiting review');
    }
  });

  it('treats rejected feedback as no feedback and falls back to the eval outcome', () => {
    const annotations = resolveEvaluationAnnotations({
      results: [result({ ok: true, assertions: [] })],
      feedbackByMessageId: new Map([['msg-1', feedback({ reviewStatus: 'rejected', rating: 'negative' })]]),
      caseToMessageId: { 'case-1': 'msg-1' },
    });
    expect(annotations['case-1']).toEqual({ label: 'pass' });
  });

  it('falls back to pass only when transport ok and no assertions failed', () => {
    expect(resolveEvaluationAnnotations({
      results: [result({ ok: true, assertions: [] })],
    })['case-1']).toEqual({ label: 'pass' });

    expect(resolveEvaluationAnnotations({
      results: [result({ ok: true, assertions: [{ kind: 'missing_tool', detail: 'get_price' }] })],
    })['case-1']).toEqual({ label: 'needs_review' });

    expect(resolveEvaluationAnnotations({
      results: [result({ ok: false, error: 'boom' })],
    })['case-1']).toEqual({ label: 'needs_review' });
  });

  it('leaves unlinked cases to the eval fallback', () => {
    const annotations = resolveEvaluationAnnotations({
      results: [result({ ok: false, error: 'boom' }), result({ id: 'case-2', ok: true, assertions: [] })],
      feedbackByMessageId: new Map([['msg-1', feedback({ reviewStatus: 'reviewed', reviewerLabel: 'pass' })]]),
      caseToMessageId: {}, // nothing linked
    });
    expect(annotations['case-1']).toEqual({ label: 'needs_review' });
    expect(annotations['case-2']).toEqual({ label: 'pass' });
  });

  it('resolves feedback by identity when the case id is the message id (feedback-only exports)', () => {
    const annotations = resolveEvaluationAnnotations({
      results: [result({ id: 'msg-9', ok: true, assertions: [] })],
      feedbackByMessageId: new Map([
        ['msg-9', feedback({ reviewStatus: 'reviewed', reviewerLabel: 'fail', issueCodes: ['wrong-price'] })],
      ]),
      // No caseToMessageId — the feedback-only export path relies on identity.
    });
    expect(annotations['msg-9']).toEqual({
      label: 'fail',
      issueCodes: ['wrong-price'],
    });
  });
});

describe('assembleTrainingDataset', () => {
  it('builds governed records and a manifest from resolved annotations', () => {
    const assembled = assembleTrainingDataset({
      results: [result()],
      datasetVersion: '2026-08-cases',
      feedbackByMessageId: new Map([
        ['msg-1', feedback({ reviewStatus: 'reviewed', reviewerLabel: 'pass', reviewerId: 'r1' })],
      ]),
      caseToMessageId: { 'case-1': 'msg-1' },
      source: 'offline-eval',
    });

    expect(assembled.records).toHaveLength(1);
    expect(assembled.records[0]?.annotation.label).toBe('pass');
    expect(assembled.manifest.recordCount).toBe(1);
    expect(assembled.manifest.labelCounts).toEqual({ pass: 1, fail: 0, needs_review: 0 });
    expect(assembled.jsonlContent.trim().split('\n')).toHaveLength(1);
  });

  it('refuses to assemble a dataset when a record still needs review', () => {
    expect(() => assembleTrainingDataset({
      results: [result()],
      datasetVersion: '2026-08-cases',
      feedbackByMessageId: new Map([['msg-1', feedback({ rating: 'negative' })]]),
      caseToMessageId: { 'case-1': 'msg-1' },
      requireApprovedAnnotations: true,
    })).toThrow('approved reviewer label');
  });

  it('never includes raw prompt or answer text in the default export', () => {
    const assembled = assembleTrainingDataset({
      results: [result({ prompt: 'secret prompt', text: 'secret answer' })],
      datasetVersion: '2026-08-cases',
    });
    expect(assembled.jsonlContent).not.toContain('secret prompt');
    expect(assembled.jsonlContent).not.toContain('secret answer');
  });
});
