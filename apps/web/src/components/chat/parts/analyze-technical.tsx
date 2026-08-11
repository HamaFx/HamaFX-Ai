// SPDX-License-Identifier: Apache-2.0

// Bespoke renderer for the `analyze_technical` tool part.
//
// Server component. Renders one compact card per timeframe with .tabular-nums
// on every numeric field and text-bull/text-bear on the directional ones.
// `partial: true` surfaces a single line at the top so the user knows a tf
// was dropped due to a fetch failure.

import { IconActivity, IconAlertTriangle, IconChartCandle } from '@tabler/icons-react';
import type { AnalyzeTechnicalOutput, PerTimeframeReading } from '@kestrel/shared';
import { Link } from 'next-view-transitions';

import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';

import type { ToolPartProps } from './registry';

export function AnalyzeTechnicalPart({
  output,
  state,
  errorMessage,
}: ToolPartProps<'analyze_technical'>) {
  if (state === 'error') {
    return <ErrorCard message={errorMessage} />;
  }
  if (state === 'loading' || !output) {
    return <SkeletonCard />;
  }

  return (
    <Card as="section" aria-label={`${output.symbol} technical analysis`}>
      <header className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 items-start gap-2">
          <span className="bg-bg-elev-2 text-bull mt-0.5 inline-flex size-7 shrink-0 items-center justify-center rounded-sm">
            <IconChartCandle className="size-4" aria-hidden="true" />
          </span>
          <div className="min-w-0">
            <h3 className="text-fg text-body-sm font-semibold">{output.symbol} · technical</h3>
            <p className="text-fg-muted text-caption">Answer across {output.perTimeframe.length} timeframe{output.perTimeframe.length === 1 ? '' : 's'}</p>
          </div>
        </div>
        <time dateTime={new Date(output.asOf).toISOString()} className="text-fg-subtle shrink-0 font-mono text-caption">
          {new Date(output.asOf).toISOString().slice(0, 16).replace('T', ' ')}Z
        </time>
      </header>

      <div className="border-divider flex items-start gap-2 border-y py-2">
        <IconActivity className="text-brand mt-0.5 size-3.5 shrink-0" aria-hidden="true" />
        <p className="text-fg text-body-sm leading-snug">{output.summary}</p>
      </div>

      {output.partial ? (
        <p className="text-warn flex items-center gap-1.5 text-caption">
          <IconAlertTriangle className="size-3.5" aria-hidden="true" />
          Some timeframes unavailable.
        </p>
      ) : null}

      <ul className="grid grid-cols-1 gap-2 sm:grid-cols-3">
        {output.perTimeframe.map((r) => (
          <TfCard key={r.tf} symbol={output.symbol} reading={r} />
        ))}
      </ul>
    </Card>
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
    <li className="border-border bg-bg-elev-2 flex flex-col gap-2 rounded-sm border p-2.5">
      <div className="flex items-center justify-between gap-2">
        <Badge tone="neutral" className="text-caption">{reading.tf}</Badge>
        <span className={`text-caption font-semibold uppercase ${trendTone}`}>{reading.trend}</span>
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
        className="text-fg focus-visible:ring-fg mt-1 block min-h-[24px] text-right text-body-sm font-medium underline-offset-2 outline-none hover:underline focus-visible:ring-2"
      >
        view chart →
      </Link>
    </li>
  );
}

function SkeletonCard() {
  return (
    <Card
      as="section"
      role="status"
      className="p-3"
      aria-busy="true"
      aria-label="Analyzing technical posture"
    >
      <div className="bg-bg-elev-2 h-4 w-1/2 animate-pulse rounded-sm" />
      <div className="bg-bg-elev-2 mt-3 h-3 w-3/4 animate-pulse rounded-sm" />
      <ul className="mt-3 grid grid-cols-3 gap-2">
        {[0, 1, 2].map((i) => (
          <li key={i} className="bg-bg-elev-2 h-24 animate-pulse rounded-sm" />
        ))}
      </ul>
    </Card>
  );
}

function ErrorCard({ message }: { message?: string }) {
  return (
    <Card as="section" role="alert" aria-label={message ? `Technical analysis failed: ${message}` : 'Technical analysis failed'} className="border-danger/30 p-3 text-sm">
      <div className="flex items-start gap-2">
        <span className="mt-0.5 size-1.5 shrink-0 rounded-full bg-danger" aria-hidden="true" />
        <p className="text-danger"><span className="font-semibold">Technical analysis failed</span>{message ? <span className="text-fg-muted"> · {message}</span> : null}</p>
      </div>
    </Card>
  );
}
