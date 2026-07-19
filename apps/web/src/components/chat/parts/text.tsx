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

import {IconCheck, IconCopy} from '@tabler/icons-react';
import DOMPurify from 'dompurify';
import React, { useState, useCallback, useEffect, useMemo } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

import { useCopied } from '@/hooks/use-copied';
import { cn } from '@/lib/cn';

interface TextPartProps {
  text: string;
  role: 'user' | 'assistant';
  isStreaming?: boolean;
}

export function TextPart({ text, role, isStreaming }: TextPartProps) {
  // User bubbles never need markdown formatting — the user typed it
  // verbatim and we should render it the same way they typed it.
  if (role === 'user') {
    return (
      <p className="whitespace-pre-line text-sm leading-[1.4]">{text}</p>
    );
  }

  // While streaming, skip expensive ReactMarkdown + Shiki parsing.
  // Upgrade to full markdown rendering once streaming finishes.
  if (isStreaming) {
    return (
      <div aria-live="polite" aria-atomic="true" className="md-prose text-sm leading-[1.4] tracking-tight space-y-2 text-fg">
        {text}
        <span className="inline-block w-[2px] h-[1em] bg-fg animate-pulse ml-[1px] align-middle" />
      </div>
    );
  }

  return (
    <div aria-live="polite" aria-atomic="true" className="md-prose text-sm leading-[1.4] tracking-tight space-y-2 text-fg">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          h1: ({ children }) => <h1 className="text-base font-bold mt-4 mb-2 text-fg tracking-tight">{children}</h1>,
          h2: ({ children }) => <h2 className="text-sm font-semibold mt-3 mb-1.5 text-fg tracking-tight">{children}</h2>,
          h3: ({ children }) => <h3 className="text-sm font-medium mt-2 mb-1 text-fg">{children}</h3>,
          blockquote: ({ children }) => (
            <blockquote className="border-l-2 border-border text-fg-muted my-2 pl-3 italic text-sm leading-[1.4]">
              {children}
            </blockquote>
          ),
          hr: () => <hr className="border-divider my-4" />,
          p: ({ children }) => <p className="leading-[1.4] whitespace-pre-line my-1.5 text-fg text-sm">{children}</p>,
          ul: ({ children }) => <ul className="pl-0 list-none my-2 space-y-1">{children}</ul>,
          ol: ({ children }) => <ol className="pl-0 list-none my-2 space-y-1">{children}</ol>,
          li: ({ children }) => (
            <li className="text-fg text-sm leading-[1.4] flex gap-2">
              <span className="text-fg-subtle select-none">›</span>
              <span className="flex-1">{children}</span>
            </li>
          ),
          a: ({ href, children }) => (
            <a
              href={href}
              target="_blank"
              rel="noopener noreferrer"
              className="text-fg underline underline-offset-2 decoration-border hover:decoration-fg-subtle"
            >
              {children}
            </a>
          ),
          table: ({ children }) => (
            <div className="my-3 overflow-x-auto border border-divider rounded-sm">
              <table className="table-auto font-mono text-xs text-right border-divider w-full">
                {children}
              </table>
            </div>
          ),
          thead: ({ children }) => <thead className="bg-bg-elev-2 border-b border-border">{children}</thead>,
          tbody: ({ children }) => <tbody className="divide-y divide-divider">{children}</tbody>,
          tr: ({ children }) => <tr className="border-divider hover:bg-bg-elev-1 transition-colors">{children}</tr>,
          th: ({ children }) => <th className="px-3 py-1.5 text-left font-semibold text-fg-subtle uppercase tracking-wider border-r border-divider last:border-r-0">{children}</th>,
          td: ({ children }) => <td className="px-3 py-1.5 text-fg tabular-nums border-r border-divider last:border-r-0">{children}</td>,
          code({ className, children, ...props }) {
            const match = /language-(\w+)/.exec(className || '');
            const codeStr = String(children).replace(/\n$/, '');
            if (!match) {
              return (
                <code className="bg-bg-elev-2 text-fg-muted font-mono text-xs border border-border rounded-sm px-1.5 py-0.5" {...props}>
                  {children}
                </code>
              );
            }
            return <CodeBlock lang={match[1]!} code={codeStr} />;
          }
        }}
      >
        {text}
      </ReactMarkdown>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Shiki Dynamic Highlighting Component
// ---------------------------------------------------------------------------

// ── H-7: Shiki HTML sanitization ──────────────────────────────────

/**
 * Defense-in-depth sanitization of Shiki-generated HTML using DOMPurify.
 * Shiki produces only trusted <span>/<pre>/<code> elements with class and
 * style attributes, but this guard ensures any dangerous content (script
 * tags, inline event handlers, javascript: URLs) is stripped by a proper
 * HTML parser rather than regex — regex-based sanitization is known to be
 * bypassable with adversarial inputs (malformed nested tags, svg onload,
 * style url(javascript:...), etc.).
 *
 * Replaced the previous regex strip (H-1 audit fix) with DOMPurify, which
 * parses HTML into a DOM tree and removes disallowed nodes/attributes.
 * The allow-list is minimal: only the tags/attrs Shiki actually emits.
 */
function sanitizeShikiHtml(html: string): string {
  // DOMPurify requires a DOM environment. This function is only called
  // from ShikiCode's render path after the effect sets `html` (client-
  // side only), so the SSR branch is dead in practice — kept as a
  // defensive guard in case a future caller invokes it during SSR.
  if (typeof window === 'undefined') return html;
  return DOMPurify.sanitize(html, {
    // Shiki emits <pre class="shiki ..." style="..." tabindex="0">
    // wrapping <code> with <span style="color:..."> tokens. The
    // tabindex="0" is intentional — it makes long code blocks
    // keyboard-focusable for horizontal scrolling (CSS: overflow-x:
    // auto on .shiki). Stripping it would be an a11y regression.
    ALLOWED_TAGS: ['pre', 'code', 'span', 'br'],
    ALLOWED_ATTR: ['class', 'style', 'tabindex'],
  });
}

function ShikiCode({ code, lang }: { code: string; lang: string }) {
  const [html, setHtml] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    async function highlight() {
      try {
        const { codeToHtml } = await import('shiki');
        const normalizedLang = lang ? lang.toLowerCase() : 'text';
        const highlighted = await codeToHtml(code, {
          lang: normalizedLang,
          theme: 'github-dark-default',
        });
        if (active) {
          setHtml(highlighted);
        }
      } catch (err) {
        console.warn('[shiki-highlight] Failed to highlight code block', err);
      }
    }
    void highlight();
    return () => {
      active = false;
    };
  }, [code, lang]);

  if (html) {
    // H-7: Defense-in-depth sanitization before dangerouslySetInnerHTML.
    // Shiki produces only <span class="..."> elements and text nodes,
    // but we strip any script/iframe/event-handler patterns as a
    // safety net against potential Shiki bugs or future changes.
    const safeHtml = sanitizeShikiHtml(html);
    return <div dangerouslySetInnerHTML={{ __html: safeHtml }} className="shiki-container" />;
  }

  return (
    <pre className="scrollbar-hide overflow-x-auto p-3 font-mono text-body-sm leading-[1.4]">
      <code>{code}</code>
    </pre>
  );
}

// ---------------------------------------------------------------------------
// Code block with copy button and optional truncation.
// ---------------------------------------------------------------------------

function CodeBlock({ code, lang }: { code: string; lang: string }) {
  const [copied, triggerCopy] = useCopied(1500);
  const [expanded, setExpanded] = useState(false);

  const copy = useCallback(() => {
    void navigator.clipboard.writeText(code);
    triggerCopy();
  }, [code, triggerCopy]);

  const lines = useMemo(() => code.split('\n'), [code]);
  const shouldTruncate = lines.length > 100;
  const displayCode = shouldTruncate && !expanded ? lines.slice(0, 100).join('\n') : code;

  return (
    <div
      className={cn(
        'border-border bg-bg-elev-1 relative my-2 overflow-hidden rounded-sm border',
      )}
    >
      <div className="border-border bg-bg-elev-2 flex items-center justify-between border-b px-3 py-2">
        <span className="text-fg-subtle font-mono text-caption uppercase tracking-wider">
          {lang || 'code'}
        </span>
        <button
          type="button"
          onClick={copy}
          aria-label={copied ? 'Copied' : 'Copy code'}
          className="text-fg-muted hover:text-fg inline-flex items-center gap-1 rounded-sm px-2 py-1 text-caption font-medium transition-colors cursor-pointer"
        >
          {copied ? (
            <>
              <IconCheck className="text-success size-3" /> copied
            </>
          ) : (
            <>
              <IconCopy className="size-3" /> copy
            </>
          )}
        </button>
      </div>
      
      <ShikiCode code={displayCode} lang={lang} />

      {shouldTruncate && (
        <div className="border-border bg-bg-elev-2/50 flex justify-center border-t py-1.5">
          <button
            type="button"
            onClick={() => setExpanded(!expanded)}
            className="text-fg hover:text-fg-muted text-caption font-semibold transition-colors cursor-pointer"
          >
            {expanded ? 'Collapse code' : `Show all ${lines.length} lines`}
          </button>
        </div>
      )}
    </div>
  );
}
