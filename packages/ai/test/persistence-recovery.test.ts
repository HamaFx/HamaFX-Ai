import { beforeEach, describe, expect, it, vi } from 'vitest';

const {
  mockDbExecute,
  mockTxExecute,
  mockRecordTelemetry,
  mockRecordToolTelemetry,
  mockAppendUserMessage,
  mockAppendAssistantMessage,
  mockSaveAgentOpinions,
  mockPersistTraceStrict,
} = vi.hoisted(() => ({
  mockDbExecute: vi.fn(),
  mockTxExecute: vi.fn(),
  mockRecordTelemetry: vi.fn(),
  mockRecordToolTelemetry: vi.fn(),
  mockAppendUserMessage: vi.fn(),
  mockAppendAssistantMessage: vi.fn(),
  mockSaveAgentOpinions: vi.fn(),
  mockPersistTraceStrict: vi.fn(),
}));

const mockDb = {
  execute: mockDbExecute,
  transaction: (callback: (tx: { execute: typeof mockTxExecute }) => Promise<unknown>) =>
    callback({ execute: mockTxExecute }),
};

vi.mock('../src/db', () => ({ getDb: () => mockDb }));
vi.mock('../src/persistence/telemetry-persistence', () => ({
  recordTelemetry: mockRecordTelemetry,
  recordToolTelemetry: mockRecordToolTelemetry,
}));
vi.mock('../src/persistence/message-persistence', () => ({
  appendUserMessage: mockAppendUserMessage,
  appendAssistantMessage: mockAppendAssistantMessage,
}));
vi.mock('../src/multi-agent/persistence', () => ({
  saveAgentOpinions: mockSaveAgentOpinions,
}));
vi.mock('../src/diagnostics/trace-persistence', () => ({
  persistTraceStrict: mockPersistTraceStrict,
}));

import { replayPersistenceFailures } from '../src/persistence-recovery';

describe('persistence outbox replay', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockRecordTelemetry.mockResolvedValue(undefined);
    mockRecordToolTelemetry.mockResolvedValue(true);
    mockAppendUserMessage.mockResolvedValue(undefined);
    mockAppendAssistantMessage.mockResolvedValue({ messageId: 'db-message-1' });
    mockSaveAgentOpinions.mockResolvedValue(undefined);
    mockPersistTraceStrict.mockResolvedValue(undefined);
    mockDbExecute.mockResolvedValue({ rows: [] });
  });

  it('claims, dispatches, and completes a telemetry replay', async () => {
    mockTxExecute
      .mockResolvedValueOnce({
        rows: [{
          id: 'outbox-1',
          operation: 'telemetry.turn',
          payload: {
            userId: 'user-1',
            threadId: 'thread-1',
            messageId: null,
            idempotencyKey: 'telemetry.turn:1',
            model: 'test/model',
            inputTokens: 3,
            outputTokens: 2,
            toolCalls: 0,
            ms: 10,
          },
          attempt_count: 0,
          max_attempts: 8,
        }],
      })
      .mockResolvedValueOnce({ rows: [{ id: 'outbox-1' }] });

    const result = await replayPersistenceFailures(1);

    expect(mockRecordTelemetry).toHaveBeenCalledWith(expect.objectContaining({
      userId: 'user-1',
      idempotencyKey: 'telemetry.turn:1',
    }));
    expect(mockDbExecute).toHaveBeenCalled();
    expect(result).toEqual({ claimed: 1, completed: 1, failed: 0, dead: 0 });
  });

  it('replays messages using their stable idempotency key', async () => {
    mockTxExecute
      .mockResolvedValueOnce({
        rows: [{
          id: 'outbox-message',
          operation: 'message.assistant',
          payload: {
            userId: 'user-1',
            threadId: 'thread-1',
            idempotencyKey: 'ui:assistant-1',
            message: {
              id: 'assistant-1',
              role: 'assistant',
              parts: [{ type: 'text', text: 'replayed' }],
            },
            messageId: 'assistant-1',
          },
          attempt_count: 0,
          max_attempts: 8,
        }],
      })
      .mockResolvedValueOnce({ rows: [{ id: 'outbox-message' }] });

    await replayPersistenceFailures(1);

    expect(mockAppendAssistantMessage).toHaveBeenCalledWith(
      'user-1',
      'thread-1',
      expect.objectContaining({ id: 'assistant-1', role: 'assistant' }),
      { idempotencyKey: 'ui:assistant-1' },
    );
  });

  it('reclaims a worker-crashed processing record after its lease expires', async () => {
    mockTxExecute
      .mockResolvedValueOnce({
        rows: [{
          id: 'outbox-stale',
          operation: 'telemetry.turn',
          payload: {
            userId: 'user-1',
            threadId: 'thread-1',
            messageId: null,
            idempotencyKey: 'telemetry.stale:1',
            model: 'test/model',
            inputTokens: 1,
            outputTokens: 1,
            toolCalls: 0,
            ms: 1,
          },
          attempt_count: 1,
          max_attempts: 8,
        }],
      })
      .mockResolvedValueOnce({ rows: [{ id: 'outbox-stale' }] });

    const result = await replayPersistenceFailures(1);

    expect(mockRecordTelemetry).toHaveBeenCalledWith(expect.objectContaining({
      idempotencyKey: 'telemetry.stale:1',
    }));
    expect(result).toEqual({ claimed: 1, completed: 1, failed: 0, dead: 0 });
  });

  it('marks a failed replay for exponential retry', async () => {
    mockRecordTelemetry.mockRejectedValueOnce(new Error('database unavailable'));
    mockTxExecute
      .mockResolvedValueOnce({
        rows: [{
          id: 'outbox-failed',
          operation: 'telemetry.turn',
          payload: { userId: 'user-1', threadId: 'thread-1', messageId: null },
          attempt_count: 0,
          max_attempts: 8,
        }],
      })
      .mockResolvedValueOnce({ rows: [{ id: 'outbox-failed' }] });

    const result = await replayPersistenceFailures(1);

    expect(result).toEqual({ claimed: 1, completed: 0, failed: 1, dead: 0 });
    expect(mockDbExecute).toHaveBeenCalled();
  });

  it('stops processing a record after max attempts and marks it dead', async () => {
    mockRecordTelemetry.mockRejectedValueOnce(new Error('permanent failure'));
    mockTxExecute
      .mockResolvedValueOnce({
        rows: [{
          id: 'outbox-dead',
          operation: 'telemetry.turn',
          payload: { userId: 'user-1', threadId: 'thread-1', messageId: null },
          attempt_count: 7,
          max_attempts: 8,
        }],
      })
      .mockResolvedValueOnce({ rows: [{ id: 'outbox-dead' }] });

    const result = await replayPersistenceFailures(1);

    expect(result).toEqual({ claimed: 1, completed: 0, failed: 0, dead: 1 });
  });

  it('does nothing when no due outbox row can be claimed', async () => {
    mockTxExecute.mockResolvedValueOnce({ rows: [] });

    await expect(replayPersistenceFailures(10)).resolves.toEqual({
      claimed: 0,
      completed: 0,
      failed: 0,
      dead: 0,
    });
    expect(mockDbExecute).not.toHaveBeenCalled();
  });
});
