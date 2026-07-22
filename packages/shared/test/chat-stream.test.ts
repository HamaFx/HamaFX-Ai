// SPDX-License-Identifier: Apache-2.0

import { describe, expect, it } from 'vitest';
import {
  AnalysisQueuedEventSchema,
  ChatStreamEventSchema,
} from '../src/schemas/chat-stream';

describe('ChatStreamEventSchema', () => {
  it('parses a text-start event', () => {
    const result = ChatStreamEventSchema.safeParse({ type: 'text-start', id: 'msg-1' });
    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.data.type).toBe('text-start');
    expect(result.data.id).toBe('msg-1');
  });

  it('parses a text-delta event', () => {
    const result = ChatStreamEventSchema.safeParse({
      type: 'text-delta',
      id: 'msg-1',
      delta: 'hello',
    });
    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.data.type).toBe('text-delta');
    expect(result.data.delta).toBe('hello');
  });

  it('parses a data-agent-progress event without an id', () => {
    const result = ChatStreamEventSchema.safeParse({
      type: 'data-agent-progress',
      data: { agents: [{ agentName: 'technical', status: 'running' }], mode: 'quick' },
    });
    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.data.type).toBe('data-agent-progress');
  });

  it('rejects unknown event types', () => {
    const result = ChatStreamEventSchema.safeParse({ type: 'unknown', id: 'x' });
    expect(result.success).toBe(false);
  });
});

describe('AnalysisQueuedEventSchema', () => {
  it('parses the analysis-queued envelope', () => {
    const result = AnalysisQueuedEventSchema.safeParse({
      type: 'analysis-queued',
      jobId: 'job-123',
      status: 'queued',
    });
    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.data.jobId).toBe('job-123');
  });
});
