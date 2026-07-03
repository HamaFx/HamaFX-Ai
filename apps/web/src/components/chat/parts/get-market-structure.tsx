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

// Bespoke renderer for the `get_market_structure` tool part.
//
// SMC structure outputs are sparse events (swings, BOS / CHoCH, FVGs, OBs,
// liquidity sweeps) rather than per-bar series. The mobile card surfaces
// the model's prose `summary` verbatim, then a compact "what we found"
// counts row, plus the latest 3 directional events (BOS / CHoCH) coloured
// with `text-bull` / `text-bear` and the latest 2 swing pivots with prices
// in `.tabular-nums`.
//
// Server component on purpose — no state, no events, no browser-only APIs.

import {
  isKnownSymbol,
  priceDecimals,
  type GetMarketStructureOutput,
  type StructureEvent,
  type SwingPoint,
} from '@hamafx/shared';

interface GetMarketStructurePartProps {
  /** Tool output, or `null` while streaming / before completion. */
  output: GetMarketStructureOutput | null;
  state: 'loading' | 'done' | 'error';
  errorMessage?: string;
}

export function GetMarketStructurePart({
  output,
  state,
  errorMessage,
}: GetMarketStructurePartProps) {
  if (state === 'error') {
    return <StructureError {...(errorMessage ? { message: errorMessage } : {})} />;
  }
  if (state === 'loading' || !output) {
    return <StructureSkeleton />;
  }

  const decimals = isKnownSymbol(output.symbol) ? priceDecimals(output.symbol) : 5;

  const swings: readonly SwingPoint[] = output.swings ?? [];
  const events: readonly StructureEvent[] = output.events ?? [];
  const fvgs = output.fvg ?? [];
  const obs = output.orderBlocks ?? [];
  const sweeps = output.liquidity ?? [];

  // Last-N slices — we want the most recent context, so take from the tail.
  const lastEvents = events.slice(-3).reverse();
  const lastSwings = swings.slice(-2).reverse();

  return (
    <div className="border-border bg-bg-elev-1 rounded-lg border p-3">
      <div className="text-fg-muted mb-2 text-xs">
        <span className="text-fg font-medium">{output.symbol}</span> · {output.tf} · structure (
        <span className="tabular-nums">{output.bars}</span> bars)
      </div>

      {output.summary ? (
        <p className="text-fg-muted mb-2 whitespace-pre-line text-sm">{output.summary}</p>
      ) : null}

      <div className="text-fg-subtle mb-2 text-body-sm tabular-nums">
        {swings.length} swings · {events.length} events · {fvgs.length} FVG · {obs.length} OB ·{' '}
        {sweeps.length} sweeps
      </div>

      {lastEvents.length > 0 ? (
        <ul className="mb-2 space-y-1">
          {lastEvents.map((e) => (
            <li
              key={`${e.kind}-${e.brokenAt}-${e.swingIndex}`}
              className="flex min-h-[44px] items-center justify-between gap-2 text-sm"
            >
              <span className="text-fg-muted">
                {e.kind.toUpperCase()} @ bar <span className="tabular-nums">{e.brokenAt}</span>
              </span>
              <span className="flex items-baseline gap-2">
                <span
                  className={
                    e.direction === 'bullish'
                      ? 'bg-bull/15 text-bull rounded px-1.5 py-0.5 text-xs font-medium'
                      : 'bg-bear/15 text-bear rounded px-1.5 py-0.5 text-xs font-medium'
                  }
                >
                  {e.direction}
                </span>
                <span className="text-fg tabular-nums">{e.level.toFixed(decimals)}</span>
              </span>
            </li>
          ))}
        </ul>
      ) : null}

      {lastSwings.length > 0 ? (
        <ul className="space-y-1">
          {lastSwings.map((s) => (
            <li
              key={`${s.type}-${s.index}`}
              className="flex min-h-[44px] items-center justify-between gap-2 text-sm"
            >
              <span className="text-fg-muted">
                swing-{s.type} @ bar <span className="tabular-nums">{s.index}</span>
              </span>
              <span
                className={s.type === 'high' ? 'text-bull tabular-nums' : 'text-bear tabular-nums'}
              >
                {s.price.toFixed(decimals)}
              </span>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}

function StructureSkeleton() {
  return (
    <div
      className="border-border bg-bg-elev-1 rounded-lg border p-3"
      aria-busy="true"
      aria-label="Loading market structure"
    >
      <div className="bg-bg-elev-2 mb-2 h-3 w-48 animate-pulse rounded" />
      <div className="bg-bg-elev-2 mb-2 h-12 w-full animate-pulse rounded" />
      <div className="bg-bg-elev-2 mb-2 h-3 w-40 animate-pulse rounded" />
      <ul className="space-y-1">
        {[0, 1, 2].map((i) => (
          <li key={i} className="flex min-h-[44px] items-center justify-between gap-2">
            <span className="bg-bg-elev-2 h-4 w-24 animate-pulse rounded" />
            <span className="bg-bg-elev-2 h-4 w-20 animate-pulse rounded" />
          </li>
        ))}
      </ul>
    </div>
  );
}

function StructureError({ message }: { message?: string }) {
  return (
    <div
      role="alert"
      className="border-bear/30 bg-bg-elev-1 text-bear rounded-lg border p-3 text-sm"
    >
      Market structure unavailable{message ? ` · ${message}` : ''}
    </div>
  );
}
