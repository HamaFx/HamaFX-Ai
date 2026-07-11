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

import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';

import {
  logger,
  createScopedLogger,
  createCategorizedLogger,
  logErrorContext,
  logForAgent,
  traceIdStorage,
} from '../src/logger';

describe('logger', () => {
  it('exports a pino logger instance', () => {
    expect(logger).toBeDefined();
    expect(typeof logger.info).toBe('function');
    expect(typeof logger.error).toBe('function');
    expect(typeof logger.warn).toBe('function');
    expect(typeof logger.debug).toBe('function');
  });

  it('can log at info level without throwing', () => {
    expect(() => logger.info('test message')).not.toThrow();
  });

  it('can log at error level without throwing', () => {
    expect(() => logger.error('test error')).not.toThrow();
  });

  it('can log at warn level without throwing', () => {
    expect(() => logger.warn('test warning')).not.toThrow();
  });

  it('can log at debug level without throwing', () => {
    expect(() => logger.debug('test debug')).not.toThrow();
  });

  it('can log with structured metadata', () => {
    expect(() => logger.info({ userId: 'u-123', action: 'test' }, 'structured')).not.toThrow();
  });
});

describe('createScopedLogger', () => {
  it('returns a child logger with context bindings', () => {
    const child = createScopedLogger({ userId: 'u-123', threadId: 't-456' });
    expect(child).toBeDefined();
    expect(typeof child.info).toBe('function');
  });

  it('child logger can log without throwing', () => {
    const child = createScopedLogger({ userId: 'u-123' });
    expect(() => child.info('child log')).not.toThrow();
  });

  it('creates independent child loggers', () => {
    const childA = createScopedLogger({ userId: 'a' });
    const childB = createScopedLogger({ userId: 'b' });
    expect(childA).not.toBe(childB);
  });
});

describe('createCategorizedLogger', () => {
  it('injects category into log lines', () => {
    const child = createCategorizedLogger('ai');
    expect(() => child.info('test message')).not.toThrow();
  });

  it('supports string-first and object-first overloads', () => {
    const log = createCategorizedLogger('api');
    expect(() => {
      log.info('string-first');
      log.info({ meta: 'value' }, 'object-first');
    }).not.toThrow();
  });

  it('exposes all log levels', () => {
    const log = createCategorizedLogger('db');
    expect(() => {
      log.trace('trace');
      log.debug('debug');
      log.info('info');
      log.warn('warn');
      log.error('error');
    }).not.toThrow();
  });
});

describe('traceIdStorage', () => {
  it('correlates logs inside a diagnostic scope', () => {
    const traceId = 'trace-123';
    const result = traceIdStorage.run(traceId, () => {
      return traceIdStorage.getStore();
    });
    expect(result).toBe(traceId);
  });

  it('returns undefined outside a diagnostic scope', () => {
    expect(traceIdStorage.getStore()).toBeUndefined();
  });
});

describe('logErrorContext', () => {
  let errorSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    errorSpy = vi.spyOn(logger, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    errorSpy.mockRestore();
  });

  it('logs structured error with category and operation', () => {
    const err = new Error('Something broke');
    logErrorContext(err, 'testOperation', { userId: 'u-123' }, 'ai');

    expect(errorSpy).toHaveBeenCalledTimes(1);
    const logObject = errorSpy.mock.calls[0][0] as Record<string, unknown>;
    expect(logObject.category).toBe('ai');
    expect(logObject.operation).toBe('testOperation');
    expect(logObject.userId).toBe('u-123');
    expect((logObject.error as Record<string, unknown>).message).toBe('Something broke');
  });

  it('includes traceId when inside a diagnostic scope', () => {
    const err = new Error('Something broke');
    traceIdStorage.run('trace-abc', () => {
      logErrorContext(err, 'testOperation');
    });

    const logObject = errorSpy.mock.calls[0][0] as Record<string, unknown>;
    expect(logObject.traceId).toBe('trace-abc');
  });

  it('enriches with error pattern metadata for known errors', () => {
    const err = new Error('Daily AI budget exceeded');
    logErrorContext(err, 'checkBudget');

    const logObject = errorSpy.mock.calls[0][0] as Record<string, unknown>;
    expect(logObject.errorPattern).toBe('Daily AI spend cap reached');
    expect(logObject.suggestedFix).toBeDefined();
    expect(logObject.retryable).toBe(false);
  });
});

describe('logForAgent', () => {
  let infoSpy: ReturnType<typeof vi.spyOn>;
  let errorSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    infoSpy = vi.spyOn(logger, 'info').mockImplementation(() => {});
    errorSpy = vi.spyOn(logger, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    infoSpy.mockRestore();
    errorSpy.mockRestore();
  });

  it('produces an agent log line with agentLog flag', () => {
    logForAgent('info', 'testOperation', {
      module: 'test-module',
      category: 'ai',
      context: { userId: 'u-123' },
    });

    expect(infoSpy).toHaveBeenCalledTimes(1);
    const logObject = infoSpy.mock.calls[0][0] as Record<string, unknown>;
    expect(logObject.agentLog).toBe(true);
    expect(logObject.operation).toBe('testOperation');
    expect(logObject.module).toBe('test-module');
    expect(logObject.category).toBe('ai');
    expect(logObject.userId).toBe('u-123');
  });

  it('includes bug report when an error is provided', () => {
    const err = new Error('Agent failure');
    logForAgent('error', 'agentRun', {
      module: 'ai-agent',
      category: 'ai',
      error: err,
    });

    expect(errorSpy).toHaveBeenCalledTimes(1);
    const logObject = errorSpy.mock.calls[0][0] as Record<string, unknown>;
    expect(logObject.agentLog).toBe(true);
    expect(logObject.bugReport).toBeDefined();
    expect((logObject.bugReport as Record<string, unknown>).error).toBeDefined();
  });

  it('includes traceId when inside a diagnostic scope', () => {
    traceIdStorage.run('trace-xyz', () => {
      logForAgent('info', 'agentRun', {
        module: 'ai-agent',
        category: 'ai',
      });
    });

    const logObject = infoSpy.mock.calls[0][0] as Record<string, unknown>;
    expect(logObject.traceId).toBe('trace-xyz');
  });
});
