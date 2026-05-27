'use client';

// TextPart — light Markdown renderer for the assistant's text segments.
//
// We deliberately do not pull in `react-markdown` or `marked`: the model is
// instructed to emit a small, predictable subset (headings → no, code
// blocks → yes, bold/italic, inline code, bullet/numbered lists, links).
// Implementing those by hand keeps the bundle small and side-steps an
// HTML-injection sink — every output node is constructed via React, never
// dangerouslySetInnerHTML.
//
// Supported syntax:
//   **bold**             → <strong>
//   *italic* / _italic_  → <em>
//   `inline code`        → <code>
//   ```...```            → fenced code block with copy-to-clipboard button
//   - bullet line        → <ul><li>
//   1. numbered line     → <ol><li>
//   [text](url)          → <a> (only http(s) links accepted)
//
// Anything unrecognized renders as plain text (preserving newlines via
// whitespace-pre-line).

import { Check, Copy } from 'lucide-react';
import { useState, type ReactNode } from 'react';

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
  | { kind: 'code'; lang: string; text: string }
  | { kind: 'list'; ordered: boolean; items: string[] };

function parseBlocks(text: string): Block[] {
  const blocks: Block[] = [];
  const lines = text.split('\n');
  let i = 0;

  while (i < lines.length) {
    const line = lines[i] ?? '';

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
      !/^\s*\d+\.\s+/.test(lines[i] ?? '')
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
              <ListTag key={idx} className={block.ordered ? 'list-decimal pl-5' : ''}>
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
//
// Strategy: walk the string char by char, accumulating a plain-text run,
// and consume whichever inline construct opens next. Each construct hands
// back its closing index; we recurse into its content for nested inlines.

function renderInline(text: string): ReactNode {
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
        out.push(<strong key={key++}>{renderInline(text.slice(i + 2, end))}</strong>);
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
        out.push(<em key={key++}>{renderInline(text.slice(i + 1, end))}</em>);
        i = end + 1;
        continue;
      }
    }

    // Link: [label](url)
    if (ch === '[') {
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
                {renderInline(label)}
              </a>,
            );
            i = urlEnd + 1;
            continue;
          }
        }
      }
    }

    buf += ch;
    i += 1;
  }

  flush();
  return out.length === 1 ? out[0] : <>{out}</>;
}

// ---------------------------------------------------------------------------
// Code block with copy button. Static — no syntax highlighting; the model
// rarely emits long blocks and bringing in shiki/prism would balloon the
// bundle.

function CodeBlock({ code, lang }: { code: string; lang: string }) {
  const [copied, setCopied] = useState(false);

  function copy() {
    void navigator.clipboard.writeText(code);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }

  return (
    <div
      className={cn(
        'border-divider bg-bg-elev-1/60 relative my-2 overflow-hidden rounded-xl border',
      )}
    >
      <div className="border-divider/60 bg-bg-elev-2/60 flex items-center justify-between border-b px-3 py-2">
        <span className="text-fg-subtle font-mono text-[10px] uppercase tracking-wider">
          {lang || 'code'}
        </span>
        <button
          type="button"
          onClick={copy}
          aria-label={copied ? 'Copied' : 'Copy code'}
          className="text-fg-muted hover:text-fg inline-flex items-center gap-1 rounded-md px-2 py-1 text-[10px] font-medium transition-colors"
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
      <pre className="scrollbar-hide overflow-x-auto p-3 font-mono text-[11px] leading-relaxed">
        <code>{code}</code>
      </pre>
    </div>
  );
}
