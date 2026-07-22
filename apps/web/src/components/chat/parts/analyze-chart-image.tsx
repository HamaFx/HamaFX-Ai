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

// Bespoke renderer for the `analyze_chart_image` tool part.
//
// Server component. Renders the structured technical readout from the
// vision model — observed paragraph, labelled levels, an optional deep
// link to /chart/<symbol>?tf=<tf>&overlays=<...> when the model emitted
// an overlay shape we can re-render via the existing OverlaySet pipeline.

import { priceDecimals, type AnalyzeChartImageOutput, type AnnotateChartKind } from '@hamafx/shared';
import { Link } from 'next-view-transitions';

import type { ToolPartProps } from './registry';

const TOGGLEABLE: AnnotateChartKind[] = [
  'swings',
  'bos_choch',
  'fvg',
  'order_blocks',
  'liquidity',
];

export function AnalyzeChartImagePart({
  output,
  state,
  errorMessage,
}: ToolPartProps<'analyze_chart_image'>) {
  if (state === 'error') {
    return <ErrorCard message={errorMessage} />;
  }
  if (state === 'loading' || !output) {
    return <SkeletonCard />;
  }

  return (
    <div className="border-border bg-bg-elev-1 flex flex-col gap-3 rounded-sm border p-3">
      <header className="flex items-baseline justify-between gap-2">
        <h3 className="text-fg text-sm font-semibold">
          {output.symbol ?? 'Chart'} {output.tf ? `· ${output.tf}` : ''} · vision
        </h3>
        <span className="text-fg-subtle font-mono text-caption">{shortRef(output.sourceImageRef)}</span>
      </header>

      {output.observed ? (
        <p className="text-fg-muted text-xs leading-[1.4]">{output.observed}</p>
      ) : null}

      {output.levels.length > 0 ? <LevelsList output={output} /> : null}

      {output.overlay && output.symbol && output.tf ? (
        <Link
          href={buildOverlayHref(output)}
          className="text-fg focus-visible:ring-fg text-right text-body-sm font-medium underline-offset-2 outline-none hover:underline focus-visible:ring-2"
        >
          apply on chart →
        </Link>
      ) : null}
    </div>
  );
}

function LevelsList({ output }: { output: AnalyzeChartImageOutput }) {
  const decimals = output.symbol ? priceDecimals(output.symbol) : 4;
  return (
    <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-body-sm tabular-nums">
      {output.levels.map((l, i) => (
        <Row key={`${l.label}-${l.price}-${i}`} label={l.label} value={l.price.toFixed(decimals)} />
      ))}
    </dl>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <>
      <dt className="text-fg-subtle truncate">{label}</dt>
      <dd className="text-fg text-right">{value}</dd>
    </>
  );
}

function buildOverlayHref(output: AnalyzeChartImageOutput): string {
  const overlay = output.overlay;
  if (!overlay) return `/chart/${output.symbol}/structure`;
  const kinds = TOGGLEABLE.filter((k) => (overlay.countsByKind[k] ?? 0) > 0).join(',');
  const params = [`tf=${output.tf}`];
  if (kinds) params.push(`overlays=${kinds}`);
  return `/chart/${output.symbol}/structure?${params.join('&')}`;
}

function shortRef(s: string): string {
  if (s.startsWith('sha256:')) return s.slice(7, 15);
  return s.slice(0, 8);
}

function SkeletonCard() {
  return (
    <div
      className="border-border bg-bg-elev-1 rounded-sm border p-3"
      aria-busy="true"
      aria-label="Analysing chart screenshot"
    >
      <div className="bg-bg-elev-2 h-4 w-1/2 animate-pulse rounded-sm" />
      <div className="bg-bg-elev-2 mt-3 h-3 w-3/4 animate-pulse rounded-sm" />
      <div className="bg-bg-elev-2 mt-2 h-3 w-2/3 animate-pulse rounded-sm" />
    </div>
  );
}

function ErrorCard({ message }: { message?: string }) {
  return (
    <div
      role="alert"
      className="border-danger/30 bg-bg-elev-1 text-danger rounded-sm border p-3 text-sm"
    >
      Vision analysis failed{message ? ` · ${message}` : ''}
    </div>
  );
}
