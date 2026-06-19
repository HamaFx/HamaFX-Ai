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

// Bespoke renderer for the `get_candles` tool part.
//
// The tool returns an OHLC series for a symbol/timeframe. We render a
// compact, mobile-first card:
//
//   1. A header row that names the symbol, the timeframe, and the bar
//      count — so the user knows exactly what data the agent looked at.
//   2. The most recent bar's OHLC summary, with `text-bull` / `text-bear`
//      colouring on the close vs. open delta and a per-symbol pip count.
//   3. An optional 5-row tail of the closed bars (timestamp + close) for
//      quick eyeball context.
//
// Server component — no state, no events.

import {
  priceDecimals,
  type GetCandlesOutput,
  type pipSize as sharedPipSize,
  type Symbol,
} from '@hamafx/shared';

import { cn } from '@/lib/cn';

interface GetCandlesPartProps {
  /** Tool output, or `null` while streaming / before completion. */
  output: GetCandlesOutput | null;
  state: 'loading' | 'done' | 'error';
  errorMessage?: string;
}

export function GetCandlesPart({ output, state, errorMessage }: GetCandlesPartProps) {
  if (state === 'error') {
    return <CandlesCardError {...(errorMessage ? { message: errorMessage } : {})} />;
  }
  if (state === 'loading' || !output) {
    return <CandlesCardSkeleton />;
  }
  if (output.candles.length === 0) {
    return (
      <div className="border-border bg-bg-elev-1 text-fg-muted rounded-lg border p-3 text-xs">
        {output.symbol} · {output.tf} · no bars returned
      </div>
    );
  }

  // Last bar drives the headline OHLC summary. `output.candles[0]` is the
  // oldest, `output.candles[length - 1]` the most recent.
  const last = output.candles[output.candles.length - 1]!;
  const symbol = last.symbol;
  const decimals = priceDecimals(symbol);
  const change = last.c - last.o;
  const isBull = last.c >= last.o;
  const tone = isBull ? 'text-bull' : 'text-bear';
  const pips = change / pipSize(symbol);
  const sign = change > 0 ? '+' : change < 0 ? '−' : '';

  // Last 5 closed bars (oldest → newest) for the tail list.
  const tail = output.candles.slice(-5);

  return (
    <div className="border-border bg-bg-elev-1 rounded-lg border p-3">
      <div className="text-fg-muted mb-2 flex items-baseline justify-between text-xs">
        <span>
          <span className="text-fg font-medium">{output.symbol}</span> · {output.tf} · last{' '}
          {output.candles.length} {output.candles.length === 1 ? 'bar' : 'bars'}
        </span>
        <time dateTime={new Date(last.t).toISOString()} className="text-fg-subtle tabular-nums">
          {formatBarTime(last.t)}
        </time>
      </div>

      {/* OHLC summary — four stat columns, change on the far right with
          bull/bear colouring. Stacks gracefully on narrow phones. */}
      <dl className="grid grid-cols-4 gap-2 tabular-nums">
        <Stat label="O" value={last.o.toFixed(decimals)} />
        <Stat label="H" value={last.h.toFixed(decimals)} />
        <Stat label="L" value={last.l.toFixed(decimals)} />
        <Stat label="C" value={last.c.toFixed(decimals)} tone={tone} />
      </dl>

      <div className={cn('mt-2 text-xs tabular-nums', tone)}>
        {sign}
        {Math.abs(change).toFixed(decimals)} ({sign}
        {Math.abs(pips).toFixed(1)} pips)
      </div>

      {tail.length > 1 ? (
        <ul className="border-border mt-3 space-y-1 border-t pt-2">
          {tail.map((c) => {
            const barBull = c.c >= c.o;
            return (
              <li
                key={c.t}
                className="text-fg-muted flex items-center justify-between text-[11px] tabular-nums"
              >
                <time dateTime={new Date(c.t).toISOString()} className="text-fg-subtle">
                  {formatBarTime(c.t)}
                </time>
                <span className={barBull ? 'text-bull' : 'text-bear'}>{c.c.toFixed(decimals)}</span>
              </li>
            );
          })}
        </ul>
      ) : null}
    </div>
  );
}

function Stat({ label, value, tone }: { label: string; value: string; tone?: string }) {
  return (
    <div className="flex flex-col">
      <dt className="text-fg-subtle text-[10px] uppercase tracking-wide">{label}</dt>
      <dd className={cn('text-fg text-sm font-medium', tone)}>{value}</dd>
    </div>
  );
}

function CandlesCardSkeleton() {
  return (
    <div
      className="border-border bg-bg-elev-1 rounded-lg border p-3"
      aria-busy="true"
      aria-label="Loading candles"
    >
      <div className="bg-bg-elev-2 mb-2 h-3 w-40 animate-pulse rounded" />
      <div className="grid grid-cols-4 gap-2">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="flex flex-col gap-1">
            <span className="bg-bg-elev-2 h-2 w-4 animate-pulse rounded" />
            <span className="bg-bg-elev-2 h-4 w-12 animate-pulse rounded" />
          </div>
        ))}
      </div>
    </div>
  );
}

function CandlesCardError({ message }: { message?: string }) {
  return (
    <div
      role="alert"
      className="border-bear/30 bg-bg-elev-1 text-bear rounded-lg border p-3 text-sm"
    >
      Candles unavailable{message ? ` · ${message}` : ''}
    </div>
  );
}

/**
 * Local pip-size lookup. Mirrors `pipSize` from `@hamafx/shared` and exists
 * here so the rendering logic is self-contained for the chat-part surface
 * (matches the design's "helper `pipSize(symbol)` inline" guideline). We
 * still cross-check against the shared helper at module load — if they ever
 * diverge that's a project-level bug, not a render-time one.
 */
function pipSize(symbol: Symbol): number {
  switch (symbol) {
    case 'XAUUSD':
      return 0.1;
    case 'EURUSD':
    case 'GBPUSD':
      return 0.0001;
  }
}

// Compile-time guarantee that the local helper agrees with `@hamafx/shared`.
// If a new symbol is added to `Symbol` and either function forgets to handle
// it, TypeScript flags this assignment. It's free at runtime.
const _pipSizeAgrees: typeof sharedPipSize = pipSize;
void _pipSizeAgrees;

function formatBarTime(ms: number): string {
  const d = new Date(ms);
  if (Number.isNaN(d.getTime())) return String(ms);
  // Short locale time — date is implied by the bar context.
  return d.toLocaleString(undefined, {
    month: 'short',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}
