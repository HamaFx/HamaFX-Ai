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
  exportFilename,
  renderThreadToMarkdown,
  type ExportMessage,
  type ExportThread,
} from '../src/lib/thread-export';

const NOW_ISO = '2026-06-20T12:00:00.000Z';
const NOW = new Date(NOW_ISO);

const THREAD: ExportThread = {
  id: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890',
  title: 'XAUUSD bias check',
  pinnedSymbol: 'XAUUSD',
  createdAt: '2026-06-20T08:00:00.000Z',
  updatedAt: NOW_ISO,
};

describe('renderThreadToMarkdown — header', () => {
  it('renders the title as the H1', () => {
    const md = renderThreadToMarkdown(THREAD, [], { exportedAt: NOW_ISO });
    expect(md.startsWith('# XAUUSD bias check\n')).toBe(true);
  });

  it('falls back to "Untitled thread" when title is null', () => {
    const md = renderThreadToMarkdown({ ...THREAD, title: null }, [], {
      exportedAt: NOW_ISO,
    });
    expect(md.startsWith('# Untitled thread\n')).toBe(true);
  });

  it('falls back to "Untitled thread" when title is whitespace', () => {
    const md = renderThreadToMarkdown({ ...THREAD, title: '   ' }, [], {
      exportedAt: NOW_ISO,
    });
    expect(md.startsWith('# Untitled thread\n')).toBe(true);
  });

  it('includes the export timestamp and pinned symbol in the header', () => {
    const md = renderThreadToMarkdown(THREAD, [], { exportedAt: NOW_ISO });
    expect(md).toContain(`_Exported ${NOW_ISO} from HamaFX-Ai · XAUUSD_`);
  });

  it('omits the symbol suffix when no symbol is pinned', () => {
    const md = renderThreadToMarkdown(
      { ...THREAD, pinnedSymbol: null },
      [],
      { exportedAt: NOW_ISO },
    );
    expect(md).toContain('_Exported');
    expect(md).not.toContain('· XAUUSD');
  });
});

describe('renderThreadToMarkdown — empty thread', () => {
  it('returns a stub message when there are no messages', () => {
    const md = renderThreadToMarkdown(THREAD, [], { exportedAt: NOW_ISO });
    expect(md).toContain('_No messages in this thread._');
  });
});

describe('renderThreadToMarkdown — messages', () => {
  it('renders a user message with role + timestamp heading', () => {
    const msgs: ExportMessage[] = [
      {
        id: 'm1',
        role: 'user',
        createdAt: NOW_ISO,
        parts: [{ type: 'text', text: 'What is the gold bias?' }],
      },
    ];
    const md = renderThreadToMarkdown(THREAD, msgs, { exportedAt: NOW_ISO });
    expect(md).toContain(`## User · ${NOW_ISO}`);
    expect(md).toContain('What is the gold bias?');
  });

  it('renders an assistant message with role heading', () => {
    const msgs: ExportMessage[] = [
      {
        id: 'm2',
        role: 'assistant',
        createdAt: NOW_ISO,
        parts: [{ type: 'text', text: 'Bullish above 2390.' }],
      },
    ];
    const md = renderThreadToMarkdown(THREAD, msgs, { exportedAt: NOW_ISO });
    expect(md).toContain('## Assistant ·');
    expect(md).toContain('Bullish above 2390.');
  });

  it('escapes Markdown metacharacters in user-supplied text', () => {
    const msgs: ExportMessage[] = [
      {
        id: 'm1',
        role: 'user',
        createdAt: NOW_ISO,
        parts: [{ type: 'text', text: '*bold* _italic_ [link](http://x) <tag> `code`' }],
      },
    ];
    const md = renderThreadToMarkdown(THREAD, msgs, { exportedAt: NOW_ISO });
    // Each Markdown metacharacter we care about is backslash-
    // escaped so the rendered document shows the literal text.
    // We do NOT escape `(` / `)` because they are only meaningful
    // as part of a link `[text](url)` — escaping `[` and `]` is
    // sufficient to break the link syntax.
    expect(md).toContain('\\*bold\\*');
    expect(md).toContain('\\_italic\\_');
    expect(md).toContain('\\[link\\](http://x)');
    expect(md).toContain('\\<tag\\>');
    expect(md).toContain('\\`code\\`');
  });

  it('falls back to m.content when parts is empty', () => {
    const msgs: ExportMessage[] = [
      {
        id: 'm1',
        role: 'user',
        createdAt: NOW_ISO,
        content: 'Plain content fallback.',
        parts: [],
      },
    ];
    const md = renderThreadToMarkdown(THREAD, msgs, { exportedAt: NOW_ISO });
    expect(md).toContain('Plain content fallback.');
  });

  it('marks empty messages with an (empty) placeholder', () => {
    const msgs: ExportMessage[] = [
      { id: 'm1', role: 'assistant', createdAt: NOW_ISO, parts: [] },
    ];
    const md = renderThreadToMarkdown(THREAD, msgs, { exportedAt: NOW_ISO });
    expect(md).toContain('_(empty)_');
  });
});

describe('renderThreadToMarkdown — tool parts', () => {
  it('renders tool-* parts as blockquotes with tool name + JSON', () => {
    const msgs: ExportMessage[] = [
      {
        id: 'm1',
        role: 'assistant',
        createdAt: NOW_ISO,
        parts: [
          { type: 'text', text: 'The price is' },
          {
            type: 'tool-get_price',
            toolName: 'get_price',
            input: { symbol: 'XAUUSD' },
            output: { price: 2398.42 },
          },
          { type: 'text', text: 'right now.' },
        ],
      },
    ];
    const md = renderThreadToMarkdown(THREAD, msgs, { exportedAt: NOW_ISO });
    expect(md).toContain('> tool: get_price');
    expect(md).toContain('"symbol":"XAUUSD"');
    expect(md).toContain('"price":2398.42');
  });

  it('omits reasoning parts (they are not user-facing)', () => {
    const msgs: ExportMessage[] = [
      {
        id: 'm1',
        role: 'assistant',
        createdAt: NOW_ISO,
        parts: [
          { type: 'reasoning', text: 'internal model thoughts' },
          { type: 'text', text: 'Visible answer.' },
        ],
      },
    ];
    const md = renderThreadToMarkdown(THREAD, msgs, { exportedAt: NOW_ISO });
    expect(md).not.toContain('internal model thoughts');
    expect(md).toContain('Visible answer.');
  });

  it('renders citation warnings as blockquotes with bold label', () => {
    const msgs: ExportMessage[] = [
      {
        id: 'm1',
        role: 'assistant',
        createdAt: NOW_ISO,
        parts: [
          { type: 'data-citation-warning', reason: 'fabricated price' },
        ],
      },
    ];
    const md = renderThreadToMarkdown(THREAD, msgs, { exportedAt: NOW_ISO });
    expect(md).toContain('> **citation warning:** fabricated price');
  });
});

describe('renderThreadToMarkdown — truncation', () => {
  it('renders all messages when under the cap', () => {
    const msgs: ExportMessage[] = Array.from({ length: 5 }, (_, i) => ({
      id: `m${i}`,
      role: i % 2 === 0 ? 'user' : 'assistant',
      createdAt: NOW_ISO,
      parts: [{ type: 'text', text: `msg ${i}` }],
    }));
    const md = renderThreadToMarkdown(THREAD, msgs, {
      exportedAt: NOW_ISO,
      maxMessages: 10,
    });
    expect(md).toContain('msg 0');
    expect(md).toContain('msg 4');
    expect(md).not.toContain('truncated');
  });

  it('truncates and shows a trailer when over the cap', () => {
    const msgs: ExportMessage[] = Array.from({ length: 5 }, (_, i) => ({
      id: `m${i}`,
      role: i % 2 === 0 ? 'user' : 'assistant',
      createdAt: NOW_ISO,
      parts: [{ type: 'text', text: `msg ${i}` }],
    }));
    const md = renderThreadToMarkdown(THREAD, msgs, {
      exportedAt: NOW_ISO,
      maxMessages: 3,
    });
    expect(md).toContain('msg 0');
    expect(md).toContain('msg 2');
    expect(md).not.toContain('msg 3');
    expect(md).toContain('_(truncated to 3 of 5 messages)_');
  });
});

describe('exportFilename — naming', () => {
  it('builds the slug from the first 8 hex chars of the UUID', () => {
    const name = exportFilename(THREAD, NOW);
    expect(name).toBe('hamafx-a1b2c3d4-20260620.md');
  });

  it('zero-pads single-digit month and day', () => {
    const early = new Date('2026-01-05T00:00:00.000Z');
    const name = exportFilename(THREAD, early);
    expect(name).toBe('hamafx-a1b2c3d4-20260105.md');
  });
});
