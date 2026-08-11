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
 * Terminal rendering helpers: ANSI colors, box drawing, step headers,
 * spinners, the banner, and full-screen step pages. All functions take
 * an `io` object so they can be exercised by tests without a real
 * terminal.
 */

const C = {
  reset: '\x1b[0m',
  bold: '\x1b[1m',
  dim: '\x1b[2m',
  italic: '\x1b[3m',
  underline: '\x1b[4m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  magenta: '\x1b[35m',
  cyan: '\x1b[36m',
  white: '\x1b[37m',
  bgRed: '\x1b[41m',
  bgGreen: '\x1b[42m',
  bgBlue: '\x1b[44m',
  bgCyan: '\x1b[46m',
  bgBlack: '\x1b[40m',
  // 256-color palette
  sky: '\x1b[38;5;75m',
  teal: '\x1b[38;5;80m',
  lime: '\x1b[38;5;113m',
  gold: '\x1b[38;5;220m',
  coral: '\x1b[38;5;209m',
  lavender: '\x1b[38;5;183m',
  gray: '\x1b[38;5;245m',
  darkGray: '\x1b[38;5;238m',
};

/**
 * Wrap text in ANSI codes. Unknown color names are ignored.
 * Colors can be disabled via NO_COLOR, FORCE_COLOR=0, or setColorEnabled(false).
 */
let colorEnabled = process.env.NO_COLOR === undefined && process.env.FORCE_COLOR !== '0';

export function setColorEnabled(enabled) {
  colorEnabled = enabled;
}

export function paint(text, ...colors) {
  if (!colorEnabled) return text;
  return colors.map((co) => C[co] ?? '').join('') + text + C.reset;
}

/** Strip ANSI escape codes — used for measuring rendered width. */
function stripAnsi(str) {
  return str.replace(/\x1b\[[0-9;]*m/g, '');
}

export function ok(io, msg) {
  io.line(`  ${paint('✓', 'green')} ${msg}`);
}

export function warn(io, msg) {
  io.line(`  ${paint('⚠', 'yellow')} ${msg}`);
}

export function fail(io, msg) {
  io.line(`  ${paint('✗', 'red')} ${msg}`);
}

export function info(io, msg) {
  io.line(`  ${paint('ℹ', 'sky')} ${msg}`);
}

/** Print a box-drawn panel. `lines` may contain pre-painted text. */
export function box(io, title, lines, opts = {}) {
  const color = opts.color ?? 'cyan';
  const minWidth = opts.minWidth ?? 50;
  const titleLen = title ? title.length + 4 : 0;
  const maxContent = Math.max(...lines.map((l) => stripAnsi(l).length), titleLen, minWidth);
  const width = maxContent + 4;

  const tl = '╔';
  const tr = '╗';
  const bl = '╚';
  const br = '╝';
  const h = '═';
  const v = '║';

  let out = '';
  if (title) {
    const titlePad = Math.max(0, width - title.length - 2);
    out += `  ${paint(`${tl}${h} `, color)}${paint(title, 'bold')}${' '.repeat(titlePad)}${paint(` ${h}${tr}`, color)}\n`;
  } else {
    out += `  ${paint(`${tl}${h.repeat(width)}`, color)}${paint(tr, color)}\n`;
  }

  for (const l of lines) {
    const stripped = stripAnsi(l);
    const pad = Math.max(0, width - stripped.length - 2);
    out += `  ${paint(v, color)} ${l}${' '.repeat(pad)} ${paint(v, color)}\n`;
  }

  out += `  ${paint(`${bl}${h.repeat(width)}`, color)}${paint(br, color)}`;
  io.line(out);
}

/**
 * Print a "note" panel — a compact informational callout used for
 * short explainers between steps.
 */
export function note(io, title, lines, color = 'sky') {
  box(io, title, lines, { color, minWidth: 44 });
}

/** ASCII gradient banner for the top of the wizard. */
export function printBanner(io) {
  const logo = [
    '  _   _  _   _  ___  ___  ___  ___  ___ ',
    ' | | | || \\\\ | || __|| _ \\\\/ __|| __|| _ \\\\',
    ' | |_| ||  \\\\| || _| |   /\\\\__ \\\\| _| |   /',
    '  \\\\___/ |_|\\\\_||___||_|_\\\\|___/|___||_|_\\\\',
    '                                         ',
    '         A I  ·  T R A D I N G  ·  P L A T F O R M',
  ];

  const gradientColors = ['cyan', 'sky', 'teal', 'lime', 'gold', 'coral'];

  io.line();
  for (let i = 0; i < logo.length; i++) {
    const color = gradientColors[i % gradientColors.length];
    io.line(paint(logo[i], color));
  }
  io.line();
  io.line(paint('  The open-source, single-user BYOK AI trading platform', 'dim'));
  io.line(paint('  Apache 2.0 Licensed · Built with Next.js, Drizzle, pgvector', 'dim'));
  io.line();
}

/** Animated terminal spinner. Returns a stop() function. */
export function startSpinner(io, msg) {
  const frames = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏'];
  let i = 0;
  io.stdout.write(`  ${paint(frames[0], 'cyan')} ${msg}...`);
  const interval = setInterval(() => {
    io.stdout.write(`\r  ${paint(frames[i % frames.length], 'cyan')} ${msg}...`);
    i++;
  }, 80);
  return {
    stop(successMsg = null) {
      clearInterval(interval);
      io.stdout.write(`\r${' '.repeat(60)}\r`);
      if (successMsg) ok(io, successMsg);
    },
  };
}

/**
 * Print a step header: `[n/total] Title` with a divider line.
 * The heading is emitted above any prompt output so the wizard
 * always reads top-to-bottom.
 */
export function stepHeader(io, { index, total, title }) {
  io.line();
  io.line(`  ${paint(`[${index}/${total}]`, 'dim')} ${paint(title, 'bold', 'cyan')}`);
  io.line(`  ${paint('─'.repeat(52), 'darkGray')}`);
}

/**
 * Page-mode rendering: full-screen step pages.
 *
 * In page mode each step owns the whole screen: beginPage clears it and
 * draws a fixed header (brand, step chip, progress bar, title), the
 * step's content prints below, and endPage closes with a divider and a
 * contextual hint. The cursor is hidden for the duration and restored
 * at the end. Line mode (non-TTY, --json) keeps the classic scrolling
 * transcript so piped output stays readable.
 */

const PAGE_CLEAR = '\x1b[2J\x1b[3J\x1b[H'; // clear screen + scrollback, home cursor
const CURSOR_HIDE = '\x1b[?25l';
const CURSOR_SHOW = '\x1b[?25h';

/** Restore the terminal cursor (used on every exit path). */
export function showCursor(io) {
  io.write(CURSOR_SHOW);
}

function hideCursor(io) {
  io.write(CURSOR_HIDE);
}

/** ANSI progress bar: filled █ cells followed by empty ░ cells. */
function progressBar(fraction, cells = 12) {
  const clamped = Math.max(0, Math.min(1, fraction));
  const filled = Math.round(clamped * cells);
  const bar = '█'.repeat(filled) + '░'.repeat(cells - filled);
  return paint(bar, filled >= cells ? 'green' : 'cyan');
}

function pageWidth(io) {
  return io.stdout?.columns ?? 80;
}

function pageRule(io) {
  return '─'.repeat(Math.min(Math.max(pageWidth(io) - 4, 20), 64));
}

/**
 * Begin a full-screen step page. Returns null when pageMode is off so
 * callers can fall back to line-based output.
 */
export function beginPage(io, { pageMode, step, total, title }) {
  if (!pageMode) return null;
  io.write(PAGE_CLEAR);
  hideCursor(io);
  io.line();
  io.line(
    `  ${paint('◆ HamaFX-Ai Setup', 'bold', 'cyan')}${paint('  ·  ', 'dim')}${paint(`Step ${step} of ${total}`, 'dim')}   ${progressBar(step / total)}`,
  );
  io.line();
  io.line(`  ${paint(title, 'bold')}`);
  io.line(`  ${paint(pageRule(io), 'darkGray')}`);
  io.line();
}

/** Close a step page with a divider, contextual hint, and cursor restore. */
export function endPage(io, { hint = '' } = {}) {
  io.line();
  io.line(`  ${paint(pageRule(io), 'darkGray')}`);
  if (hint) io.line(`  ${paint(hint, 'dim')}`);
  io.line();
  showCursor(io);
}

/**
 * Render a two-column feature comparison as painted lines — used by the
 * mode page. Each side is [icon, text] rows; over-long cells are
 * truncated. Pure function so it is unit-testable.
 */
export function renderComparison({ leftTitle, rightTitle, left, right, width = 60 }) {
  const gap = 4;
  const half = Math.max(Math.floor((width - gap) / 2), 16);

  const mark = (icon) =>
    icon === '✓' ? paint('✓', 'green') : icon === '!' ? paint('!', 'yellow') : paint('✗', 'red');
  const cell = (icon, text, w) => {
    const raw = `${icon} ${text}`;
    const fitted = raw.length > w ? `${raw.slice(0, w - 1)}…` : raw;
    return `${mark(icon)}${paint(fitted.slice(icon.length))}`;
  };
  const fitTitle = (t, w) => (t.length > w ? `${t.slice(0, w - 1)}…` : t);
  const padTo = (s, w) => `${s}${' '.repeat(Math.max(0, w - stripAnsi(s).length))}`;

  const rows = Math.max(left.length, right.length);
  const out = [];
  out.push(
    `${padTo(paint(fitTitle(leftTitle, half), 'bold', 'cyan'), half)}${' '.repeat(gap)}${paint(fitTitle(rightTitle, half), 'bold', 'teal')}`,
  );
  out.push(
    `${paint('─'.repeat(half), 'darkGray')}${' '.repeat(gap)}${paint('─'.repeat(half), 'darkGray')}`,
  );
  for (let i = 0; i < rows; i++) {
    const l = left[i] ? padTo(cell(left[i][0], left[i][1], half), half) : ' '.repeat(half);
    const r = right[i] ? cell(right[i][0], right[i][1], half) : '';
    out.push(`${l}${' '.repeat(gap)}${r}`);
  }
  return out;
}
