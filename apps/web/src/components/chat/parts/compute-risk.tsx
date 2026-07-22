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

// Bespoke renderer for the `compute_risk` tool part.
//
// Position-sizing card. Three rows of dense, copy-friendly numbers — the
// trader's actual ticket-fill checklist — plus a one-line summary the
// agent can echo verbatim.
//
// Phase 1.2e — adds an R:R gauge next to the RR value. Client component
// (uses motion for the gauge segment entrance).

'use client';

import { m } from 'motion/react';

import type { ToolPartProps } from './registry';

export function ComputeRiskPart({ output, state, errorMessage }: ToolPartProps<'compute_risk'>) {
  if (state === 'error') return <ErrorCard message={errorMessage} />;
  if (state === 'loading' || !output) return <SkeletonCard />;

  const tone = output.invalidDirection ? 'border-warn/40' : 'border-border';

  return (
    <div className={`bg-bg-elev-1 flex flex-col gap-3 rounded-sm border p-3 ${tone}`}>
      <header className="flex items-baseline justify-between gap-2">
        <h3 className="text-fg text-sm font-semibold">
          {output.side === 'long' ? 'Long' : 'Short'} {output.symbol} · risk{' '}
          {pretty(output.riskUsd, 2)} USD
        </h3>
        {output.rrRatio !== null ? (
          <span className="flex items-center gap-2">
            <RrGauge rrRatio={output.rrRatio} />
            <span
              className={`text-body-sm tabular-nums ${output.rrRatio >= 1 ? 'text-bull' : 'text-bear'}`}
            >
              RR {output.rrRatio.toFixed(2)}
            </span>
          </span>
        ) : null}
      </header>

      <dl className="grid grid-cols-2 gap-2 text-xs">
        <Row k="Entry" v={pretty(output.entry, 5)} />
        <Row k="Stop" v={pretty(output.stop, 5)} />
        <Row k="Pips to stop" v={`${pretty(output.pipsToStop, 1)}`} />
        <Row
          k="Pips to target"
          v={output.pipsToTarget !== null ? pretty(output.pipsToTarget, 1) : '—'}
        />
        <Row k="Size (lots)" v={pretty(output.positionSizeLots, 2)} />
        <Row k="Size (units)" v={pretty(Math.round(output.positionSizeUnits), 0)} />
        <Row k="Pip $/lot" v={`$${pretty(output.pipValueUsdPerLot, 2)}`} />
        <Row
          k="Reward"
          v={output.rewardUsd !== null ? `$${pretty(output.rewardUsd, 2)}` : '—'}
        />
      </dl>

      <p className="text-fg-muted text-xs">{output.summary}</p>

      {output.invalidDirection ? (
        <p
          role="alert"
          className="text-warn border-warn/30 bg-warn/5 rounded-sm border px-2 py-1 text-body-sm"
        >
          Stop is on the wrong side of entry for this direction — the agent suggested an inverted
          setup.
        </p>
      ) : null}
    </div>
  );
}

function Row({ k, v }: { k: string; v: string }) {
  return (
    <div className="flex items-baseline justify-between gap-2 border-b border-dashed border-border/50 pb-1">
      <dt className="text-fg-muted">{k}</dt>
      <dd className="text-fg font-medium tabular-nums">{v}</dd>
    </div>
  );
}

// Phase 1.2e — R:R gauge. A horizontal bar split into risk (left, bear) and
// reward (right, bull), proportional to the R:R ratio. Animates on mount.
function RrGauge({ rrRatio }: { rrRatio: number }) {
  // risk segment = 1 / (1 + rr), reward = rr / (1 + rr).
  const safe = Math.max(0, rrRatio);
  const total = 1 + safe;
  const riskPct = (1 / total) * 100;
  const rewardPct = (safe / total) * 100;
  return (
    <span
      className="inline-flex h-1.5 w-20 overflow-hidden rounded-sm bg-bg-elev-3"
      role="img"
      aria-label={`Risk to reward gauge: 1 to ${rrRatio.toFixed(2)}`}
    >
      <m.div
        className="h-full bg-bear/30"
        initial={{ width: 0 }}
        animate={{ width: `${riskPct}%` }}
        transition={{ duration: 0.4, ease: 'easeOut' }}
      />
      <m.div
        className="h-full bg-bull/30"
        initial={{ width: 0 }}
        animate={{ width: `${rewardPct}%` }}
        transition={{ duration: 0.4, ease: 'easeOut' }}
      />
    </span>
  );
}

function pretty(n: number, decimals: number): string {
  if (!Number.isFinite(n)) return '—';
  return n.toLocaleString(undefined, {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
}

function SkeletonCard() {
  return (
    <div
      className="border-border bg-bg-elev-1 rounded-sm border p-3"
      aria-busy="true"
      aria-label="Computing position size"
    >
      <div className="bg-bg-elev-2 h-4 w-1/2 animate-pulse rounded-sm" />
      <div className="bg-bg-elev-2 mt-3 h-24 animate-pulse rounded-sm" />
    </div>
  );
}

function ErrorCard({ message }: { message?: string }) {
  return (
    <div
      role="alert"
      className="border-danger/30 bg-bg-elev-1 text-danger rounded-sm border p-3 text-sm"
    >
      Risk calc failed{message ? ` · ${message}` : ''}
    </div>
  );
}
