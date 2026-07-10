'use client';

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

// Bespoke renderer for the `get_intermarket_resonance` tool part.
//
// Client component. Renders an elegant intermarket gauge mapping the gold/yield
// divergence z-score alongside a historical timeline.

import {IconTrendingDown, IconTrendingUp, IconHelpCircle} from '@tabler/icons-react';
import type { ToolPartProps } from './registry';

export function GetIntermarketResonancePart({
  output,
  state,
  errorMessage,
}: ToolPartProps<'get_intermarket_resonance'>) {
  if (state === 'error') {
    return <ErrorCard {...(errorMessage ? { message: errorMessage } : {})} />;
  }
  if (state === 'loading' || !output) {
    return <SkeletonCard />;
  }

  if (output.observations.length === 0) {
    return (
      <div className="border-border bg-bg-elev-1 rounded-sm border p-3">
        <p className="text-fg-muted text-sm">{output.narrative}</p>
      </div>
    );
  }

  const roundedDivergence = Number(output.currentDivergence.toFixed(2));
  const roundedYield = Number(output.currentRealYield.toFixed(2));
  const roundedInflation = Number(output.currentBreakevenInflation.toFixed(2));

  // Determine styling based on the active regime
  let regimeColor = 'text-fg';
  let regimeBg = 'bg-bg-elev-3';
  let regimeLabel = 'CONVERGENT';
  let Icon = IconHelpCircle;

  if (output.regime === 'divergent_hedging') {
    regimeColor = 'text-bull';
    regimeBg = 'bg-bull/10';
    regimeLabel = 'HEDGING PREMIUM (BULLISH OVERRIDE)';
    Icon = IconTrendingUp;
  } else if (output.regime === 'divergent_discount') {
    regimeColor = 'text-bear';
    regimeBg = 'bg-bear/10';
    regimeLabel = 'YIELD DISCOUNT (OVERSOLD OVERRIDE)';
    Icon = IconTrendingDown;
  }

  // Calculate percentage offset for the horizontal needle gauge (bounds [-3, +3])
  const clampedDiv = Math.max(-3, Math.min(3, roundedDivergence));
  const needlePercent = ((clampedDiv + 3) / 6) * 100;

  return (
    <div className="border-border bg-bg-elev-1 flex flex-col gap-4 rounded-sm border p-4 shadow-md ">
      <header className="flex items-center justify-between border-b border-divider pb-2">
        <div className="flex flex-col">
          <span className="text-fg-subtle text-caption uppercase font-bold tracking-wider">
            Intermarket resonance radar
          </span>
          <h3 className="text-fg text-sm font-bold mt-0.5">
            {output.symbol} Opportunity Cost Divergence
          </h3>
        </div>
        <span className={`inline-flex items-center gap-1 rounded-sm px-2.5 py-0.5 text-xs font-bold ${regimeBg} ${regimeColor}`}>
          <Icon className="size-3" />
          {regimeLabel}
        </span>
      </header>

      {/* Main Stats Block */}
      <div className="grid grid-cols-3 gap-3 text-center">
        <div className="bg-bg-elev-2/50 rounded-sm p-2 border border-border/25">
          <span className="text-fg-subtle text-xs block uppercase font-medium">10Y Real Yield</span>
          <span className="text-fg text-base font-extrabold tabular-nums mt-0.5 block">{roundedYield}%</span>
        </div>
        <div className="bg-bg-elev-2/50 rounded-sm p-2 border border-border/25">
          <span className="text-fg-subtle text-xs block uppercase font-medium">10Y Breakeven</span>
          <span className="text-fg text-base font-extrabold tabular-nums mt-0.5 block">{roundedInflation}%</span>
        </div>
        <div className="bg-bg-elev-2/50 rounded-sm p-2 border border-border/25">
          <span className="text-fg-subtle text-xs block uppercase font-medium">z-score divergence</span>
          <span className={`text-base font-extrabold tabular-nums mt-0.5 block ${regimeColor}`}>
            {roundedDivergence >= 0 ? `+${roundedDivergence}` : roundedDivergence} SD
          </span>
        </div>
      </div>

      {/* Gauge Needle Visual */}
      <div className="flex flex-col gap-1.5 px-1 mt-1">
        <div className="flex justify-between text-xs text-fg-subtle">
          <span>-3.0 SD (Discount)</span>
          <span className="font-bold">0.0 (Fair Value)</span>
          <span>+3.0 SD (Premium)</span>
        </div>
        <div className="relative w-full h-2.5 bg-bg-elev-3 rounded-sm overflow-hidden border border-divider">
          {/* Neutral range center bar */}
          <div className="absolute left-[25%] right-[25%] top-0 bottom-0 bg-fg-subtle/10" />
          {/* Needle indicator */}
          <div 
            className={`absolute top-0 bottom-0 w-1.5 rounded-sm shadow-lg transition-all duration-500 ${
              output.regime === 'divergent_hedging' ? 'bg-bull' : output.regime === 'divergent_discount' ? 'bg-bear' : 'bg-fg'
            }`}
            style={{ left: `calc(${needlePercent}% - 3px)` }}
          />
        </div>
      </div>

      <p className="text-fg-muted text-xs leading-[1.4] leading-normal mt-0.5">
        {output.narrative}
      </p>

      {/* Historical observations list */}
      <div className="flex flex-col gap-2 mt-1">
        <h4 className="text-fg text-body-sm font-bold uppercase tracking-wider">Historical Resonance Log</h4>
        <ul className="flex flex-col gap-1 border-t border-divider/50 pt-2">
          {output.observations.slice(-5).reverse().map((obs) => (
            <li key={obs.date} className="flex items-center justify-between text-body-sm py-0.5">
              <span className="text-fg-subtle tabular-nums">{obs.date}</span>
              <div className="flex items-center gap-4">
                <span className="text-fg-muted tabular-nums">Yield: {obs.realYieldPct?.toFixed(2)}%</span>
                <span className={`tabular-nums font-medium min-w-[50px] text-right ${
                  obs.divergenceScore === null ? 'text-fg-subtle' : obs.divergenceScore >= 1.5 ? 'text-bull' : obs.divergenceScore <= -1.5 ? 'text-bear' : 'text-fg'
                }`}>
                  {obs.divergenceScore === null ? '—' : obs.divergenceScore >= 0 ? `+${obs.divergenceScore.toFixed(2)} SD` : `${obs.divergenceScore.toFixed(2)} SD`}
                </span>
              </div>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

function SkeletonCard() {
  return (
    <div className="border-border bg-bg-elev-1 rounded-sm border p-4" aria-busy="true" aria-label="Loading Intermarket Resonance">
      <div className="flex items-center justify-between">
        <div className="flex flex-col gap-1 w-2/3">
          <div className="bg-bg-elev-2 h-3 w-1/3 animate-pulse rounded-sm" />
          <div className="bg-bg-elev-2 h-4 w-2/3 animate-pulse rounded-sm mt-1" />
        </div>
        <div className="bg-bg-elev-2 h-5 w-24 animate-pulse rounded-sm" />
      </div>
      <div className="grid grid-cols-3 gap-3 mt-4">
        {[0, 1, 2].map((i) => (
          <div key={i} className="bg-bg-elev-2 h-12 animate-pulse rounded-sm" />
        ))}
      </div>
      <div className="bg-bg-elev-2 h-8 w-full animate-pulse rounded-sm mt-4" />
    </div>
  );
}

function ErrorCard({ message }: { message?: string }) {
  return (
    <div role="alert" className="border-danger/30 bg-bg-elev-1 text-danger rounded-sm border p-4 text-sm font-semibold">
      Intermarket resonance radar failed {message ? ` · ${message}` : ''}
    </div>
  );
}
