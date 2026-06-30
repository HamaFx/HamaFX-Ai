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

// Bespoke renderer for the `get_indicators` tool part.
//
// `get_indicators` returns up to a handful of indicator results computed
// over the same symbol/timeframe window. The AI tool truncates each
// `values` series to the last 30 points, so we only have a short tail of
// the indicator to work with — this card focuses on the *latest* point
// for each kind, which is what the agent quotes back to the user.
//
// Per-kind layout (mobile-first, dense one-line rows):
//   sma / ema   →  kind(period)        : value
//   rsi         →  kind(period)        : value  with bull/bear/neutral colour
//   atr         →  kind(period)        : value
//   macd        →  kind(fast/slow/sig) : hist with bull/bear sign colour
//   bollinger   →  kind(period, k)     : U / M / L
//   pivots      →  kind                : P / R1 / S1
//
// All numerics use `.tabular-nums`. Sign colouring uses semantic tokens
// `text-bull` / `text-bear` and the neutral tone uses `text-fg-muted`.
//
// Server component on purpose — no state, no events, no browser-only APIs.

import {
  priceDecimals,
  type GetIndicatorsOutput,
  type IndicatorResult,
  type Symbol,
} from '@hamafx/shared';

import { cn } from '@/lib/cn';

interface GetIndicatorsPartProps {
  /** Tool output, or `null` while streaming / before completion. */
  output: GetIndicatorsOutput | null;
  state: 'loading' | 'done' | 'error';
  errorMessage?: string;
}

export function GetIndicatorsPart({ output, state, errorMessage }: GetIndicatorsPartProps) {
  if (state === 'error') {
    return <IndicatorsCardError {...(errorMessage ? { message: errorMessage } : {})} />;
  }
  if (state === 'loading' || !output) {
    return <IndicatorsCardSkeleton />;
  }

  const decimals = priceDecimalsForSymbol(output.symbol);

  return (
    <div className="border-border bg-bg-elev-1 rounded-lg border p-3">
      <div className="text-fg-muted mb-2 text-xs">
        {output.symbol} · {output.tf} · {output.results.length}{' '}
        {output.results.length === 1 ? 'indicator' : 'indicators'}
      </div>
      <ul className="space-y-1.5">
        {output.results.map((r, i) => (
          <li
            key={`${r.kind}-${i}`}
            className="flex min-h-[44px] items-start justify-between gap-3"
          >
            <span className="text-fg pt-0.5 font-medium">{labelFor(r)}</span>
            <span className="flex flex-wrap items-baseline justify-end gap-x-2 gap-y-0.5 tabular-nums">
              <IndicatorValue result={r} decimals={decimals} />
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

// --- Per-kind value rendering -------------------------------------------

function IndicatorValue({ result, decimals }: { result: IndicatorResult; decimals: number }) {
  const last = lastValue(result);

  switch (result.kind) {
    case 'rsi': {
      const v = readNumber(last);
      if (v === null) return <Empty />;
      const tone = v > 70 ? 'text-bear' : v < 30 ? 'text-bull' : 'text-fg-muted';
      // Phase 1.2b — RSI gauge arc next to the numeric value.
      return (
        <span className="inline-flex items-center gap-2">
          <RsiGauge value={v} />
          <span className={cn('text-fg text-base', tone)}>{v.toFixed(1)}</span>
        </span>
      );
    }
    case 'macd': {
      const rec = readRecord(last);
      const hist = rec ? readNullableNumber(rec.hist) : null;
      if (hist === null) return <Empty />;
      const tone = hist > 0 ? 'text-bull' : hist < 0 ? 'text-bear' : 'text-fg-muted';
      const sign = hist > 0 ? '+' : '';
      return (
        <>
          <span className={cn('text-base', tone)}>
            {sign}
            {hist.toFixed(decimals)}
          </span>
          <span className="text-fg-subtle text-xs">hist</span>
        </>
      );
    }
    case 'bollinger': {
      const rec = readRecord(last);
      if (!rec) return <Empty />;
      const upper = readNullableNumber(rec.upper);
      const middle = readNullableNumber(rec.middle);
      const lower = readNullableNumber(rec.lower);
      if (upper === null || middle === null || lower === null) return <Empty />;
      return (
        <span className="text-fg text-sm">
          {upper.toFixed(decimals)}
          <span className="text-fg-subtle"> / </span>
          {middle.toFixed(decimals)}
          <span className="text-fg-subtle"> / </span>
          {lower.toFixed(decimals)}
        </span>
      );
    }
    case 'pivots': {
      const rec = readRecord(last);
      if (!rec) return <Empty />;
      const pp = readNullableNumber(rec.pp);
      const r1 = readNullableNumber(rec.r1);
      const s1 = readNullableNumber(rec.s1);
      if (pp === null || r1 === null || s1 === null) return <Empty />;
      return (
        <span className="text-fg text-sm">
          {pp.toFixed(decimals)}
          <span className="text-fg-subtle"> / </span>
          {r1.toFixed(decimals)}
          <span className="text-fg-subtle"> / </span>
          {s1.toFixed(decimals)}
        </span>
      );
    }
    case 'sma':
    case 'ema':
    case 'atr': {
      const v = readNumber(last);
      if (v === null) return <Empty />;
      // No sign colouring for level / volatility indicators.
      return <span className="text-fg text-base">{v.toFixed(decimals)}</span>;
    }
  }
}

function Empty() {
  return <span className="text-fg-subtle text-sm">—</span>;
}

// Phase 1.2b — RSI gauge arc. Pure inline SVG semicircle (180°). Background
// arc uses bg-elev-3; the value arc is coloured by zone (<30 oversold → bull,
// >70 overbought → bear, else fg-muted). Server-renderable (no motion).
function RsiGauge({ value }: { value: number }) {
  const r = 20;
  const cx = 24;
  const cy = 28;
  const circumference = Math.PI * r; // semicircle arc length
  const frac = Math.max(0, Math.min(1, value / 100));
  const offset = circumference * (1 - frac);
  const color =
    value < 30 ? 'var(--color-bull)' : value > 70 ? 'var(--color-bear)' : 'var(--color-fg-muted)';
  const d = `M ${cx - r} ${cy} A ${r} ${r} 0 0 1 ${cx + r} ${cy}`;
  return (
    <svg
      width="48"
      height="32"
      viewBox="0 0 48 32"
      role="img"
      aria-label={`RSI gauge: ${value.toFixed(1)}`}
    >
      <path d={d} fill="none" stroke="var(--color-bg-elev-3)" strokeWidth="4" strokeLinecap="round" />
      <path
        d={d}
        fill="none"
        stroke={color}
        strokeWidth="4"
        strokeLinecap="round"
        strokeDasharray={circumference}
        strokeDashoffset={offset}
      />
      <text
        x={cx}
        y={cy - 5}
        textAnchor="middle"
        fill="var(--color-fg)"
                style={{ fontSize: 9, fontWeight: 700, fontVariantNumeric: 'tabular-nums' }}
      >
        {value.toFixed(0)}
      </text>
    </svg>
  );
}

// --- Header / label helpers ---------------------------------------------

function labelFor(r: IndicatorResult): string {
  const params = r.params;
  switch (r.kind) {
    case 'sma':
    case 'ema':
    case 'rsi':
    case 'atr': {
      const period = readNumberParam(params['period']);
      return period === null ? r.kind.toUpperCase() : `${r.kind.toUpperCase()}(${period})`;
    }
    case 'macd': {
      const fast = readNumberParam(params['fast']);
      const slow = readNumberParam(params['slow']);
      const signal = readNumberParam(params['signal']);
      if (fast === null || slow === null || signal === null) return 'MACD';
      return `MACD(${fast}/${slow}/${signal})`;
    }
    case 'bollinger': {
      const period = readNumberParam(params['period']);
      const mult = readNumberParam(params['multiplier']);
      if (period === null || mult === null) return 'BB';
      return `BB(${period}, ${mult})`;
    }
    case 'pivots':
      return 'Pivots';
  }
}

// --- Defensive narrowing -------------------------------------------------
//
// `IndicatorResult.values` is `(number | null | Record<string, number | null>)[]`.
// Each branch of the switch above knows the expected shape, but we still
// narrow at runtime so a malformed payload renders an em-dash instead of
// crashing.

function lastValue(r: IndicatorResult): IndicatorResult['values'][number] | undefined {
  if (r.values.length === 0) return undefined;
  return r.values[r.values.length - 1];
}

function readNumber(v: unknown): number | null {
  return typeof v === 'number' && Number.isFinite(v) ? v : null;
}

function readNullableNumber(v: unknown): number | null {
  if (v === null || v === undefined) return null;
  return readNumber(v);
}

function readRecord(v: unknown): Record<string, unknown> | null {
  if (v === null || v === undefined) return null;
  if (typeof v !== 'object') return null;
  // Arrays are objects; reject them so callers can rely on key access.
  if (Array.isArray(v)) return null;
  return v as Record<string, unknown>;
}

function readNumberParam(v: unknown): number | null {
  return readNumber(v);
}

function priceDecimalsForSymbol(s: string): number {
  // `output.symbol` is `string` in the envelope (intentionally loose), but
  // each result carries the canonical `Symbol`. Use the per-result symbol
  // when it matches one we know about; otherwise default to 2 decimals.
  if (s === 'XAUUSD' || s === 'EURUSD' || s === 'GBPUSD') {
    return priceDecimals(s satisfies Symbol);
  }
  return 2;
}

// --- Loading / error placeholders ---------------------------------------

function IndicatorsCardSkeleton() {
  return (
    <div
      className="border-border bg-bg-elev-1 rounded-lg border p-3"
      aria-busy="true"
      aria-label="Loading indicators"
    >
      <div className="bg-bg-elev-2 mb-2 h-3 w-40 animate-pulse rounded" />
      <ul className="space-y-1.5">
        {[0, 1, 2].map((i) => (
          <li key={i} className="flex min-h-[44px] items-center justify-between gap-3">
            <span className="bg-bg-elev-2 h-4 w-20 animate-pulse rounded" />
            <span className="bg-bg-elev-2 h-4 w-28 animate-pulse rounded" />
          </li>
        ))}
      </ul>
    </div>
  );
}

function IndicatorsCardError({ message }: { message?: string }) {
  return (
    <div
      role="alert"
      className="border-bear/30 bg-bg-elev-1 text-bear rounded-lg border p-3 text-sm"
    >
      Indicators unavailable{message ? ` · ${message}` : ''}
    </div>
  );
}
