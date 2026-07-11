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

import { describe, expect, it, vi } from 'vitest';

import { generateBugReport } from '../src';
import { AppError } from '../src';

describe('generateBugReport', () => {
  it('generates a report from a plain Error', () => {
    const err = new Error('Something broke');
    const report = generateBugReport(err, { operation: 'testOp', module: 'test-module' });

    expect(report.reportId).toMatch(/^br_\d+_[a-z0-9]+$/);
    expect(report.timestamp).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    expect(report.error.message).toBe('Something broke');
    expect(report.error.name).toBe('Error');
    expect(report.error.code).toBe('INTERNAL');
    expect(report.operation).toBe('testOp');
    expect(report.module).toBe('test-module');
    expect(report.retryable).toBe(false);
    expect(report.environment.nodeEnv).toBeDefined();
    expect(report.environment.runtime).toBe('node');
  });

  it('uses AppError code and retryable flag', () => {
    const err = new AppError('PROVIDER_UNAVAILABLE', 'Provider down', 503, { retryable: true });
    const report = generateBugReport(err, { operation: 'fetchPrice', module: 'market-data' });

    expect(report.error.code).toBe('PROVIDER_UNAVAILABLE');
    expect(report.retryable).toBe(true);
  });

  it('extracts file and line from stack trace', () => {
    const err = new Error('Stack trace test');
    err.stack = 'Error: Stack trace test\n    at foo (/path/to/file.ts:42:10)\n    at bar (/path/to/other.ts:10:5)';

    const report = generateBugReport(err, { operation: 'op', module: 'mod' });
    expect(report.error.file).toBe('/path/to/file.ts');
    expect(report.error.line).toBe(42);
  });

  it('extracts related files from stack trace', () => {
    const err = new Error('Stack trace test');
    err.stack = 'Error: Stack trace test\n    at foo (/path/to/file.ts:42:10)\n    at bar (/path/to/other.ts:10:5)';

    const report = generateBugReport(err, { operation: 'op', module: 'mod' });
    expect(report.relatedFiles).toContain('/path/to/file.ts');
    expect(report.relatedFiles).toContain('/path/to/other.ts');
  });

  it('excludes node_modules from related files', () => {
    const err = new Error('Stack trace test');
    err.stack = 'Error: Stack trace test\n    at foo (/app/src/index.ts:1:1)\n    at bar (/app/node_modules/lib/index.js:1:1)';

    const report = generateBugReport(err, { operation: 'op', module: 'mod' });
    expect(report.relatedFiles).toContain('/app/src/index.ts');
    expect(report.relatedFiles).not.toContain('/app/node_modules/lib/index.js');
  });

  it('includes optional request context', () => {
    const err = new Error('Request failed');
    const report = generateBugReport(err, {
      operation: 'apiCall',
      module: 'api',
      requestId: 'req-123',
      route: '/api/test',
      method: 'POST',
    });

    expect(report.request).toEqual({
      requestId: 'req-123',
      route: '/api/test',
      method: 'POST',
    });
  });

  it('includes optional user context without PII', () => {
    const err = new Error('User action failed');
    const report = generateBugReport(err, {
      operation: 'userAction',
      module: 'auth',
      userId: 'u-123',
    });

    expect(report.user).toEqual({ userId: 'u-123' });
    expect(report.user?.email).toBeUndefined();
  });

  it('includes optional suggested fix', () => {
    const err = new Error('Fix me');
    const report = generateBugReport(err, {
      operation: 'op',
      module: 'mod',
      suggestedFix: 'Restart the service',
    });

    expect(report.suggestedFix).toBe('Restart the service');
  });

  it('includes diagnostic trace when provided', () => {
    const err = new Error('Trace test');
    const trace = {
      traceId: 't-123',
      userId: 'u-123',
      threadId: 'th-456',
      durationMs: 100,
      steps: [{ name: 'step1', status: 'completed' as const, timestamp: Date.now() }],
      errors: [{ name: 'Error', message: 'step error', timestamp: Date.now() }],
    };

    const report = generateBugReport(err, { operation: 'op', module: 'mod', trace });
    expect(report.trace).toEqual(trace);
  });

  it('handles non-Error values', () => {
    const report = generateBugReport('string error', { operation: 'op', module: 'mod' });
    expect(report.error.message).toBe('string error');
    expect(report.error.name).toBe('Error');
  });

  it('truncates long cause strings', () => {
    const err = new Error('Error');
    (err as Error & { cause: string }).cause = 'x'.repeat(1000);

    const report = generateBugReport(err, { operation: 'op', module: 'mod' });
    expect(report.error.cause?.length).toBeLessThanOrEqual(500);
  });
});
