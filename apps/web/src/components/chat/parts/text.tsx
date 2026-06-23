'use client';

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

// TextPart — light Markdown renderer for the assistant's text segments.
//
// We deliberately do not pull in `react-markdown` or `marked`: the model is
// instructed to emit a small, predictable subset (headings, code
// blocks, bold/italic, inline code, bullet/numbered lists, links, blockquotes, hrs).
// Implementing those by hand keeps the bundle small and side-steps an
// HTML-injection sink — every output node is constructed via React, never
// dangerouslySetInnerHTML.

import { Check, Copy } from 'lucide-react';
import { useState, type ReactNode, useCallback } from 'react';
import { useCopied } from '@/hooks/use-copied';

import { cn } from '@/lib/cn';

interface TextPartProps {
  text: string;
  role: 'user' | 'assistant';
}

export function TextPart({ text, role }: TextPartProps) {
  // User bubbles never need markdown formatting — the user typed it
  // verbatim and we should render it the same way they typed it.
  if (role === 'user') {
    return (
      <p className="whitespace-pre-line text-sm leading-relaxed">{text}</p>
    );
  }

  return <div className="md-prose text-sm">{renderMarkdown(text)}</div>;
}

// ---------------------------------------------------------------------------
// Block-level parsing.

type Block =
  | { kind: 'paragraph'; text: string }
  | { kind: 'heading'; level: number; text: string }
  | { kind: 'blockquote'; text: string }
  | { kind: 'hr' }
  | { kind: 'code'; lang: string; text: string }
  | { kind: 'list'; ordered: boolean; items: string[] };

function parseBlocks(text: string): Block[] {
  const blocks: Block[] = [];
  const lines = text.split('\n');
  let i = 0;

  while (i < lines.length) {
    const line = lines[i] ?? '';

    // Horizontal rule: --- or ***
    if (/^\s*(?:-{3,}|\*{3,})\s*$/.test(line)) {
      blocks.push({ kind: 'hr' });
      i += 1;
      continue;
    }

    // Heading: #, ##, ###
    const headingMatch = /^\s*(#{1,3})\s+(.*)$/.exec(line);
    if (headingMatch) {
      const level = headingMatch[1]?.length ?? 1;
      blocks.push({ kind: 'heading', level, text: headingMatch[2] ?? '' });
      i += 1;
      continue;
    }

    // Blockquote: collect consecutive blockquote lines starting with >
    if (/^\s*>\s*(.*)$/.test(line)) {
      const buf: string[] = [];
      while (i < lines.length) {
        const cur = lines[i] ?? '';
        const m = /^\s*>\s*(.*)$/.exec(cur);
        if (!m) break;
        buf.push(m[1] ?? '');
        i += 1;
      }
      blocks.push({ kind: 'blockquote', text: buf.join('\n') });
      continue;
    }

    // Fenced code block: ``` or ```lang
    const fenceMatch = /^```(\w*)\s*$/.exec(line);
    if (fenceMatch) {
      const lang = fenceMatch[1] ?? '';
      const buf: string[] = [];
      i += 1;
      while (i < lines.length && !/^```\s*$/.test(lines[i] ?? '')) {
        buf.push(lines[i] ?? '');
        i += 1;
      }
      i += 1; // skip closing fence
      blocks.push({ kind: 'code', lang, text: buf.join('\n') });
      continue;
    }

    // Lists. Treat consecutive bullet/numbered lines as one block.
    const bulletMatch = /^\s*[-*]\s+(.*)$/.exec(line);
    const orderedMatch = /^\s*\d+\.\s+(.*)$/.exec(line);
    if (bulletMatch || orderedMatch) {
      const ordered = Boolean(orderedMatch);
      const items: string[] = [];
      while (i < lines.length) {
        const cur = lines[i] ?? '';
        const m = ordered ? /^\s*\d+\.\s+(.*)$/.exec(cur) : /^\s*[-*]\s+(.*)$/.exec(cur);
        if (!m) break;
        items.push(m[1] ?? '');
        i += 1;
      }
      blocks.push({ kind: 'list', ordered, items });
      continue;
    }

    // Paragraph: collect contiguous non-empty lines.
    if (line.trim() === '') {
      i += 1;
      continue;
    }
    const paraBuf: string[] = [];
    while (
      i < lines.length &&
      lines[i]?.trim() !== '' &&
      !/^```/.test(lines[i] ?? '') &&
      !/^\s*[-*]\s+/.test(lines[i] ?? '') &&
      !/^\s*\d+\.\s+/.test(lines[i] ?? '') &&
      !/^\s*(?:-{3,}|\*{3,})\s*$/.test(lines[i] ?? '') &&
      !/^\s*(#{1,3})\s+/.test(lines[i] ?? '') &&
      !/^\s*>\s*/.test(lines[i] ?? '')
    ) {
      paraBuf.push(lines[i] ?? '');
      i += 1;
    }
    if (paraBuf.length > 0) {
      blocks.push({ kind: 'paragraph', text: paraBuf.join('\n') });
    }
  }

  return blocks;
}

function renderMarkdown(text: string): ReactNode {
  const blocks = parseBlocks(text);
  return (
    <>
      {blocks.map((block, idx) => {
        switch (block.kind) {
          case 'heading': {
            const HeadingTag = `h${block.level}` as 'h1' | 'h2' | 'h3';
            const sizeClass =
              block.level === 1
                ? 'text-lg font-bold mt-4 mb-2'
                : block.level === 2
                  ? 'text-base font-semibold mt-3 mb-1.5'
                  : 'text-sm font-medium mt-2 mb-1';
            return (
              <HeadingTag key={idx} className={sizeClass}>
                {renderInline(block.text)}
              </HeadingTag>
            );
          }
          case 'blockquote':
            return (
              <blockquote
                key={idx}
                className="border-brand/40 text-fg-muted my-2 border-l-3 pl-3 italic"
              >
                {renderInline(block.text)}
              </blockquote>
            );
          case 'hr':
            return <hr key={idx} className="border-divider my-4" />;
          case 'paragraph':
            return (
              <p key={idx} className="whitespace-pre-line leading-relaxed">
                {renderInline(block.text)}
              </p>
            );
          case 'code':
            return <CodeBlock key={idx} lang={block.lang} code={block.text} />;
          case 'list': {
            const ListTag = block.ordered ? 'ol' : 'ul';
            return (
              <ListTag key={idx} className={block.ordered ? 'list-decimal pl-5' : 'list-disc pl-5'}>
                {block.items.map((item, j) => (
                  <li key={j}>{renderInline(item)}</li>
                ))}
              </ListTag>
            );
          }
        }
      })}
    </>
  );
}

// ---------------------------------------------------------------------------
// Inline parsing — bold / italic / inline code / links.

function renderInline(text: string, inLink = false): ReactNode {
  const out: ReactNode[] = [];
  let buf = '';
  let i = 0;
  let key = 0;

  const flush = () => {
    if (buf) {
      out.push(buf);
      buf = '';
    }
  };

  while (i < text.length) {
    const ch = text[i];
    const next = text[i + 1];

    // Escape character: \ followed by any char
    if (ch === '\\' && i + 1 < text.length) {
      buf += text[i + 1];
      i += 2;
      continue;
    }

    // Inline code: `…`
    if (ch === '`') {
      const end = text.indexOf('`', i + 1);
      if (end > i) {
        flush();
        out.push(
          <code key={key++}>{text.slice(i + 1, end)}</code>,
        );
        i = end + 1;
        continue;
      }
    }

    // Bold: **…**
    if (ch === '*' && next === '*') {
      const end = text.indexOf('**', i + 2);
      if (end > i) {
        flush();
        out.push(<strong key={key++}>{renderInline(text.slice(i + 2, end), inLink)}</strong>);
        i = end + 2;
        continue;
      }
    }

    // Italic: *…* (single asterisk) or _…_
    if ((ch === '*' || ch === '_') && next !== ch) {
      const end = text.indexOf(ch, i + 1);
      // Don't grab if the inner span is empty or has a newline.
      if (end > i + 1 && !text.slice(i + 1, end).includes('\n')) {
        flush();
        out.push(<em key={key++}>{renderInline(text.slice(i + 1, end), inLink)}</em>);
        i = end + 1;
        continue;
      }
    }

    // Link: [label](url)
    if (ch === '[' && !inLink) {
      const close = text.indexOf(']', i + 1);
      if (close > i && text[close + 1] === '(') {
        const urlEnd = text.indexOf(')', close + 2);
        if (urlEnd > close) {
          const url = text.slice(close + 2, urlEnd).trim();
          if (/^https?:\/\//i.test(url)) {
            flush();
            const label = text.slice(i + 1, close);
            out.push(
              <a
                key={key++}
                href={url}
                target="_blank"
                rel="noopener noreferrer"
                className="text-brand underline-offset-2 hover:underline"
              >
                {renderInline(label, true)}
              </a>,
            );
            i = urlEnd + 1;
            continue;
          }
        }
      }
    }

    buf += ch ?? '';
    i += 1;
  }

  flush();
  return out.length === 1 ? out[0] : <>{out}</>;
}

// ---------------------------------------------------------------------------
// Code block with copy button and optional truncation.

function CodeBlock({ code, lang }: { code: string; lang: string }) {
  const [copied, triggerCopy] = useCopied(1500);
  const [expanded, setExpanded] = useState(false);

  const copy = useCallback(() => {
    void navigator.clipboard.writeText(code);
    triggerCopy();
  }, [code, triggerCopy]);

  const lines = code.split('\n');
  const shouldTruncate = lines.length > 100;
  const displayCode = shouldTruncate && !expanded ? lines.slice(0, 100).join('\n') : code;

  return (
    <div
      className={cn(
        'border-divider bg-bg-elev-1/60 relative my-2 overflow-hidden rounded-xl border',
      )}
    >
      <div className="border-divider/60 bg-bg-elev-2/60 flex items-center justify-between border-b px-3 py-2">
        <span className="text-fg-subtle font-mono text-caption uppercase tracking-wider">
          {lang || 'code'}
        </span>
        <button
          type="button"
          onClick={copy}
          aria-label={copied ? 'Copied' : 'Copy code'}
          className="text-fg-muted hover:text-fg inline-flex items-center gap-1 rounded-md px-2 py-1 text-caption font-medium transition-colors"
        >
          {copied ? (
            <>
              <Check className="text-bull size-3" /> copied
            </>
          ) : (
            <>
              <Copy className="size-3" /> copy
            </>
          )}
        </button>
      </div>
      <pre className="scrollbar-hide overflow-x-auto p-3 font-mono text-body-sm leading-relaxed">
        <code>{displayCode}</code>
      </pre>
      {shouldTruncate && (
        <div className="border-divider/40 bg-bg-elev-2/30 flex justify-center border-t py-1.5">
          <button
            type="button"
            onClick={() => setExpanded(!expanded)}
            className="text-brand hover:text-brand-hover text-caption font-semibold transition-colors"
          >
            {expanded ? 'Collapse code' : `Show all ${lines.length} lines`}
          </button>
        </div>
      )}
    </div>
  );
}
