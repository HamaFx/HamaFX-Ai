import { describe, expect, it, vi, beforeEach } from 'vitest';

// Mock persistence before importing helpers.
const { recordToolTelemetry } = vi.hoisted(() => ({
  recordToolTelemetry: vi.fn(),
}));
vi.mock('../src/persistence', () => ({
  recordToolTelemetry,
}));

import { countToolCalls, flushBatchedTelemetry } from '../src/chat/helpers';

describe('countToolCalls', () => {
  it('returns 0 for empty messages', () => {
    expect(countToolCalls([])).toBe(0);
  });

  it('returns 0 when no messages have tool calls', () => {
    const messages = [
      { content: 'plain text' },
      { content: [{ type: 'text', text: 'hello' }] },
    ];
    expect(countToolCalls(messages)).toBe(0);
  });

  it('counts a single tool call', () => {
    const messages = [
      {
        content: [
          { type: 'tool-call', toolName: 'get_price', args: {} },
        ],
      },
    ];
    expect(countToolCalls(messages)).toBe(1);
  });

  it('counts multiple tool calls across messages', () => {
    const messages = [
      {
        content: [
          { type: 'tool-call', toolName: 'get_price', args: {} },
          { type: 'tool-call', toolName: 'get_candles', args: {} },
        ],
      },
      { content: 'user response' },
      {
        content: [
          { type: 'tool-call', toolName: 'get_news', args: {} },
        ],
      },
    ];
    expect(countToolCalls(messages)).toBe(3);
  });

  it('handles messages with non-array content', () => {
    const messages = [
      { content: null },
      { content: undefined },
      { content: 'string content' },
      { content: 42 },
    ];
    expect(countToolCalls(messages)).toBe(0);
  });

  it('handles messages with malformed parts', () => {
    const messages = [
      { content: [null, undefined, { type: 'text' }, { type: 'tool-call' }] },
    ];
    expect(countToolCalls(messages)).toBe(1);
  });
});

describe('flushBatchedTelemetry', () => {
  beforeEach(() => {
    recordToolTelemetry.mockReset();
  });

  it('does nothing for empty entries', async () => {
    await expect(flushBatchedTelemetry([])).resolves.toEqual({ attempted: 0, failed: 0 });
    expect(recordToolTelemetry).not.toHaveBeenCalled();
  });

  it('flushes entries to recordToolTelemetry', async () => {
    recordToolTelemetry.mockResolvedValue(true);

    const result = await flushBatchedTelemetry([
      { threadId: 't1', userId: 'u1', tool: 'get_price', ms: 100, ok: true },
      { threadId: 't1', userId: 'u1', tool: 'get_candles', ms: 200, ok: false, errorCode: 'TIMEOUT' },
    ]);

    expect(result).toEqual({ attempted: 2, failed: 0 });
    expect(recordToolTelemetry).toHaveBeenCalledTimes(2);
    expect(recordToolTelemetry).toHaveBeenCalledWith(
      expect.objectContaining({ tool: 'get_price', ok: true }),
    );
  });

  it('reports partial sink failures instead of resolving as an invisible success', async () => {
    recordToolTelemetry
      .mockResolvedValueOnce(true)
      .mockResolvedValueOnce(false)
      .mockResolvedValueOnce(true);

    const result = await flushBatchedTelemetry([
      { threadId: 'thread-1', tool: 'get_price', ms: 10, ok: true },
      { threadId: 'thread-1', tool: 'get_candles', ms: 20, ok: true },
      { threadId: 'thread-1', tool: 'get_indicators', ms: 30, ok: true },
    ]);

    expect(result).toEqual({ attempted: 3, failed: 1 });
    expect(recordToolTelemetry).toHaveBeenCalledTimes(3);
  });

  it('reports an unexpected telemetry sink throw as a failed entry', async () => {
    recordToolTelemetry.mockRejectedValue(new Error('DB error'));

    await expect(
      flushBatchedTelemetry([
        { threadId: 't1', userId: 'u1', tool: 'get_price', ms: 100, ok: true },
      ]),
    ).resolves.toEqual({ attempted: 1, failed: 1 });
  });
});
