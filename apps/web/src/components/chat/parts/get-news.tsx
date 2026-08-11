// SPDX-License-Identifier: Apache-2.0

// Bespoke renderer for the `get_news` tool part.
//
// Server component on purpose — pure projection of the tool output. The tool
// returns up to N items; we cap the rendered list at 8 to keep the chat row
// compact (the model can ask for more if needed). Each row is a deep-linked
// `<a>` to `/news?id=<id>` so the user can jump from the chat surface
// straight into the full article on the News page.
//
// The pipeline-pending branch covers the case where the news ingestion cron
// hasn't yet populated the DB on a fresh deploy — we surface a quiet status
// line instead of an empty list (which would look like a bug).

import { IconAlertTriangle, IconClock, IconNews } from '@tabler/icons-react';
import type { GetNewsOutput, NewsSentiment } from '@hamafx/shared';
import { Link } from 'next-view-transitions';

import { cleanNewsText } from '@/lib/clean-news-text';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { formatStamp } from '@/lib/datetime';

interface GetNewsPartProps {
  /** Tool output, or `null` while streaming / before completion. */
  output: GetNewsOutput | null;
  state: 'loading' | 'done' | 'error';
  errorMessage?: string;
}

/** Maximum rows rendered per card. The model can re-query for more. */
const MAX_ROWS = 8;

export function GetNewsPart({ output, state, errorMessage }: GetNewsPartProps) {
  if (state === 'error') {
    return <NewsCardError message={errorMessage} />;
  }
  if (state === 'loading' || !output) {
    return <NewsCardSkeleton />;
  }

  if (output.pipelinePending) {
    return (
      <Card as="section" aria-label="News status" className="p-3">
        <p className="text-fg-muted flex items-center gap-2 text-body-sm"><IconClock className="size-4" aria-hidden="true" /> News pipeline hasn&apos;t ingested yet.</p>
      </Card>
    );
  }

  if (output.items.length === 0) {
    return (
      <Card as="section" aria-label="News status" className="p-3">
        <p className="text-fg-muted flex items-center gap-2 text-body-sm"><IconNews className="size-4" aria-hidden="true" /> No matching news.</p>
      </Card>
    );
  }

  const items = output.items.slice(0, MAX_ROWS);

  return (
    <Card as="section" aria-label={`News results: ${items.length} of ${output.items.length} articles`}>
      <header className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2"><IconNews className="text-fg-subtle size-4" aria-hidden="true" /><h3 className="text-fg text-body-sm font-semibold">News</h3></div>
        <Badge tone="neutral">{items.length}{items.length !== output.items.length ? ` of ${output.items.length}` : ''} result{output.items.length === 1 ? '' : 's'}</Badge>
      </header>
      <ul className="divide-border divide-y">
        {items.map((item) => {
          const iso = new Date(item.publishedAt).toISOString();
          return (
            <li key={item.id}>
              <Link
                href={`/news?id=${encodeURIComponent(item.id)}`}
                className="focus-visible:ring-fg-muted flex min-h-[44px] flex-col justify-center gap-1 py-2 outline-none focus-visible:ring-2 focus-visible:ring-offset-2"
              >
                <div className="flex items-start gap-2">
                  <SentimentDot sentiment={item.sentiment} />
                  <span className="text-fg line-clamp-2 font-medium">{cleanNewsText(item.title)}</span>
                </div>
                <div className="text-fg-muted flex items-center gap-1.5 text-caption">
                  <span className="truncate">
                    {item.publisher ? `${item.source} · ${cleanNewsText(item.publisher)}` : item.source}
                  </span>
                  <span aria-hidden>·</span>
                  <time dateTime={iso} className="tabular-nums">
                    {formatStamp(iso)}
                  </time>
                </div>
              </Link>
            </li>
          );
        })}
      </ul>
    </Card>
  );
}

function SentimentDot({ sentiment }: { sentiment: NewsSentiment | null }) {
  if (sentiment === null) return null;
  const color =
    sentiment === 'positive' ? 'bg-bull' : sentiment === 'negative' ? 'bg-bear' : 'bg-fg-muted';
  return (
    <span
      role="img"
      aria-label={`sentiment: ${sentiment}`}
      className={`mt-1.5 inline-block size-2 shrink-0 rounded-sm ${color}`}
    />
  );
}

function NewsCardSkeleton() {
  return (
    <Card
      as="section"
      role="status"
      className="p-3"
      aria-busy="true"
      aria-label="Loading news"
    >
      <ul className="divide-border divide-y">
        {[0, 1, 2].map((i) => (
          <li key={i} className="flex min-h-[44px] flex-col justify-center gap-1 py-2">
            <span className="bg-bg-elev-2 h-4 w-3/4 animate-pulse rounded-sm" />
            <span className="bg-bg-elev-2 h-3 w-1/3 animate-pulse rounded-sm" />
          </li>
        ))}
      </ul>
    </Card>
  );
}

function NewsCardError({ message }: { message?: string }) {
  return (
    <Card as="section" role="alert" aria-label={message ? `News unavailable: ${message}` : 'News unavailable'} className="border-danger/30 p-3 text-sm">
      <p className="text-danger flex items-start gap-2"><IconAlertTriangle className="mt-0.5 size-4 shrink-0" aria-hidden="true" /><span><span className="font-semibold">News unavailable</span>{message ? <span className="text-fg-muted"> · {message}</span> : null}</span></p>
    </Card>
  );
}

