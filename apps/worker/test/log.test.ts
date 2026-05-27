// Tests for the structured logger. We capture console output via spies.

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { createLogger } from '../src/log';

let logSpy: ReturnType<typeof vi.spyOn>;
let warnSpy: ReturnType<typeof vi.spyOn>;
let errorSpy: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  logSpy = vi.spyOn(console, 'info').mockImplementation(() => undefined);
  warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
  errorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('createLogger', () => {
  it('emits JSON when forceJson=true', () => {
    const log = createLogger({ service: 'worker', commit: 'abc123', forceJson: true });
    log.info('hello', { thread: 't1' });
    expect(logSpy).toHaveBeenCalledTimes(1);
    const line = String(logSpy.mock.calls[0]?.[0]);
    const parsed: unknown = JSON.parse(line);
    expect(parsed).toMatchObject({
      level: 'info',
      msg: 'hello',
      service: 'worker',
      commit: 'abc123',
      thread: 't1',
    });
    expect(typeof (parsed as { ts: unknown }).ts).toBe('string');
  });

  it('routes warn / error to the right console method', () => {
    const log = createLogger({ service: 'worker', forceJson: true });
    log.warn('careful');
    log.error('boom');
    expect(warnSpy).toHaveBeenCalledTimes(1);
    expect(errorSpy).toHaveBeenCalledTimes(1);
  });

  it('child loggers via .with() merge tags into every line', () => {
    const root = createLogger({ service: 'worker', forceJson: true });
    const child = root.with({ thread: 't1', module: 'aggregator' });
    child.info('bar closed');

    const line = String(logSpy.mock.calls[0]?.[0]);
    expect(JSON.parse(line)).toMatchObject({
      msg: 'bar closed',
      service: 'worker',
      thread: 't1',
      module: 'aggregator',
    });
  });

  it('child .with() does not leak tags back to the parent', () => {
    const root = createLogger({ service: 'worker', forceJson: true });
    root.with({ thread: 't1' }); // discarded child
    root.info('plain');

    const line = String(logSpy.mock.calls[0]?.[0]);
    const parsed = JSON.parse(line) as Record<string, unknown>;
    expect(parsed).not.toHaveProperty('thread');
  });
});
