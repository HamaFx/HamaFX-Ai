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

import { Check, Copy } from 'lucide-react';
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
      <p className="whitespace-pre-line text-sm leading-relaxed">{text}</p>
    );
  }

  // While streaming, skip expensive ReactMarkdown + Shiki parsing.
  // Upgrade to full markdown rendering once streaming finishes.
  if (isStreaming) {
    return (
      <div aria-live="polite" aria-atomic="true" className="md-prose text-sm leading-relaxed space-y-2">
        {text}
        <span className="inline-block w-[2px] h-[1em] bg-text-fg animate-pulse ml-[1px] align-middle" />
      </div>
    );
  }

  return (
    <div aria-live="polite" aria-atomic="true" className="md-prose text-sm leading-relaxed space-y-2">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          h1: ({ children }) => <h1 className="text-lg font-bold mt-4 mb-2">{children}</h1>,
          h2: ({ children }) => <h2 className="text-base font-semibold mt-3 mb-1.5">{children}</h2>,
          h3: ({ children }) => <h3 className="text-sm font-medium mt-2 mb-1">{children}</h3>,
          blockquote: ({ children }) => (
            <blockquote className="border-brand/40 text-fg-muted my-2 border-l-3 pl-3 italic">
              {children}
            </blockquote>
          ),
          hr: () => <hr className="border-divider my-4" />,
          p: ({ children }) => <p className="leading-relaxed whitespace-pre-line my-1.5">{children}</p>,
          ul: ({ children }) => <ul className="list-disc pl-5 my-2 space-y-1">{children}</ul>,
          ol: ({ children }) => <ol className="list-decimal pl-5 my-2 space-y-1">{children}</ol>,
          li: ({ children }) => <li className="my-0.5">{children}</li>,
          a: ({ href, children }) => (
            <a
              href={href}
              target="_blank"
              rel="noopener noreferrer"
              className="text-brand underline-offset-2 hover:underline"
            >
              {children}
            </a>
          ),
          table: ({ children }) => (
            <div className="my-3 overflow-x-auto rounded-lg border border-divider">
              <table className="min-w-full divide-y divide-divider/40 text-caption font-mono text-left">
                {children}
              </table>
            </div>
          ),
          thead: ({ children }) => <thead className="bg-bg-elev-2/60">{children}</thead>,
          tbody: ({ children }) => <tbody className="divide-y divide-divider/20">{children}</tbody>,
          tr: ({ children }) => <tr className="hover:bg-bg-elev-1/30 transition-colors">{children}</tr>,
          th: ({ children }) => <th className="px-4 py-2 font-semibold text-fg-subtle">{children}</th>,
          td: ({ children }) => <td className="px-4 py-2 text-fg">{children}</td>,
          code({ className, children, ...props }) {
            const match = /language-(\w+)/.exec(className || '');
            const codeStr = String(children).replace(/\n$/, '');
            if (!match) {
              return (
                <code className="bg-bg-elev-2 text-fg-subtle font-mono text-xs px-1.5 py-0.5 rounded" {...props}>
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
    return <div dangerouslySetInnerHTML={{ __html: html }} className="shiki-container" />;
  }

  return (
    <pre className="scrollbar-hide overflow-x-auto p-3 font-mono text-body-sm leading-relaxed">
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
          className="text-fg-muted hover:text-fg inline-flex items-center gap-1 rounded-md px-2 py-1 text-caption font-medium transition-colors cursor-pointer"
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
      
      <ShikiCode code={displayCode} lang={lang} />

      {shouldTruncate && (
        <div className="border-divider/40 bg-bg-elev-2/30 flex justify-center border-t py-1.5">
          <button
            type="button"
            onClick={() => setExpanded(!expanded)}
            className="text-brand hover:text-brand-hover text-caption font-semibold transition-colors cursor-pointer"
          >
            {expanded ? 'Collapse code' : `Show all ${lines.length} lines`}
          </button>
        </div>
      )}
    </div>
  );
}
