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

import { logger, createScopedLogger } from '../src';

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
