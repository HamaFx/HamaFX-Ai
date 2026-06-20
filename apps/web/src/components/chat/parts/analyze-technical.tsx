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

// Bespoke renderer for the `analyze_technical` tool part.
//
// Server component. Renders one compact card per timeframe with .tabular-nums
// on every numeric field and text-bull/text-bear on the directional ones.
// `partial: true` surfaces a single line at the top so the user knows a tf
// was dropped due to a fetch failure.

import type { AnalyzeTechnicalOutput, PerTimeframeReading } from '@hamafx/shared';
import { Link } from 'next-view-transitions';

import type { ToolPartProps } from './registry';

export function AnalyzeTechnicalPart({
  output,
  state,
  errorMessage,
}: ToolPartProps<'analyze_technical'>) {
  if (state === 'error') {
    return <ErrorCard {...(errorMessage ? { message: errorMessage } : {})} />;
  }
  if (state === 'loading' || !output) {
    return <SkeletonCard />;
  }

  return (
    <div className="border-border bg-bg-elev-1 rounded-lg border p-3">
      <header className="mb-2 flex items-baseline justify-between gap-2">
        <h3 className="text-fg text-sm font-semibold">
          {output.symbol} · technical
        </h3>
        <span className="text-fg-muted font-mono text-caption">
          {new Date(output.asOf).toISOString().slice(0, 16).replace('T', ' ')}Z
        </span>
      </header>

      {output.partial ? (
        <p className="text-warn mb-2 text-body-sm">⚠ Some timeframes unavailable.</p>
      ) : null}

      <p className="text-fg-muted mb-3 text-xs leading-snug">{output.summary}</p>

      <ul className="grid grid-cols-1 gap-2 sm:grid-cols-3">
        {output.perTimeframe.map((r) => (
          <TfCard key={r.tf} symbol={output.symbol} reading={r} />
        ))}
      </ul>
    </div>
  );
}

function TfCard({
  symbol,
  reading,
}: {
  symbol: AnalyzeTechnicalOutput['symbol'];
  reading: PerTimeframeReading;
}) {
  const trendTone =
    reading.trend === 'up'
      ? 'text-bull'
      : reading.trend === 'down'
        ? 'text-bear'
        : 'text-fg-muted';
  const biasTone =
    reading.bias === 'bullish'
      ? 'text-bull'
      : reading.bias === 'bearish'
        ? 'text-bear'
        : 'text-fg-muted';

  return (
    <li className="border-border bg-bg-elev-2 flex flex-col gap-1.5 rounded-md border p-2.5">
      <div className="flex items-baseline justify-between gap-2">
        <span className="text-fg text-xs font-semibold uppercase tracking-wide">
          {reading.tf}
        </span>
        <span className={`text-body-sm font-medium ${trendTone}`}>{reading.trend}</span>
      </div>

      <dl className="grid grid-cols-2 gap-x-2 gap-y-0.5 text-body-sm tabular-nums">
        <dt className="text-fg-subtle">bias</dt>
        <dd className={`text-right font-medium ${biasTone}`}>{reading.bias}</dd>

        <dt className="text-fg-subtle">RSI14</dt>
        <dd className="text-fg text-right">{reading.momentum.rsi14.toFixed(1)}</dd>

        <dt className="text-fg-subtle">MACD h</dt>
        <dd
          className={`text-right ${reading.momentum.macdHist >= 0 ? 'text-bull' : 'text-bear'}`}
        >
          {reading.momentum.macdHist.toFixed(4)}
        </dd>

        {reading.levels.pivot !== null ? (
          <>
            <dt className="text-fg-subtle">pivot</dt>
            <dd className="text-fg text-right">{reading.levels.pivot.toFixed(2)}</dd>
          </>
        ) : null}
        {reading.levels.atr14 !== null ? (
          <>
            <dt className="text-fg-subtle">ATR14</dt>
            <dd className="text-fg text-right">{reading.levels.atr14.toFixed(2)}</dd>
          </>
        ) : null}

        {reading.structure.latestStructureEvent ? (
          <>
            <dt className="text-fg-subtle">struct</dt>
            <dd className="text-fg text-right text-caption">
              {reading.structure.latestStructureEvent}
            </dd>
          </>
        ) : null}
      </dl>

      <Link
        href={`/chart/${symbol}?tf=${reading.tf}`}
        className="text-brand focus-visible:ring-brand mt-1 block min-h-[24px] text-right text-body-sm font-medium underline-offset-2 outline-none hover:underline focus-visible:ring-2"
      >
        view chart →
      </Link>
    </li>
  );
}

function SkeletonCard() {
  return (
    <div
      className="border-border bg-bg-elev-1 rounded-lg border p-3"
      aria-busy="true"
      aria-label="Analyzing technical posture"
    >
      <div className="bg-bg-elev-2 h-4 w-1/2 animate-pulse rounded" />
      <div className="bg-bg-elev-2 mt-3 h-3 w-3/4 animate-pulse rounded" />
      <ul className="mt-3 grid grid-cols-3 gap-2">
        {[0, 1, 2].map((i) => (
          <li key={i} className="bg-bg-elev-2 h-24 animate-pulse rounded-md" />
        ))}
      </ul>
    </div>
  );
}

function ErrorCard({ message }: { message?: string }) {
  return (
    <div
      role="alert"
      className="border-bear/30 bg-bg-elev-1 text-bear rounded-lg border p-3 text-sm"
    >
      Technical analysis failed{message ? ` · ${message}` : ''}
    </div>
  );
}
