// SPDX-License-Identifier: Apache-2.0

import { describe, expect, it } from 'vitest';

import {
  beginPage,
  endPage,
  renderComparison,
  setColorEnabled,
} from '../../scripts/setup/lib/ui.mjs';

setColorEnabled(true);

/** Fake TTY stdout: exposes isTTY/columns/rows and captures writes. */
function fakeTtyStdout() {
  const out: {
    isTTY: boolean;
    columns: number;
    rows: number;
    text: string;
    write: (s: string) => void;
  } = {
    isTTY: true,
    columns: 80,
    rows: 24,
    text: '',
    write: (s: string) => {
      out.text += s;
    },
  };
  return out;
}

function makePageIO() {
  const stdout = fakeTtyStdout();
  const io = {
    stdout,
    write: (s: string) => stdout.write(s),
    line: (s = '') => stdout.write(`${s}\n`),
    isTTY: true,
  };
  return { io, stdout };
}

describe('beginPage', () => {
  it('returns null when page mode is off (line-mode fallback)', () => {
    const { io } = makePageIO();
    const page = beginPage(io, { pageMode: false, step: 1, total: 7, title: 'T' });
    expect(page).toBeNull();
    expect(io.stdout.text).toBe('');
  });

  it('clears the screen and draws the header frame', () => {
    const { io, stdout } = makePageIO();
    beginPage(io, { pageMode: true, step: 2, total: 7, title: 'Choose your setup mode' });

    expect(stdout.text).toContain('\x1b[2J\x1b[3J\x1b[H'); // screen + scrollback cleared
    expect(stdout.text).toContain('\x1b[?25l'); // cursor hidden
    expect(stdout.text).toContain('◆ HamaFX-Ai Setup');
    expect(stdout.text).toContain('Step 2 of 7');
    expect(stdout.text).toContain('Choose your setup mode');
    expect(stdout.text).toContain('█'); // progress bar filled cells
    expect(stdout.text).toContain('░'); // progress bar empty cells
  });
});

describe('endPage', () => {
  it('closes the page with a divider, hint, and cursor restore', () => {
    const { io, stdout } = makePageIO();
    beginPage(io, { pageMode: true, step: 1, total: 7, title: 'T' });
    endPage(io, { hint: 'Keys are optional' });

    expect(stdout.text).toContain('─'); // divider
    expect(stdout.text).toContain('Keys are optional');
    expect(stdout.text).toContain('\x1b[?25h'); // cursor shown again
  });
});

describe('renderComparison', () => {
  it('renders two titled columns with markers and a divider', () => {
    const lines = renderComparison({
      leftTitle: 'Simple',
      rightTitle: 'Full',
      left: [['✓', 'thing A']],
      right: [
        ['✗', 'thing B'],
        ['!', 'warn'],
      ],
      width: 40,
    });

    // 2 header lines (titles + divider) + 2 rows (right column is longer).
    expect(lines.length).toBe(4);
    expect(lines[0]).toContain('Simple');
    expect(lines[0]).toContain('Full');
    expect(lines[1]).toContain('─');
    expect(lines[2]).toContain('✓');
    expect(lines[2]).toContain('thing A');
    expect(lines[2]).toContain('✗');
    expect(lines[2]).toContain('thing B');
    expect(lines[3]).toContain('!');
    expect(lines[3]).toContain('warn');
  });

  it('truncates cells that exceed the column width', () => {
    const lines = renderComparison({
      leftTitle: 'L',
      rightTitle: 'R',
      left: [['✓', 'this is a very long feature name that should be clipped']],
      right: [],
      width: 40,
    });
    const stripped = lines[2].replace(/\x1b\[[0-9;]*m/g, '');
    expect(stripped.length).toBeLessThanOrEqual(40);
    expect(stripped).toContain('…');
  });

  it('keeps every mode-page row inside its column', () => {
    const lines = renderComparison({
      leftTitle: 'Simple — lightweight',
      left: [
        ['✓', 'PGlite embedded · no Docker'],
        ['✓', 'Fast startup · hot reload'],
        ['✓', 'Full web app + AI chat'],
        ['✗', 'No vector search (RAG)'],
        ['✗', 'No live market data'],
      ],
      rightTitle: 'Full — Docker stack',
      right: [
        ['✓', 'Postgres 16 + pgvector'],
        ['✓', 'Worker · live market data'],
        ['✓', 'Langfuse observability'],
        ['!', 'First build ~3–5 min'],
      ],
      width: 60,
    });
    for (const line of lines) {
      const stripped = line.replace(/\x1b\[[0-9;]*m/g, '');
      expect(stripped.length, `row fits in 60 columns: "${stripped}"`).toBeLessThanOrEqual(60);
    }
  });
});
