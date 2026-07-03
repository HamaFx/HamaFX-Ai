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
    return <PriceCardError {...(errorMessage ? { message: errorMessage } : {})} />;
  }
  if (state === 'loading' || !output) {
    return <PriceCardSkeleton />;
  }

  return (
    <div className="border-border bg-zinc-950 rounded-sm border p-3">
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
      className="border-border bg-zinc-950 rounded-sm border p-3"
      aria-busy="true"
      aria-label="Loading prices"
    >
      <div className="bg-zinc-900 mb-2 h-3 w-32 animate-pulse rounded" />
      <ul className="space-y-1.5">
        {[0, 1, 2].map((i) => (
          <li key={i} className="flex min-h-[44px] items-center justify-between gap-3">
            <span className="bg-zinc-900 h-4 w-16 animate-pulse rounded" />
            <span className="bg-zinc-900 h-4 w-24 animate-pulse rounded" />
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
      className="border-red-500/30 bg-zinc-950 text-red-500 rounded-sm border p-3 text-sm"
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
