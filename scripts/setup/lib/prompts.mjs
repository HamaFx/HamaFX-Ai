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

/**
 * Zero-dependency interactive prompt layer.
 *
 * Provides arrow-key `select`, `multiselect` (checkbox), `confirm`, and
 * `text` prompts driven by raw-mode keypresses, plus graceful Ctrl+C
 * handling (throws CancelError) and ESC-to-cancel (returns 'cancel').
 *
 * Non-TTY behavior: when stdin/stdout are not a terminal (piped input,
 * CI, `--yes`) every prompt auto-answers with its default instead of
 * rendering — so the wizard degrades to a quiet script.
 *
 * Every prompt takes an `io` object (see lib/io.mjs) so tests can inject
 * a fake stdin/stdout and script keypresses.
 */

import { paint } from './ui.mjs';

/** Thrown when the user presses Ctrl+C inside a prompt. */
export class CancelError extends Error {
  constructor() {
    super('Setup interrupted.');
    this.name = 'CancelError';
  }
}

// Registry of raw-mode cleanup callbacks so a SIGINT landing outside a
// prompt (e.g. during a spinner) can restore the terminal before exit.
const rawCleanups = [];

function registerRawCleanup(fn) {
  rawCleanups.push(fn);
}

/** Restore the terminal to a sane state (used by the SIGINT handler). */
export function restoreTerminal() {
  for (const fn of rawCleanups.splice(0)) {
    try {
      fn();
    } catch {
      // ignore
    }
  }
}

/**
 * Parse raw keypress bytes into semantic key events.
 * Returns { key, rest } or { key: null, rest } when more bytes are
 * needed to complete an escape sequence.
 */
function consumeKey(buffer) {
  if (buffer.length === 0) return { key: null, rest: buffer };

  const c = buffer[0];
  if (c !== '\x1b') {
    const rest = buffer.slice(1);
    if (c === '\x03') return { key: { type: 'ctrl-c' }, rest };
    if (c === '\r' || c === '\n') return { key: { type: 'enter' }, rest };
    if (c === '\x20') return { key: { type: 'space' }, rest };
    if (c === '\x7f' || c === '\x08') return { key: { type: 'backspace' }, rest };
    if (c === '\x1a') return { key: { type: 'ctrl-z' }, rest };
    return { key: { type: 'char', char: c }, rest };
  }

  // Escape sequence — need at least one more byte to disambiguate.
  if (buffer.length === 1) return { key: null, rest: buffer };

  if (buffer[1] === '[') {
    const m = buffer.match(/^\x1b\[([0-9;]*)([A-Za-z~])/);
    if (!m) {
      // Incomplete sequence (e.g. just "\x1b["), wait for more.
      if (buffer.length < 3) return { key: null, rest: buffer };
      return { key: { type: 'unknown' }, rest: buffer.slice(3) };
    }
    const rest = buffer.slice(m[0].length);
    switch (m[2]) {
      case 'A':
        return { key: { type: 'up' }, rest };
      case 'B':
        return { key: { type: 'down' }, rest };
      case 'C':
        return { key: { type: 'right' }, rest };
      case 'D':
        return { key: { type: 'left' }, rest };
      case 'H':
        return { key: { type: 'home' }, rest };
      case 'F':
        return { key: { type: 'end' }, rest };
      default:
        return { key: { type: 'unknown' }, rest };
    }
  }

  if (buffer[1] === 'O') {
    // \x1bO... function-key sequences; treat as unknown, drop both bytes.
    return { key: { type: 'unknown' }, rest: buffer.slice(2) };
  }

  // Standalone ESC (followed by a non-sequence byte).
  return { key: { type: 'esc' }, rest: buffer.slice(2) };
}

/** Build a promise-based key reader for the given stdin. */
function makeKeyReader(stdin) {
  let buffer = '';
  let escTimer = null;
  let pendingEsc = false;
  const waiters = [];

  const push = () => {
    while (waiters.length > 0) {
      const { key, rest } = consumeKey(buffer);
      buffer = rest;
      if (key === null) break; // need more bytes
      waiters.shift()(key);
    }
    // A lone ESC byte could be the start of a sequence arriving in the
    // next chunk, or a real standalone ESC. If nothing else arrives
    // shortly, treat it as a standalone ESC (matches clack behavior).
    if (buffer === '\x1b' && !escTimer) {
      escTimer = setTimeout(() => {
        escTimer = null;
        if (buffer !== '\x1b') return;
        buffer = '';
        pendingEsc = true;
        const waiter = waiters.shift();
        if (waiter) waiter({ type: 'esc' });
      }, 50);
    }
  };

  stdin.on('data', (chunk) => {
    buffer += chunk;
    push();
  });

  return {
    next() {
      if (pendingEsc) {
        pendingEsc = false;
        return Promise.resolve({ type: 'esc' });
      }
      return new Promise((resolve) => {
        waiters.push(resolve);
        push();
      });
    },
  };
}

/**
 * Enter raw mode. Returns a cleanup function. On a TTY, Ctrl+C arrives as
 * a \x03 byte (ISIG is disabled in raw mode) — the *signal* handler never
 * fires while a prompt is active, which is exactly what we want: the
 * prompt decides how to abort instead of the process dying mid-render.
 */
function withRawMode(io, fn) {
  // A real raw-mode prompt is about to render — record it so the
  // orchestrator can tell interactive steps (no page pause needed) from
  // auto-advancing ones (which get a short read-time pause).
  io.prompted = true;
  const wasRaw = io.stdin.isRaw ?? false;
  const cleanup = () => {
    const idx = rawCleanups.indexOf(cleanup);
    if (idx >= 0) rawCleanups.splice(idx, 1);
    try {
      if (io.stdin.setRawMode) io.stdin.setRawMode(wasRaw);
      if (io.stdin.pause) io.stdin.pause();
    } catch {
      // ignore — the stream may already be closed
    }
  };
  if (io.stdin.setRawMode) io.stdin.setRawMode(true);
  if (io.stdin.resume) io.stdin.resume();
  io.stdin.setEncoding?.('utf8');
  registerRawCleanup(cleanup);
  // IMPORTANT: never call pause()/setRawMode(false) synchronously here.
  // Doing so drains the event loop on a real TTY and Node exits with
  // "unsettled top-level await" before the prompt reads any input.
  // Cleanup is attached to the promise and runs only after it settles.
  const promise = Promise.resolve().then(fn);
  promise.then(cleanup, cleanup);
  return promise;
}

/** Incremental line renderer that redraws in place. */
function createRenderer(io) {
  let lines = 0;
  return {
    render(text) {
      if (lines > 0) {
        io.write(`\x1b[${lines}A`);
        io.write('\x1b[J');
      }
      io.write(text);
      if (!text.endsWith('\n')) io.write('\n');
      lines = text.split('\n').length;
    },
    clear() {
      if (lines > 0) {
        io.write(`\x1b[${lines}A`);
        io.write('\x1b[J');
      }
      lines = 0;
    },
  };
}

const KEY_HINT_SELECT = paint('↑/↓ to move · enter to confirm · esc to cancel', 'dim');
const KEY_HINT_MULTI = paint(
  '↑/↓ to move · space to select · enter to confirm · esc to cancel',
  'dim',
);
const KEY_HINT_CONFIRM = paint('←/→ or ↑/↓ to move · enter to confirm · esc to cancel', 'dim');

function optionLabel(option) {
  return option.label;
}

/**
 * Arrow-key single-select.
 *
 * opts: { message, options: [{ value, label, description? }], initialValue?, auto? }
 * Returns the chosen value, or 'cancel' when ESC is pressed.
 * Throws CancelError on Ctrl+C.
 */
export async function select(io, opts) {
  const { message, options, initialValue } = opts;
  const initialIndex = Math.max(
    0,
    options.findIndex((o) => o.value === initialValue),
  );

  if (opts.auto || !io.isTTY) {
    return options[initialIndex]?.value ?? options[0]?.value;
  }

  let index = initialIndex;

  return withRawMode(
    io,
    () =>
      new Promise((resolve, reject) => {
        const reader = makeKeyReader(io.stdin);
        const renderer = createRenderer(io);

        const render = () => {
          const rows = options.map((option, i) => {
            const active = i === index;
            const cursor = active ? paint('›', 'cyan') : ' ';
            const label = active ? paint(optionLabel(option), 'cyan', 'bold') : optionLabel(option);
            const desc = option.description ? paint(`  ${option.description}`, 'dim') : '';
            return `  ${cursor} ${label}${desc}`;
          });
          renderer.render(
            [`${paint('❯', 'cyan')} ${message}`, ...rows, '', `  ${KEY_HINT_SELECT}`].join('\n'),
          );
        };

        const finish = (value) => {
          renderer.clear();
          io.line(`${paint('✔', 'green')} ${message}`);
          io.line(`  ${options.find((o) => o.value === value)?.label ?? value}`);
        };

        render();

        (async () => {
          for (;;) {
            const key = await reader.next();
            if (key.type === 'up') index = (index - 1 + options.length) % options.length;
            else if (key.type === 'down') index = (index + 1) % options.length;
            else if (key.type === 'home') index = 0;
            else if (key.type === 'end') index = options.length - 1;
            else if (key.type === 'enter') {
              const value = options[index]?.value;
              finish(value);
              resolve(value);
              return;
            } else if (key.type === 'esc') {
              renderer.clear();
              resolve('cancel');
              return;
            } else if (key.type === 'ctrl-c') {
              renderer.clear();
              reject(new CancelError());
              return;
            } else {
              continue; // space/backspace/unknown — ignore in select
            }
            render();
          }
        })();
      }),
  );
}

/**
 * Arrow-key checkbox multi-select.
 *
 * opts: { message, options, initialValues?, min?, auto? }
 * Returns an array of chosen values, or 'cancel' on ESC.
 * Throws CancelError on Ctrl+C.
 */
export async function multiselect(io, opts) {
  const { message, options, initialValues = [], min = 0 } = opts;
  const selected = new Set(
    options.filter((o) => initialValues.includes(o.value)).map((o) => options.indexOf(o)),
  );

  if (opts.auto || !io.isTTY) {
    return options.filter((_, i) => selected.has(i)).map((o) => o.value);
  }

  let index = 0;
  let flash = null;

  return withRawMode(
    io,
    () =>
      new Promise((resolve, reject) => {
        const reader = makeKeyReader(io.stdin);
        const renderer = createRenderer(io);

        const render = () => {
          const rows = options.map((option, i) => {
            const active = i === index;
            const cursor = active ? paint('›', 'cyan') : ' ';
            const box = selected.has(i) ? paint('◉', 'cyan') : paint('○', 'dim');
            const label = active ? paint(optionLabel(option), 'bold') : optionLabel(option);
            const desc = option.description ? paint(`  ${option.description}`, 'dim') : '';
            return `  ${cursor} ${box} ${label}${desc}`;
          });
          const footer = flash ?? `  ${KEY_HINT_MULTI}`;
          renderer.render([`${paint('❯', 'cyan')} ${message}`, ...rows, '', footer].join('\n'));
        };

        const finish = (values) => {
          renderer.clear();
          io.line(`${paint('✔', 'green')} ${message}`);
          if (values.length === 0) io.line(`  ${paint('(none selected)', 'dim')}`);
          else
            io.line(
              `  ${options
                .filter((o) => values.includes(o.value))
                .map((o) => o.label)
                .join(', ')}`,
            );
        };

        render();

        (async () => {
          for (;;) {
            const key = await reader.next();
            if (key.type === 'up') {
              index = (index - 1 + options.length) % options.length;
              flash = null;
            } else if (key.type === 'down') {
              index = (index + 1) % options.length;
              flash = null;
            } else if (key.type === 'space') {
              if (selected.has(index)) selected.delete(index);
              else selected.add(index);
              flash = null;
            } else if (key.type === 'enter') {
              const values = options.filter((_, i) => selected.has(i)).map((o) => o.value);
              if (values.length < min) {
                flash = paint(
                  `  ⚠ Select at least ${min} option${min > 1 ? 's' : ''} to continue`,
                  'yellow',
                );
              } else {
                finish(values);
                resolve(values);
                return;
              }
            } else if (key.type === 'esc') {
              renderer.clear();
              resolve('cancel');
              return;
            } else if (key.type === 'ctrl-c') {
              renderer.clear();
              reject(new CancelError());
              return;
            }
            render();
          }
        })();
      }),
  );
}

/**
 * Yes/No confirmation.
 *
 * opts: { message, initial?, auto? }
 * Returns boolean, or 'cancel' on ESC. Throws CancelError on Ctrl+C.
 */
export async function confirm(io, opts) {
  const { message, initial = true } = opts;

  if (opts.auto || !io.isTTY) {
    return initial;
  }

  let index = initial ? 0 : 1;
  const labels = ['Yes', 'No'];

  return withRawMode(
    io,
    () =>
      new Promise((resolve, reject) => {
        const reader = makeKeyReader(io.stdin);
        const renderer = createRenderer(io);

        const render = () => {
          const rows = labels.map((label, i) => {
            const active = i === index;
            const cursor = active ? paint('›', 'cyan') : ' ';
            const styled = active ? paint(label, 'cyan', 'bold') : label;
            return `  ${cursor} ${styled}`;
          });
          renderer.render(
            [`${paint('❯', 'cyan')} ${message}`, ...rows, '', `  ${KEY_HINT_CONFIRM}`].join('\n'),
          );
        };

        const finish = (value) => {
          renderer.clear();
          io.line(`${paint('✔', 'green')} ${message}`);
          io.line(`  ${labels[value ? 0 : 1]}`);
        };

        render();

        (async () => {
          for (;;) {
            const key = await reader.next();
            if (key.type === 'up' || key.type === 'left') {
              index = (index - 1 + 2) % 2;
            } else if (key.type === 'down' || key.type === 'right') {
              index = (index + 1) % 2;
            } else if (key.type === 'enter') {
              const value = index === 0;
              finish(value);
              resolve(value);
              return;
            } else if (key.type === 'esc') {
              renderer.clear();
              resolve('cancel');
              return;
            } else if (key.type === 'ctrl-c') {
              renderer.clear();
              reject(new CancelError());
              return;
            }
            render();
          }
        })();
      }),
  );
}

/**
 * Free-text input. Supports masking (for API keys), validation, and
 * backspace editing.
 *
 * opts: { message, placeholder?, validate?, mask?, auto? }
 * Returns the trimmed string, or 'cancel' on ESC.
 * Throws CancelError on Ctrl+C.
 */
export async function text(io, opts) {
  const { message, placeholder = '', validate, mask = false } = opts;

  if (opts.auto || !io.isTTY) {
    return '';
  }

  let value = '';
  let error = null;

  return withRawMode(
    io,
    () =>
      new Promise((resolve, reject) => {
        const reader = makeKeyReader(io.stdin);
        const renderer = createRenderer(io);

        const visible = (v) => (mask ? '•'.repeat(v.length) : v);

        const render = () => {
          const input =
            value.length > 0
              ? `${visible(value)}${paint('▌', 'cyan')}`
              : paint(placeholder || 'type here', 'dim');
          const rows = [`${paint('❯', 'cyan')} ${message}`, `  ${input}`];
          if (error) rows.push(`  ${paint(`⚠ ${error}`, 'yellow')}`);
          rows.push('', `  ${paint('enter to confirm · esc to cancel', 'dim')}`);
          renderer.render(rows.join('\n'));
        };

        const finish = () => {
          renderer.clear();
          const shown = mask ? paint(`•`.repeat(value.length), 'dim') : value;
          io.line(`${paint('✔', 'green')} ${message}`);
          io.line(`  ${shown}`);
        };

        render();

        (async () => {
          for (;;) {
            const key = await reader.next();
            if (key.type === 'char' || key.type === 'space') {
              const char = key.type === 'space' ? ' ' : key.char;
              if (char && !char.match(/[\x00-\x1f]/)) value += char;
              error = null;
            } else if (key.type === 'backspace') {
              value = value.slice(0, -1);
              error = null;
            } else if (key.type === 'enter') {
              const trimmed = value.trim();
              if (validate) {
                const err = await validate(trimmed);
                if (err) {
                  error = err;
                  render();
                  continue;
                }
              }
              finish();
              resolve(trimmed);
              return;
            } else if (key.type === 'esc') {
              renderer.clear();
              resolve('cancel');
              return;
            } else if (key.type === 'ctrl-c') {
              renderer.clear();
              reject(new CancelError());
              return;
            } else {
              continue;
            }
            render();
          }
        })();
      }),
  );
}
