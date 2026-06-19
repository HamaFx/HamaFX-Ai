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

// Bespoke renderer for the `annotate_chart` tool part.
//
// Server component. Shows a one-line summary with counts per kind and a
// deep link into /chart/<symbol> with the relevant overlays pre-toggled.

import type { AnnotateChartKind } from '@hamafx/shared';
import { Link } from 'next-view-transitions';

import type { ToolPartProps } from './registry';

const KIND_LABELS: Record<AnnotateChartKind, string> = {
  swings: 'swings',
  bos_choch: 'BOS/CHoCH',
  fvg: 'FVG',
  order_blocks: 'OB',
  liquidity: 'liq',
  pdh_pdl: 'PDH/PDL',
  asian_range: 'Asian',
};

export function AnnotateChartPart({
  output,
  state,
  errorMessage,
}: ToolPartProps<'annotate_chart'>) {
  if (state === 'error') {
    return <ErrorCard {...(errorMessage ? { message: errorMessage } : {})} />;
  }
  if (state === 'loading' || !output) {
    return <SkeletonCard />;
  }

  // The chart's `OverlayToggle` only handles SMC kinds. PDH/PDL and
  // Asian-range render as price lines without a toggle, so we omit them
  // from the URL state — the deep link still pre-toggles whatever the
  // tool actually computed.
  const TOGGLEABLE: AnnotateChartKind[] = [
    'swings',
    'bos_choch',
    'fvg',
    'order_blocks',
    'liquidity',
  ];
  const overlayParam = TOGGLEABLE.filter((k) => (output.countsByKind[k] ?? 0) > 0).join(',');

  return (
    <div className="border-border bg-bg-elev-1 rounded-lg border p-3">
      <header className="mb-2 flex items-baseline justify-between gap-2">
        <h3 className="text-fg text-sm font-semibold">
          {output.symbol} · {output.tf} · annotated
        </h3>
        <span className="text-fg-muted font-mono text-[10px] tabular-nums">
          {output.markers.length}m / {output.priceLines.length}l
        </span>
      </header>

      <ul className="flex flex-wrap gap-1.5">
        {(Object.keys(output.countsByKind) as AnnotateChartKind[]).map((k) => {
          const c = output.countsByKind[k] ?? 0;
          if (c === 0) return null;
          return (
            <li
              key={k}
              className="bg-bg-elev-2 text-fg-muted rounded-full px-2 py-0.5 text-[11px] font-medium tabular-nums"
            >
              {KIND_LABELS[k]} · {c}
            </li>
          );
        })}
      </ul>

      <Link
        href={`/chart/${output.symbol}?tf=${output.tf}${overlayParam ? `&overlays=${overlayParam}` : ''}`}
        className="text-brand focus-visible:ring-brand mt-3 block min-h-[36px] text-right text-[11px] font-medium underline-offset-2 outline-none hover:underline focus-visible:ring-2"
      >
        open in chart →
      </Link>
    </div>
  );
}

function SkeletonCard() {
  return (
    <div
      className="border-border bg-bg-elev-1 rounded-lg border p-3"
      aria-busy="true"
      aria-label="Computing chart annotations"
    >
      <div className="bg-bg-elev-2 h-4 w-1/2 animate-pulse rounded" />
      <ul className="mt-2 flex gap-2">
        {[0, 1, 2].map((i) => (
          <li key={i} className="bg-bg-elev-2 h-5 w-14 animate-pulse rounded-full" />
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
      Annotation failed{message ? ` · ${message}` : ''}
    </div>
  );
}
