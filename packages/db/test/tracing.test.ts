import { describe, expect, it, vi } from 'vitest';

// Mock OpenTelemetry before importing tracing
const mockStartActiveSpan = vi.fn();
const mockSpan = {
  setStatus: vi.fn(),
  recordException: vi.fn(),
  end: vi.fn(),
};

vi.mock('@opentelemetry/api', () => ({
  trace: {
    getTracer: vi.fn(() => ({
      startActiveSpan: mockStartActiveSpan,
    })),
  },
  SpanStatusCode: {
    OK: 1,
    ERROR: 2,
  },
}));

import { traceQuery, withTracing } from '../src/tracing';

describe('traceQuery', () => {
  it('wraps successful query in a span', async () => {
    mockStartActiveSpan.mockImplementation((_name: string, fn: (span: typeof mockSpan) => Promise<string>) =>
      fn(mockSpan),
    );

    const result = await traceQuery('test.query', async () => 'success');

    expect(result).toBe('success');
    expect(mockStartActiveSpan).toHaveBeenCalledWith('query.test.query', expect.any(Function));
    expect(mockSpan.setStatus).toHaveBeenCalledWith({ code: 1 });
    expect(mockSpan.end).toHaveBeenCalled();
  });

  it('records error and rethrows on query failure', async () => {
    mockStartActiveSpan.mockImplementation((_name: string, fn: (span: typeof mockSpan) => Promise<never>) =>
      fn(mockSpan),
    );

    const testError = new Error('query failed');
    await expect(traceQuery('test.fail', async () => { throw testError; })).rejects.toThrow('query failed');

    expect(mockSpan.setStatus).toHaveBeenCalledWith({
      code: 2,
      message: 'query failed',
    });
    expect(mockSpan.recordException).toHaveBeenCalledWith(testError);
    expect(mockSpan.end).toHaveBeenCalled();
  });

  it('handles non-Error exceptions gracefully', async () => {
    mockStartActiveSpan.mockImplementation((_name: string, fn: (span: typeof mockSpan) => Promise<never>) =>
      fn(mockSpan),
    );

    await expect(traceQuery('test.fail', async () => { throw 'string error'; })).rejects.toBe('string error');

    expect(mockSpan.setStatus).toHaveBeenCalledWith({
      code: 2,
      message: 'string error',
    });
    expect(mockSpan.recordException).toHaveBeenCalled();
    expect(mockSpan.end).toHaveBeenCalled();
  });
});

describe('withTracing', () => {
  it('wraps a function with tracing and preserves arguments', async () => {
    mockStartActiveSpan.mockImplementation((_name: string, fn: (span: typeof mockSpan) => Promise<number>) =>
      fn(mockSpan),
    );

    const wrapped = withTracing('queries.test.add', async (a: number, b: number) => a + b);
    const result = await wrapped(3, 4);

    expect(result).toBe(7);
    expect(mockStartActiveSpan).toHaveBeenCalledWith('query.queries.test.add', expect.any(Function));
    expect(mockSpan.setStatus).toHaveBeenCalledWith({ code: 1 });
    expect(mockSpan.end).toHaveBeenCalled();
  });
});
