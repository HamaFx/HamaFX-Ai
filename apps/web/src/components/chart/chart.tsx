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

// Chart — orchestrator. Composes <ChartCanvas>, <ChartRSI>, <ChartMACD>,
// <ChartATR>. Holds the imperative handle for zoom in/out/reset (the
// three controls only make sense on the main chart). Each sub-pane
// fetches its indicator result from the indicatorResults array and
// time-syncs with the main chart instance via the canvasHandleRef.
//
// Per PLAN.md §4.3 — chart split. The 939-LOC monolith becomes 8 files:
//   - chart.tsx (this orchestrator)
//   - chart-canvas.tsx — main candlestick pane
//   - chart-rsi.tsx — RSI sub-pane
//   - chart-macd.tsx — MACD sub-pane
//   - chart-atr.tsx — ATR sub-pane
//   - chart-types.ts — shared types
//   - chart-themes.ts — getThemeColors helper (legacy compat)
//   - chart-colors.ts — shared color constants
//   - use-chart-theme.ts — theme hook

import {IconMaximize, IconZoomIn, IconZoomOut} from '@tabler/icons-react';
import { useEffect, useMemo, useState } from 'react';
import { AnimatePresence, m } from 'motion/react';

import { cn } from '@/lib/cn';
import { priceDecimals } from '@hamafx/shared';

import { ChartATR } from './chart-atr';
import { ChartCanvas, type ChartCanvasHandle } from './chart-canvas';
import { ChartMACD } from './chart-macd';
import { ChartRSI } from './chart-rsi';
import type { ChartProps } from './chart-types';

export { type ChartSettings, type ChartProps } from './chart-types';
export { getThemeColors } from './chart-themes';

export function Chart({
  symbol,
  candles,
  indicatorResults,
  heightClass = 'h-[60svh]',
  className,
  overlays,
  settings,
}: ChartProps) {
  const [mainChart, setMainChart] = useState<ChartCanvasHandle | null>(null);

  // Apply decimals on mount / symbol change
  useEffect(() => {
    if (mainChart) {
      mainChart.applyDecimals(priceDecimals(symbol));
    }
  }, [mainChart, symbol]);

  const rsiResult = useMemo(() => indicatorResults?.find((r) => r.kind === 'rsi'), [indicatorResults]);
  const macdResult = useMemo(() => indicatorResults?.find((r) => r.kind === 'macd'), [indicatorResults]);
  const atrResult = useMemo(() => indicatorResults?.find((r) => r.kind === 'atr'), [indicatorResults]);

  return (
    <div className={cn('flex flex-col gap-2', className)}>
      {/* Primary Candlestick Pane */}
      <div className="bg-bg-elev-1 border border-border relative overflow-hidden rounded-sm">
        <ChartCanvas
          symbol={symbol}
          candles={candles}
          {...(indicatorResults !== undefined ? { indicatorResults } : {})}
          {...(overlays !== undefined ? { overlays } : {})}
          settings={settings ?? null}
          heightClass={heightClass}
          handleRef={setMainChart}
        />

        {/* Floating zoom and pan controls overlay */}
        <div className="border-border bg-bg-elev-2 absolute right-4 bottom-4 z-10 flex items-center gap-1 rounded-sm border p-1 shadow-lg ">
          <button
            onClick={() => mainChart?.zoomIn()}
            className="text-fg-muted hover:bg-bg-elev-3 hover:text-fg flex size-11 cursor-pointer items-center justify-center rounded-sm transition-all"
            title="Zoom In"
            type="button"
          >
            <IconZoomIn className="size-4" />
          </button>
          <button
            onClick={() => mainChart?.zoomOut()}
            className="text-fg-muted hover:bg-bg-elev-3 hover:text-fg flex size-11 cursor-pointer items-center justify-center rounded-sm transition-all"
            title="Zoom Out"
            type="button"
          >
            <IconZoomOut className="size-4" />
          </button>
          <button
            onClick={() => mainChart?.resetView()}
            className="text-fg-muted hover:bg-bg-elev-3 hover:text-fg flex size-11 cursor-pointer items-center justify-center rounded-sm transition-all"
            title="Reset View"
            type="button"
          >
            <IconMaximize className="size-4" />
          </button>
        </div>
      </div>

      {/* RSI oscillator sub-pane */}
      <AnimatePresence>
        {rsiResult ? (
          <m.div
            key="rsi-pane"
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            transition={{ duration: 0.2 }}
            className="bg-bg-elev-1 border-border relative h-[120px] overflow-hidden rounded-sm border"
          >
            <ChartRSI
              result={rsiResult}
              candles={candles}
              mainChart={mainChart}
              settings={settings ?? null}
            />
            <div className="text-fg-subtle pointer-events-none absolute top-2 left-3 z-10 text-caption font-bold uppercase tracking-wider">
              RSI (14)
            </div>
          </m.div>
        ) : null}
      </AnimatePresence>

      {/* MACD oscillator sub-pane */}
      <AnimatePresence>
        {macdResult ? (
          <m.div
            key="macd-pane"
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            transition={{ duration: 0.2 }}
            className="bg-bg-elev-1 border-border relative h-[140px] overflow-hidden rounded-sm border"
          >
            <ChartMACD
              result={macdResult}
              candles={candles}
              mainChart={mainChart}
              settings={settings ?? null}
            />
            <div className="text-fg-subtle pointer-events-none absolute top-2 left-3 z-10 text-caption font-bold uppercase tracking-wider">
              MACD (12, 26, 9)
            </div>
          </m.div>
        ) : null}
      </AnimatePresence>

      {/* ATR Volatility sub-pane */}
      <AnimatePresence>
        {atrResult ? (
          <m.div
            key="atr-pane"
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            transition={{ duration: 0.2 }}
            className="bg-bg-elev-1 border-border relative h-[120px] overflow-hidden rounded-sm border"
          >
            <ChartATR
              result={atrResult}
              candles={candles}
              mainChart={mainChart}
              settings={settings ?? null}
            />
            <div className="text-fg-subtle pointer-events-none absolute top-2 left-3 z-10 text-caption font-bold uppercase tracking-wider">
              ATR (14)
            </div>
          </m.div>
        ) : null}
      </AnimatePresence>
    </div>
  );
}
