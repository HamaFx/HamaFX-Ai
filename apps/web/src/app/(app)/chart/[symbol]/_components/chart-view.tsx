/* eslint-disable @typescript-eslint/no-explicit-any */
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

// Client orchestration for the upgraded chart page.
// Combines dynamic price feeds, structure events, active indicators, and customized styling.

import { type Symbol, type Candle, msPerTimeframe } from '@hamafx/shared';
import { IconAdjustmentsHorizontal } from '@tabler/icons-react';
import { Link } from 'next-view-transitions';
import React, { useEffect, useMemo, useRef, useState } from 'react';

import { Chart, type ChartSettings } from '@/components/chart/chart';
import { ChartSettingsDrawer, type ChartIndicators } from '@/components/chart/chart-settings-drawer';
import { useOverlayToggles } from '@/components/chart/overlay-toggle';
import {
  buildOverlays,
  type OverlayPalette,
  type OverlayToggles,
} from '@/components/chart/overlays';
import { PriceTag } from '@/components/chart/price-tag';
import { SymbolPicker } from '@/components/chart/symbol-picker';
import { TimeframePicker } from '@/components/chart/timeframe-picker';
import { PinToChat } from '@/components/chart/pin-to-chat';
import { StaleIndicator } from '@/components/ui/stale-indicator';
import { Tooltip } from '@/components/ui/tooltip';
import { useChartData } from '@/hooks/use-chart-data';
import { usePrice } from '@/hooks/use-prices';
import { useStructure } from '@/hooks/use-structure';
import { useTimeframe } from '@/hooks/use-tf';
import { useLocalStorage } from '@/hooks/use-local-storage';

import { ChartEmpty } from './chart-empty';
import { ChartError } from './chart-error';
import { ChartSkeleton } from './chart-skeleton';
import { OverlaySheet } from './overlay-sheet';

class ChartErrorBoundary extends React.Component<
  { children: React.ReactNode; onRetry?: () => void },
  { hasError: boolean; error: Error | null }
> {
  constructor(props: { children: React.ReactNode; onRetry?: () => void }) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error) {
    return { hasError: true, error };
  }

  override componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    console.error('[chart-error-boundary] Caught chart error:', error, errorInfo);
  }

  override render() {
    if (this.state.hasError) {
      return (
        <ChartError
          error={this.state.error ?? new Error('Chart rendering failed')}
          onRetry={() => {
            this.setState({ hasError: false, error: null });
            this.props.onRetry?.();
          }}
        />
      );
    }
    return this.props.children;
  }
}

const PALETTE: OverlayPalette = {
  bull: '#22C55E',
  bear: '#EF4444',
  warn: '#F59E0B',
  muted: '#808080',
};

const DEFAULT_INDICATORS: ChartIndicators = {
  ema20: false,
  ema50: false,
  ema200: false,
  sma50: false,
  sma100: false,
  bollinger: false,
  rsi: false,
  macd: false,
  atr: false,
  pivots: false,
};

const DEFAULT_SETTINGS: ChartSettings = {
  theme: 'black',
  gridStyle: 'solid',
};

interface ChartConfig {
  indicators: ChartIndicators;
  settings: ChartSettings;
}

export function ChartView({ symbol, watchlist }: { symbol: Symbol; watchlist: string[] }) {
  const [tf, setTf] = useTimeframe();
  const [activeOverlays, toggleOverlay] = useOverlayToggles();
  const [chartKey, setChartKey] = useState(0);

  const containerRef = useRef<HTMLDivElement | null>(null);
  const [visible, setVisible] = useState(true);

  // Indicators and customizer settings state backed by useLocalStorage
  const [config, setConfig] = useLocalStorage<ChartConfig>('hfx_chart_config', {
    indicators: DEFAULT_INDICATORS,
    settings: DEFAULT_SETTINGS,
  });

  const indicators = config.indicators;
  const settings = config.settings;

  const handleIndicatorsChange = (nextIndicators: ChartIndicators) => {
    setConfig((prev) => ({ ...prev, indicators: nextIndicators }));
  };

  const handleSettingsChange = (nextSettings: ChartSettings) => {
    setConfig((prev) => ({ ...prev, settings: nextSettings }));
  };

  useEffect(() => {
    const el = containerRef.current;
    if (!el || typeof IntersectionObserver === 'undefined') return;
    const obs = new IntersectionObserver(
      ([entry]) => setVisible(Boolean(entry?.isIntersecting)),
      { rootMargin: '128px' },
    );
    obs.observe(el);
    return () => obs.disconnect();
  }, []);

  // Compute indicators query requests based on toggles
  const activeIndicatorsRequest = useMemo(() => {
    const list: any[] = [];
    if (indicators.ema20) list.push({ kind: 'ema', params: { period: 20 } });
    if (indicators.ema50) list.push({ kind: 'ema', params: { period: 50 } });
    if (indicators.ema200) list.push({ kind: 'ema', params: { period: 200 } });
    if (indicators.sma50) list.push({ kind: 'sma', params: { period: 50 } });
    if (indicators.sma100) list.push({ kind: 'sma', params: { period: 100 } });
    if (indicators.bollinger) list.push({ kind: 'bollinger', params: { period: 20, stdDev: 2 } });
    if (indicators.rsi) list.push({ kind: 'rsi', params: { period: 14 } });
    if (indicators.macd) list.push({ kind: 'macd', params: { fast: 12, slow: 26, signal: 9 } });
    if (indicators.atr) list.push({ kind: 'atr', params: { period: 14 } });
    if (indicators.pivots) list.push({ kind: 'pivots', params: {} });
    return list;
  }, [indicators]);

  // Unified chart data load (candles and indicators in one request)
  const {
    candles,
    indicatorResults,
    isLoading,
    isFetching,
    error,
    refetch,
  } = useChartData(symbol, tf, activeIndicatorsRequest, 300, { enabled: visible });

  // Stream live prices tick-by-tick into the current candle.
  // Gate on chart visibility (IntersectionObserver) so off-screen
  // tabs don't waste bandwidth on price polling.
  const { tick } = usePrice(symbol, { enabled: visible });

  const candlesWithLive = useMemo(() => {
    if (!candles || candles.length === 0) return candles;
    if (!tick) return candles;

    const tfMs = msPerTimeframe(tf);
    const lastCandle = candles[candles.length - 1]!;
    
    // Calculate the start time of the timeframe bucket that this tick belongs to.
    const barTime = Math.floor(tick.ts / tfMs) * tfMs;

    // Guard 1: Verify tick is for correct symbol
    if (tick.symbol && tick.symbol !== symbol) return candles;
    // Guard 2: Reject stale ticks
    if (barTime < lastCandle.t) return candles;
    // Guard 3: Reject far-future ticks (clock skew)
    if (barTime > lastCandle.t + tfMs * 2) return candles;

    if (barTime === lastCandle.t) {
      const updatedLast: Candle = {
        ...lastCandle,
        h: Math.max(lastCandle.h, tick.mid),
        l: Math.min(lastCandle.l, tick.mid),
        c: tick.mid,
        fetchedAt: Date.now(),
      };
      return [...candles.slice(0, -1), updatedLast];
    } else if (barTime > lastCandle.t) {
      const newCandle: Candle = {
        symbol: lastCandle.symbol,
        tf: lastCandle.tf,
        t: barTime,
        o: tick.mid,
        h: tick.mid,
        l: tick.mid,
        c: tick.mid,
        v: null,
        source: 'live',
        fetchedAt: Date.now(),
      };
      return [...candles, newCandle];
    }

    return candles;
  }, [candles, tick, tf, symbol]);

  // Only fetch structure when at least one overlay is on.
  const overlaysOn = activeOverlays.length > 0;
  const { data: structure } = useStructure(symbol, tf, {
    enabled: overlaysOn,
    ...(overlaysOn ? { kinds: activeOverlays } : {}),
  });

  // Reference price: capture the last candle's close once and pin it
  // using a ref so new bars don't shift the reference point.
  const closeRef = useRef<number | null>(null);
  const referenceClose = useMemo(() => {
    if (!candles || candles.length === 0) return null;
    if (closeRef.current === null) {
      closeRef.current = candles[candles.length - 1]?.c ?? null;
    }
    return closeRef.current;
  }, [candles]);

  // Convert active list → boolean record for `buildOverlays`.
  const toggleRecord = useMemo<OverlayToggles>(
    () => ({
      swings: activeOverlays.includes('swings'),
      bos_choch: activeOverlays.includes('bos_choch'),
      fvg: activeOverlays.includes('fvg'),
      order_blocks: activeOverlays.includes('order_blocks'),
      liquidity: activeOverlays.includes('liquidity'),
    }),
    [activeOverlays],
  );

  const candlesRef = useRef(candles);
  candlesRef.current = candles;

  const overlaySet = useMemo(() => {
    const current = candlesRef.current;
    if (!structure || !current) return null;
    const times = current.map((c) => c.t);
    return buildOverlays(structure, times, PALETTE, toggleRecord);
  }, [structure, toggleRecord]);

  return (
    <div ref={containerRef} className="-mx-4 flex flex-col animate-in fade-in duration-300">
      {/* Sticky floating sub-header (Dynamic Island style) */}
      <div
        className="sticky z-20 px-4 pt-3 pb-2 transition-all"
        style={{ top: 'calc(var(--topbar-h) + env(safe-area-inset-top))' }}
      >
        <header className="border border-border bg-bg-elev-1 rounded-sm flex flex-col gap-3 p-3">
          <div className="flex flex-wrap items-center justify-between gap-3 px-1">
            <SymbolPicker active={symbol} watchlist={watchlist} />
            <PriceTag symbol={symbol} referencePrice={referenceClose} />
          </div>
          <div className="flex flex-wrap items-center justify-between gap-2 px-1">
            <div className="scrollbar-hide -mx-1 flex-1 overflow-x-auto px-1">
              <TimeframePicker value={tf} onChange={setTf} />
            </div>
            <div className="flex shrink-0 items-center gap-2">
              <StaleIndicator isFetching={isFetching && !isLoading} />

              {/* Phase A — UX_UPGRADE_PLAN.md item 1: Pin the current
                  symbol to a new chat thread and deep-link into it. */}
              <PinToChat symbol={symbol} />

              {/* Overlays Sheet */}
              <OverlaySheet active={activeOverlays} onToggle={toggleOverlay} />
              
              {/* Premium preferences & indicators Customizer */}
              <ChartSettingsDrawer
                settings={settings}
                onSettingsChange={handleSettingsChange}
                indicators={indicators}
                onIndicatorsChange={handleIndicatorsChange}
                trigger={
                  <Tooltip label="Preferences">
                    <button
                      aria-label="Preferences"
                      className="bg-bg-elev-1 border border-border text-fg-muted hover:text-fg focus-visible:ring-fg inline-flex size-11 items-center justify-center rounded-sm focus:outline-none focus-visible:ring-2 cursor-pointer"
                    >
                      <IconAdjustmentsHorizontal className="size-4" />
                    </button>
                  </Tooltip>
                }
              />

              {process.env.NEXT_PUBLIC_TRADINGVIEW_ENABLED === '1' ? (
                <div className="flex bg-bg-elev-2 p-0.5 rounded-sm border border-border">
                  <Link
                    href={`/chart/${symbol}?tf=${tf}`}
                    className="px-3 py-1.5 text-xs font-medium rounded-sm text-fg-muted hover:text-fg transition-colors"
                  >
                    TradingView
                  </Link>
                  <span className="px-3 py-1.5 text-xs font-semibold rounded-sm bg-bg-elev-1 text-fg shadow-sm">
                    Structure
                  </span>
                </div>
              ) : null}
            </div>
          </div>
        </header>
      </div>

      <div className="flex flex-col gap-4 px-4 py-4">
        {isLoading ? (
          <ChartSkeleton />
        ) : error ? (
          <ChartError error={error} onRetry={() => void refetch()} />
        ) : !candlesWithLive || candlesWithLive.length === 0 ? (
          <ChartEmpty symbol={symbol} tf={tf} onRetry={() => void refetch()} />
        ) : (
          <ChartErrorBoundary key={chartKey} onRetry={() => setChartKey(k => k + 1)}>
            <Chart
              symbol={symbol}
              tf={tf}
              candles={candlesWithLive}
              indicatorResults={indicatorResults}
              settings={settings}
              overlays={overlaySet}
            />
          </ChartErrorBoundary>
        )}

        {overlaysOn ? (
          <p className="text-fg-subtle text-xs tabular-nums">{summary(structure)}</p>
        ) : null}

        <p className="text-fg-subtle text-xs">
          Polling at 3s for price · {tf} candles per server cache TTL · Source: BiQuote
        </p>
      </div>
    </div>
  );
}

function summary(s: ReturnType<typeof useStructure>['data']): string {
  if (!s) return '';
  const parts: string[] = [];
  if (s.swings) parts.push(`${s.swings.length} swings`);
  if (s.events) parts.push(`${s.events.length} structure`);
  if (s.fvg) {
    const open = s.fvg.filter((z) => !z.mitigated).length;
    parts.push(`${open} FVG`);
  }
  if (s.orderBlocks) {
    const open = s.orderBlocks.filter((o) => !o.mitigated).length;
    parts.push(`${open} OB`);
  }
  if (s.liquidity) parts.push(`${s.liquidity.length} sweeps`);
  return parts.join(' · ');
}
