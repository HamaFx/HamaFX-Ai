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

import { priceDecimals, type GetPriceOutput, type Symbol } from '@hamafx/shared';

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
    <div className="border-border bg-bg-elev-1 rounded-sm border p-3">
      <div className="text-fg-muted mb-2 text-xs">Live prices · {formatTime(output.asOf)}</div>
      <ul className="space-y-1.5">
        {output.ticks.map((t) => {
          const decimals = priceDecimals(t.symbol satisfies Symbol);
          const spread = t.ask - t.bid;
          return (
            <li key={t.symbol} className="flex min-h-[44px] items-center justify-between gap-3">
              <span className="text-fg font-medium">{t.symbol}</span>
              <div className="flex items-baseline gap-2 tabular-nums">
                <span className="text-fg text-base">{t.mid.toFixed(decimals)}</span>
                <span className="text-fg-muted text-xs">{spread.toFixed(decimals)} spread</span>
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

function PriceCardSkeleton() {
  return (
    <div
      className="border-border bg-bg-elev-1 rounded-sm border p-3"
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
    </div>
  );
}

function PriceCardError({ message }: { message?: string }) {
  return (
    <div
      role="alert"
      className="border-danger/30 bg-bg-elev-1 text-danger rounded-sm border p-3 text-sm"
    >
      Price unavailable{message ? ` · ${message}` : ''}
    </div>
  );
}

function formatTime(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  // Hour:minute:second is enough — the card itself communicates "live".
  return d.toLocaleTimeString();
}
