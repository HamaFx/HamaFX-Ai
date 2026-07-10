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

// Bespoke renderer for the `search_knowledge` tool part.
//
// Server component — pure projection. Mirrors `get-news.tsx` layout but
// adds a similarity pill on each row. When the embedding pipeline hasn't
// populated the index yet, we surface a quiet status line instead of an
// empty list.

import { Link } from 'next-view-transitions';

import type { ToolPartProps } from './registry';

const MAX_ROWS = 8;

export function SearchKnowledgePart({
  output,
  state,
  errorMessage,
}: ToolPartProps<'search_knowledge'>) {
  if (state === 'error') {
    return <RagCardError {...(errorMessage ? { message: errorMessage } : {})} />;
  }
  if (state === 'loading' || !output) {
    return <RagCardSkeleton />;
  }

  if (output.pipelinePending) {
    return (
      <div className="border-border bg-bg-elev-1 rounded-sm border p-3">
        <p className="text-fg-muted text-sm">News embeddings pipeline hasn&apos;t ingested yet.</p>
      </div>
    );
  }

  if (output.items.length === 0) {
    return (
      <div className="border-border bg-bg-elev-1 rounded-sm border p-3">
        <p className="text-fg-muted text-sm">No matching articles.</p>
      </div>
    );
  }

  const items = output.items.slice(0, MAX_ROWS);

  return (
    <div className="border-border bg-bg-elev-1 rounded-sm border p-3">
      <header className="text-fg-muted mb-2 flex items-baseline justify-between text-body-sm">
        <span>Top {items.length} matches</span>
        <span className="font-mono">{output.model}</span>
      </header>
      <ul className="divide-border divide-y">
        {items.map((item) => {
          const iso = new Date(item.publishedAt).toISOString();
          const sim = Math.round(item.similarity * 100);
          return (
            <li key={item.id}>
              <Link
                href={`/news?id=${encodeURIComponent(item.id)}`}
                className="focus-visible:ring-fg-muted flex min-h-[44px] items-center justify-between gap-3 py-2 outline-none focus-visible:ring-2 focus-visible:ring-offset-2"
              >
                <div className="flex min-w-0 flex-col gap-1">
                  <span className="text-fg line-clamp-2 font-medium">{item.title}</span>
                  <div className="text-fg-muted flex items-center gap-1.5 text-xs">
                    <span className="truncate">
                      {item.publisher ? `${item.source} · ${item.publisher}` : item.source}
                    </span>
                    <span aria-hidden>·</span>
                    <time dateTime={iso} className="tabular-nums">
                      {formatStamp(iso)}
                    </time>
                  </div>
                </div>
                <span
                  className="bg-bg-elev-2 text-fg-muted shrink-0 rounded-sm px-2 py-1 text-caption font-semibold tabular-nums"
                  aria-label={`similarity ${sim} percent`}
                >
                  {sim}%
                </span>
              </Link>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

function RagCardSkeleton() {
  return (
    <div
      className="border-border bg-bg-elev-1 rounded-sm border p-3"
      aria-busy="true"
      aria-label="Searching knowledge base"
    >
      <ul className="divide-border divide-y">
        {[0, 1, 2].map((i) => (
          <li key={i} className="flex min-h-[44px] items-center justify-between gap-3 py-2">
            <span className="bg-bg-elev-2 h-4 w-3/4 animate-pulse rounded-sm" />
            <span className="bg-bg-elev-2 h-5 w-10 animate-pulse rounded-sm" />
          </li>
        ))}
      </ul>
    </div>
  );
}

function RagCardError({ message }: { message?: string }) {
  return (
    <div
      role="alert"
      className="border-danger/30 bg-bg-elev-1 text-danger rounded-sm border p-3 text-sm"
    >
      Knowledge search failed{message ? ` · ${message}` : ''}
    </div>
  );
}

function formatStamp(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  const yyyy = d.getUTCFullYear().toString().padStart(4, '0');
  const mm = (d.getUTCMonth() + 1).toString().padStart(2, '0');
  const dd = d.getUTCDate().toString().padStart(2, '0');
  const hh = d.getUTCHours().toString().padStart(2, '0');
  const mi = d.getUTCMinutes().toString().padStart(2, '0');
  return `${yyyy}-${mm}-${dd} ${hh}:${mi}Z`;
}
