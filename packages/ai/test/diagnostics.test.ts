/**
 * Copyright 2026 HamaFX
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

import { describe, expect, it } from 'vitest';

import {
  withDiagnostics,
  getDiagnosticContext,
  recordStep,
  completeStep,
  recordError,
  exportDiagnosticContext,
} from '../src/diagnostics/run-context';

describe('withDiagnostics — context propagation', () => {
  it('provides a diagnostic context inside the scope', async () => {
    let ctxInside: ReturnType<typeof getDiagnosticContext> = null;
    await withDiagnostics('user-1', 'thread-1', async () => {
      ctxInside = getDiagnosticContext();
    });
    expect(ctxInside).not.toBeNull();
    expect(ctxInside!.userId).toBe('user-1');
    expect(ctxInside!.threadId).toBe('thread-1');
    expect(ctxInside!.traceId).toBeTruthy();
    expect(ctxInside!.steps).toEqual([]);
    expect(ctxInside!.errors).toEqual([]);
  });

  it('returns null outside a diagnostic scope', () => {
    expect(getDiagnosticContext()).toBeNull();
  });

  it('propagates context through nested async calls', async () => {
    let deepCtx: ReturnType<typeof getDiagnosticContext> = null;
    const inner = async () => {
      await Promise.resolve();
      deepCtx = getDiagnosticContext();
    };

    await withDiagnostics('user-2', 'thread-2', async () => {
      await inner();
    });

    expect(deepCtx).not.toBeNull();
    expect(deepCtx!.userId).toBe('user-2');
  });

  it('returns the result of the wrapped function', async () => {
    const result = await withDiagnostics('user-3', 'thread-3', async () => {
      return 'success';
    });
    expect(result).toBe('success');
  });

  it('propagates errors from the wrapped function', async () => {
    await expect(
      withDiagnostics('user-4', 'thread-4', async () => {
        throw new Error('test error');
      }),
    ).rejects.toThrow('test error');
  });
});

describe('recordStep — step recording', () => {
  it('records a step with metadata', async () => {
    await withDiagnostics('user-1', 'thread-1', async () => {
      recordStep('fetch_candles', { symbol: 'XAUUSD' });
      const ctx = getDiagnosticContext();
      expect(ctx!.steps).toHaveLength(1);
      expect(ctx!.steps[0]!.name).toBe('fetch_candles');
      expect(ctx!.steps[0]!.status).toBe('started');
      expect(ctx!.steps[0]!.metadata).toEqual({ symbol: 'XAUUSD' });
      expect(ctx!.steps[0]!.timestamp).toBeGreaterThan(0);
    });
  });

  it('is a no-op outside a diagnostic scope', () => {
    expect(() => recordStep('test')).not.toThrow();
    expect(getDiagnosticContext()).toBeNull();
  });

  it('redacts sensitive metadata', async () => {
    await withDiagnostics('user-1', 'thread-1', async () => {
      recordStep('api_call', { api_key: 'sk-secret123', endpoint: '/data' });
      const ctx = getDiagnosticContext();
      expect(ctx!.steps[0]!.metadata!.api_key).toBe('<redacted>');
      expect(ctx!.steps[0]!.metadata!.endpoint).toBe('/data');
    });
  });
});

describe('completeStep — step completion', () => {
  it('marks a started step as completed', async () => {
    await withDiagnostics('user-1', 'thread-1', async () => {
      recordStep('fetch_data');
      completeStep('fetch_data', 'completed', 42);
      const ctx = getDiagnosticContext();
      expect(ctx!.steps[0]!.status).toBe('completed');
      expect(ctx!.steps[0]!.durationMs).toBe(42);
    });
  });

  it('marks a started step as failed', async () => {
    await withDiagnostics('user-1', 'thread-1', async () => {
      recordStep('fetch_data');
      completeStep('fetch_data', 'failed', 10, { error: 'timeout' });
      const ctx = getDiagnosticContext();
      expect(ctx!.steps[0]!.status).toBe('failed');
      expect(ctx!.steps[0]!.durationMs).toBe(10);
      expect(ctx!.steps[0]!.metadata!.error).toBe('timeout');
    });
  });

  it('creates a new step if no matching started step exists', async () => {
    await withDiagnostics('user-1', 'thread-1', async () => {
      completeStep('orphan_step', 'completed', 5);
      const ctx = getDiagnosticContext();
      expect(ctx!.steps).toHaveLength(1);
      expect(ctx!.steps[0]!.name).toBe('orphan_step');
      expect(ctx!.steps[0]!.status).toBe('completed');
    });
  });

  it('is a no-op outside a diagnostic scope', () => {
    expect(() => completeStep('test', 'completed', 1)).not.toThrow();
  });
});

describe('recordError — error recording', () => {
  it('records an error with redacted message', async () => {
    await withDiagnostics('user-1', 'thread-1', async () => {
      const err = new Error('api_key=sk-secret failed');
      recordError(err);
      const ctx = getDiagnosticContext();
      expect(ctx!.errors).toHaveLength(1);
      expect(ctx!.errors[0]!.name).toBe('Error');
      expect(ctx!.errors[0]!.message).toContain('<redacted>');
      expect(ctx!.errors[0]!.message).not.toContain('sk-secret');
      expect(ctx!.errors[0]!.timestamp).toBeGreaterThan(0);
    });
  });

  it('records stack traces when available', async () => {
    await withDiagnostics('user-1', 'thread-1', async () => {
      const err = new Error('test error');
      recordError(err);
      const ctx = getDiagnosticContext();
      expect(ctx!.errors[0]!.stack).toBeTruthy();
    });
  });

  it('handles non-Error objects', async () => {
    await withDiagnostics('user-1', 'thread-1', async () => {
      recordError('string error');
      const ctx = getDiagnosticContext();
      expect(ctx!.errors).toHaveLength(1);
      expect(ctx!.errors[0]!.message).toBe('string error');
      expect(ctx!.errors[0]!.name).toBe('Error');
    });
  });

  it('is a no-op outside a diagnostic scope', () => {
    expect(() => recordError(new Error('test'))).not.toThrow();
  });
});

describe('exportDiagnosticContext — serialization', () => {
  it('exports the full context with redaction', async () => {
    await withDiagnostics('user-1', 'thread-1', async () => {
      recordStep('step1', { api_key: 'sk-secret' });
      recordError(new Error('token=abc123 failed'));
      const exported = exportDiagnosticContext();
      expect(exported).not.toBeNull();
      expect(exported!.traceId).toBeTruthy();
      expect(exported!.userId).toBe('user-1');
      expect(exported!.threadId).toBe('thread-1');
      expect(exported!.durationMs).toBeGreaterThanOrEqual(0);

      const steps = exported!.steps as Array<Record<string, unknown>>;
      expect(steps[0]!.metadata).toEqual({ api_key: '<redacted>' });

      const errors = exported!.errors as Array<Record<string, unknown>>;
      expect(errors[0]!.message).toContain('<redacted>');
    });
  });

  it('returns null outside a diagnostic scope', () => {
    expect(exportDiagnosticContext()).toBeNull();
  });
});