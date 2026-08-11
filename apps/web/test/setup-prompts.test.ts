// SPDX-License-Identifier: Apache-2.0

import { EventEmitter } from 'node:events';

import { describe, expect, it } from 'vitest';

import {
  CancelError,
  confirm,
  multiselect,
  select,
  text,
} from '../../scripts/setup/lib/prompts.mjs';

/**
 * Fake stdin: an EventEmitter that also exposes the TTY/raw-mode API.
 * pause()/resume() mirror a real TTY — while paused, 'data' events are
 * dropped. This keeps the unit tests honest: a prompt that pauses stdin
 * before it settles would hang (regression guard for the raw-mode bug).
 */
function fakeStdin(isTTY = true) {
  const stdin = new EventEmitter() as EventEmitter & {
    isTTY: boolean;
    isRaw: boolean;
    paused: boolean;
    setRawMode: (v: boolean) => void;
    resume: () => void;
    pause: () => void;
    setEncoding: () => void;
  };
  const realEmit = stdin.emit.bind(stdin);
  stdin.isTTY = isTTY;
  stdin.isRaw = false;
  stdin.paused = false;
  stdin.emit = ((event: string, ...args: unknown[]) => {
    if (event === 'data' && stdin.paused) return false;
    return realEmit(event, ...args);
  }) as EventEmitter['emit'];
  stdin.setRawMode = (v) => {
    stdin.isRaw = v;
  };
  stdin.resume = () => {
    stdin.paused = false;
  };
  stdin.pause = () => {
    stdin.paused = true;
  };
  stdin.setEncoding = () => {};
  return stdin;
}

/** Fake stdout that captures everything written. */
function fakeStdout(isTTY = true) {
  let buffer = '';
  const stdout = {
    isTTY,
    write: (s: string) => {
      buffer += s;
    },
    get text() {
      return buffer;
    },
  };
  return stdout;
}

function makeIO({ tty = true } = {}) {
  const stdin = fakeStdin(tty);
  const stdout = fakeStdout(tty);
  const io = {
    stdin,
    stdout,
    write: (s: string) => stdout.write(s),
    line: (s = '') => stdout.write(`${s}\n`),
    isTTY: tty,
  };
  return { io, stdin, stdout };
}

/** Queue raw key bytes to the fake stdin as they would arrive. */
function press(stdin, bytes: string) {
  stdin.emit('data', bytes);
}

const OPTIONS = [
  { value: 'a', label: 'Alpha' },
  { value: 'b', label: 'Beta' },
  { value: 'c', label: 'Gamma' },
];

describe('select', () => {
  it('returns the initial value on enter', async () => {
    const { io, stdin } = makeIO();
    const promise = select(io, { message: 'Pick', options: OPTIONS });
    await Promise.resolve();
    press(stdin, '\r');
    await expect(promise).resolves.toBe('a');
    expect(stdin.isRaw).toBe(false); // raw mode restored
  });

  it('moves down with the down arrow and confirms with enter', async () => {
    const { io, stdin } = makeIO();
    const promise = select(io, { message: 'Pick', options: OPTIONS });
    await Promise.resolve();
    press(stdin, '\x1b[B'); // down
    press(stdin, '\x1b[B'); // down
    press(stdin, '\r');
    await expect(promise).resolves.toBe('c');
  });

  it('wraps around from the first to the last option on up', async () => {
    const { io, stdin } = makeIO();
    const promise = select(io, { message: 'Pick', options: OPTIONS });
    await Promise.resolve();
    press(stdin, '\x1b[A'); // up → last
    press(stdin, '\r');
    await expect(promise).resolves.toBe('c');
  });

  it('honors initialValue', async () => {
    const { io, stdin } = makeIO();
    const promise = select(io, { message: 'Pick', options: OPTIONS, initialValue: 'b' });
    await Promise.resolve();
    press(stdin, '\r');
    await expect(promise).resolves.toBe('b');
  });

  it('returns "cancel" on ESC', async () => {
    const { io, stdin } = makeIO();
    const promise = select(io, { message: 'Pick', options: OPTIONS });
    await Promise.resolve();
    press(stdin, '\x1b');
    press(stdin, 'x'); // non-sequence byte disambiguates the lone ESC
    await expect(promise).resolves.toBe('cancel');
  });

  it('throws CancelError on Ctrl+C and restores raw mode', async () => {
    const { io, stdin } = makeIO();
    const promise = select(io, { message: 'Pick', options: OPTIONS });
    await Promise.resolve();
    press(stdin, '\x03');
    await expect(promise).rejects.toBeInstanceOf(CancelError);
    expect(stdin.isRaw).toBe(false);
  });

  it('auto-answers with the default when not a TTY', async () => {
    const { io } = makeIO({ tty: false });
    await expect(
      select(io, { message: 'Pick', options: OPTIONS, initialValue: 'c' }),
    ).resolves.toBe('c');
  });
});

describe('multiselect', () => {
  it('toggles options with space and returns chosen values', async () => {
    const { io, stdin } = makeIO();
    const promise = multiselect(io, { message: 'Pick many', options: OPTIONS });
    await Promise.resolve();
    press(stdin, ' '); // select a
    press(stdin, '\x1b[B'); // down to b
    press(stdin, ' '); // select b
    press(stdin, '\r');
    await expect(promise).resolves.toEqual(['a', 'b']);
  });

  it('enforces min selection', async () => {
    const { io, stdin } = makeIO();
    const promise = multiselect(io, { message: 'Pick many', options: OPTIONS, min: 1 });
    await Promise.resolve();
    press(stdin, '\r'); // nothing selected → flash, keep going
    press(stdin, ' '); // select a
    press(stdin, '\r');
    await expect(promise).resolves.toEqual(['a']);
  });

  it('returns empty array when nothing selected', async () => {
    const { io, stdin } = makeIO();
    const promise = multiselect(io, { message: 'Pick many', options: OPTIONS });
    await Promise.resolve();
    press(stdin, '\r');
    await expect(promise).resolves.toEqual([]);
  });

  it('returns "cancel" on ESC', async () => {
    const { io, stdin } = makeIO();
    const promise = multiselect(io, { message: 'Pick many', options: OPTIONS });
    await Promise.resolve();
    press(stdin, '\x1b');
    press(stdin, 'x');
    await expect(promise).resolves.toBe('cancel');
  });
});

describe('confirm', () => {
  it('defaults to initial and confirms on enter', async () => {
    const { io, stdin } = makeIO();
    const promise = confirm(io, { message: 'Continue?', initial: true });
    await Promise.resolve();
    press(stdin, '\r');
    await expect(promise).resolves.toBe(true);
  });

  it('moves to No with the arrow key', async () => {
    const { io, stdin } = makeIO();
    const promise = confirm(io, { message: 'Continue?', initial: true });
    await Promise.resolve();
    press(stdin, '\x1b[B'); // down → No
    press(stdin, '\r');
    await expect(promise).resolves.toBe(false);
  });
});

describe('text', () => {
  it('collects typed characters and returns the trimmed value', async () => {
    const { io, stdin } = makeIO();
    const promise = text(io, { message: 'Name?' });
    await Promise.resolve();
    press(stdin, 'hello world');
    press(stdin, '\r');
    await expect(promise).resolves.toBe('hello world');
  });

  it('supports backspace editing', async () => {
    const { io, stdin } = makeIO();
    const promise = text(io, { message: 'Name?' });
    await Promise.resolve();
    press(stdin, 'abc\x7f');
    press(stdin, '\r');
    await expect(promise).resolves.toBe('ab');
  });

  it('rejects invalid input until it becomes valid', async () => {
    const { io, stdin } = makeIO();
    const promise = text(io, {
      message: 'Key?',
      validate: (v: string) => (v.length < 5 ? 'too short' : null),
    });
    await Promise.resolve();
    press(stdin, 'abc');
    press(stdin, '\r'); // invalid → stays open
    press(stdin, 'de'); // becomes abcde
    press(stdin, '\r');
    await expect(promise).resolves.toBe('abcde');
  });

  it('returns empty when auto (non-TTY)', async () => {
    const { io } = makeIO({ tty: false });
    await expect(text(io, { message: 'Key?' })).resolves.toBe('');
  });
});
