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

// Tests for the structured logger. We capture output via an in-memory
// destination so the tests are isolated from process.stdout.

import { Writable } from 'node:stream';
import { describe, expect, it } from 'vitest';

import { createLogger } from '../src/log';

/** Build a Writable that collects every written chunk as a string. */
function makeDestination(): { writable: Writable; lines: string[] } {
  const lines: string[] = [];
  const writable = new Writable({
    write(chunk, _encoding, callback) {
      lines.push(typeof chunk === 'string' ? chunk : chunk.toString());
      callback();
    },
  });
  return { writable, lines };
}

function parseLine(lines: string[], index: number): Record<string, unknown> {
  const line = lines[index];
  if (!line) throw new Error(`No log line at index ${index}`);
  return JSON.parse(line) as Record<string, unknown>;
}

describe('createLogger', () => {
  it('emits JSON when forceJson=true', () => {
    const { writable, lines } = makeDestination();
    const log = createLogger({ service: 'worker', commit: 'abc123', forceJson: true, destination: writable });
    log.info('hello', { thread: 't1' });

    expect(lines).toHaveLength(1);
    const parsed = parseLine(lines, 0);
    expect(parsed).toMatchObject({
      level: 30,
      msg: 'hello',
      service: 'worker',
      commit: 'abc123',
      thread: 't1',
      category: 'worker',
    });
    expect(typeof parsed.time).toBe('number');
  });

  it('routes warn / error to the destination', () => {
    const { writable, lines } = makeDestination();
    const log = createLogger({ service: 'worker', forceJson: true, destination: writable });
    log.warn('careful');
    log.error('boom');

    expect(lines).toHaveLength(2);
    expect(parseLine(lines, 0)).toMatchObject({ level: 40, msg: 'careful' });
    expect(parseLine(lines, 1)).toMatchObject({ level: 50, msg: 'boom' });
  });

  it('child loggers via .with() merge tags into every line', () => {
    const { writable, lines } = makeDestination();
    const root = createLogger({ service: 'worker', forceJson: true, destination: writable });
    const child = root.with({ thread: 't1', module: 'aggregator' });
    child.info('bar closed');

    expect(lines).toHaveLength(1);
    expect(parseLine(lines, 0)).toMatchObject({
      msg: 'bar closed',
      service: 'worker',
      thread: 't1',
      module: 'aggregator',
      category: 'worker',
    });
  });

  it('child .with() does not leak tags back to the parent', () => {
    const { writable, lines } = makeDestination();
    const root = createLogger({ service: 'worker', forceJson: true, destination: writable });
    root.with({ thread: 't1' }); // discarded child
    root.info('plain');

    expect(lines).toHaveLength(1);
    const parsed = parseLine(lines, 0);
    expect(parsed).not.toHaveProperty('thread');
  });
});
