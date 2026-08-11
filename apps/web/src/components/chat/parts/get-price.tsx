// SPDX-License-Identifier: Apache-2.0

// Bespoke renderer for the `get_price` tool part.
//
// `get_price` returns a snapshot of bid/ask/mid for one or more symbols at a
// single moment in time — there's no prior tick context here, so we don't
// render a signed delta or `text-bull` / `text-bear` colouring. The schema
// only carries `mid`, `bid`, `ask`, so this surface is deliberately simple:
// symbol on the left, mid + spread on the right, with `.tabular-nums` on
// every numeric column.
//
// Server component on purpose — no state, no events, no browser-only APIs.

import { IconActivity, IconClock, IconDatabase } from '@tabler/icons-react';
import { priceDecimals, type GetPriceOutput, type Symbol } from '@kestrel/shared';

import { Card } from '@/components/ui/card';

interface GetPricePartProps {
  /** Tool output, or `null` while streaming / before completion. */
  output: GetPriceOutput | null;
  state: 'loading' | 'done' | 'error';
  errorMessage?: string;
}

export function GetPricePart({ output, state, errorMessage }: GetPricePartProps) {
  if (state === 'error') {
    return <PriceCardError message={errorMessage} />;
  }
  if (state === 'loading' || !output) {
    return <PriceCardSkeleton />;
  }

  return (
    <Card as="section" aria-label="Price snapshot" className="gap-4">
      <header className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 items-start gap-2">
          <span className="bg-bg-elev-2 text-brand mt-0.5 inline-flex size-7 shrink-0 items-center justify-center rounded-sm">
            <IconActivity className="size-4" aria-hidden="true" />
          </span>
          <div className="min-w-0">
            <h3 className="text-fg text-body-sm font-semibold">Price snapshot</h3>
            <p className="text-fg-muted text-caption">Current market quote</p>
          </div>
        </div>
        <span className={statusTone(output.asOf)}>
          <span className="size-1.5 rounded-full bg-current" aria-hidden="true" />
          {freshnessLabel(output.asOf)}
        </span>
      </header>

      <div className="border-divider flex flex-wrap items-center gap-x-3 gap-y-1 border-y py-2 text-caption">
        <span className="text-fg-muted inline-flex items-center gap-1">
          <IconClock className="size-3" aria-hidden="true" />
          {formatTime(output.asOf)}
        </span>
        {commonSource(output.ticks.map((tick) => tick.source)) ? (
          <span className="text-fg-muted inline-flex items-center gap-1">
            <IconDatabase className="size-3" aria-hidden="true" />
            {commonSource(output.ticks.map((tick) => tick.source))}
          </span>
        ) : null}
        <span className="text-fg-subtle ml-auto tabular-nums">
          {output.ticks.length} market{output.ticks.length === 1 ? '' : 's'}
        </span>
      </div>

      <ul className="space-y-1.5">
        {output.ticks.map((t) => {
          const decimals = priceDecimals(t.symbol satisfies Symbol);
          const spread = t.ask - t.bid;
          return (
            <li key={t.symbol} className="flex min-h-[44px] items-center justify-between gap-3">
              <div className="flex min-w-0 flex-col">
                <span className="text-fg font-semibold">{t.symbol}</span>
                <span className="text-fg-subtle text-caption">bid {t.bid.toFixed(decimals)} · ask {t.ask.toFixed(decimals)}</span>
              </div>
              <div className="flex shrink-0 items-baseline gap-2 tabular-nums">
                <span className="text-fg text-numeric-xl font-bold">{t.mid.toFixed(decimals)}</span>
                <span className="text-fg-muted text-caption">{spread.toFixed(decimals)} spr</span>
              </div>
            </li>
          );
        })}
      </ul>
    </Card>
  );
}

function PriceCardSkeleton() {
  return (
    <Card
      as="section"
      role="status"
      className="p-3"
      aria-busy="true"
      aria-label="Loading prices"
    >
      <div className="bg-bg-elev-2 mb-2 h-3 w-32 animate-pulse rounded-sm" />
      <ul className="space-y-1.5">
        {[0, 1, 2].map((i) => (
          <li key={i} className="flex min-h-[44px] items-center justify-between gap-3">
            <span className="bg-bg-elev-2 h-4 w-16 animate-pulse rounded-sm" />
            <span className="bg-bg-elev-2 h-4 w-24 animate-pulse rounded-sm" />
          </li>
        ))}
      </ul>
    </Card>
  );
}

function PriceCardError({ message }: { message?: string }) {
  return (
    <Card as="section" role="alert" aria-label={message ? `Price unavailable: ${message}` : 'Price unavailable'} className="border-danger/30 p-3 text-sm">
      <div className="flex items-start gap-2">
        <span className="mt-0.5 size-1.5 shrink-0 rounded-full bg-danger" aria-hidden="true" />
        <p className="text-danger"><span className="font-semibold">Price unavailable</span>{message ? <span className="text-fg-muted"> · {message}</span> : null}</p>
      </div>
    </Card>
  );
}

function commonSource(sources: string[]): string | null {
  const first = sources[0];
  return first && sources.every((source) => source === first) ? first : null;
}

function freshnessLabel(iso: string): string {
  const ageMs = Date.now() - new Date(iso).getTime();
  if (!Number.isFinite(ageMs) || ageMs < 60_000) return 'Live';
  if (ageMs < 5 * 60_000) return 'Recent';
  return 'Stale';
}

function statusTone(iso: string): string {
  const label = freshnessLabel(iso);
  return `inline-flex shrink-0 items-center gap-1 text-caption font-semibold uppercase ${
    label === 'Live' ? 'text-success' : label === 'Recent' ? 'text-warn' : 'text-danger'
  }`;
}

function formatTime(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  // Hour:minute:second is enough — the card itself communicates "live".
  return d.toLocaleTimeString();
}
