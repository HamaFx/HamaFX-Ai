// SPDX-License-Identifier: Apache-2.0

import { IconAlertTriangle, IconExternalLink, IconWorldSearch } from '@tabler/icons-react';

import type { ToolPartProps } from './registry';

export function WebSearchPart({ output, state, errorMessage }: ToolPartProps<'web_search'>) {
  if (state === 'error') {
    return (
      <div
        role="alert"
        className="border-danger/30 bg-bg-elev-1 text-danger rounded-sm border p-3 text-sm"
      >
        <span className="flex items-start gap-2">
          <IconAlertTriangle className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
          <span>Live web research failed{errorMessage ? ` · ${errorMessage}` : ''}</span>
        </span>
      </div>
    );
  }

  if (state === 'loading' || !output) {
    return (
      <div
        role="status"
        aria-busy="true"
        className="border-border bg-bg-elev-1 rounded-sm border p-3 text-sm"
      >
        <span className="text-fg-muted flex items-center gap-2">
          <IconWorldSearch className="size-4 animate-pulse" aria-hidden="true" /> Searching the live
          web…
        </span>
      </div>
    );
  }

  if (output.status !== 'success' || output.sources.length === 0) {
    return (
      <div
        role={output.status === 'error' ? 'alert' : 'status'}
        className="border-border bg-bg-elev-1 rounded-sm border p-3 text-sm"
      >
        <span className="text-fg-muted flex items-start gap-2">
          <IconAlertTriangle className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
          <span>{output.message ?? 'No live web sources were available.'}</span>
        </span>
      </div>
    );
  }

  return (
    <section
      aria-label={`Live web sources from ${output.provider ?? 'web search'}`}
      className="border-border bg-bg-elev-1 rounded-sm border p-3"
    >
      <header className="text-fg-muted text-body-sm mb-2 flex items-center gap-2">
        <IconWorldSearch className="size-4" aria-hidden="true" />
        <span>Live web sources</span>
        <span className="text-fg-subtle">· {output.provider}</span>
      </header>
      <ul className="divide-border divide-y">
        {output.sources.map((source) => (
          <li key={source.id}>
            <a
              href={source.url}
              target="_blank"
              rel="noreferrer noopener"
              className="focus-visible:ring-fg-muted flex min-h-[44px] items-start justify-between gap-3 py-2 outline-none focus-visible:ring-2 focus-visible:ring-offset-2"
            >
              <span className="min-w-0">
                <span className="text-fg line-clamp-2 block font-medium">{source.title}</span>
                <span className="text-fg-muted text-caption mt-1 line-clamp-2 block">
                  {source.snippet}
                </span>
                <span className="text-fg-subtle text-caption mt-1 block truncate">
                  {source.domain}
                </span>
              </span>
              <IconExternalLink
                className="text-fg-subtle mt-0.5 size-4 shrink-0"
                aria-hidden="true"
              />
            </a>
          </li>
        ))}
      </ul>
    </section>
  );
}
