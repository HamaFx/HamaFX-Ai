/* eslint-disable @typescript-eslint/no-explicit-any */
'use client';

// Client orchestration for the upgraded chart page.
// Combines dynamic price feeds, structure events, active indicators, and customized styling.

import type { Symbol } from '@hamafx/shared';
import { Maximize2, SlidersHorizontal } from 'lucide-react';
import { Link } from 'next-view-transitions';
import { useEffect, useMemo, useRef, useState } from 'react';

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
import { StaleIndicator } from '@/components/ui/stale-indicator';
import { Tooltip } from '@/components/ui/tooltip';
import { useCandles } from '@/hooks/use-candles';
import { useIndicators } from '@/hooks/use-indicators';
import { useStructure } from '@/hooks/use-structure';
import { useTimeframe } from '@/hooks/use-tf';

import { ChartEmpty } from './chart-empty';
import { ChartError } from './chart-error';
import { ChartSkeleton } from './chart-skeleton';
import { OverlaySheet } from './overlay-sheet';

const PALETTE: OverlayPalette = {
  bull: '#48d597',
  bear: '#f0594a',
  warn: '#f5b041',
  muted: '#7d8693',
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

export function ChartView({ symbol }: { symbol: Symbol }) {
  const [tf, setTf] = useTimeframe();
  const [activeOverlays, toggleOverlay] = useOverlayToggles();

  const containerRef = useRef<HTMLDivElement | null>(null);
  const [visible, setVisible] = useState(true);

  // Indicators and customizer settings state
  const [indicators, setIndicators] = useState<ChartIndicators>(DEFAULT_INDICATORS);
  const [settings, setSettings] = useState<ChartSettings>(DEFAULT_SETTINGS);
  const [hydrated, setHydrated] = useState(false);

  // Load preferences from localStorage on mount
  useEffect(() => {
    try {
      const stored = localStorage.getItem('hfx_chart_config');
      if (stored) {
        const parsed = JSON.parse(stored);
        if (parsed.indicators) setIndicators(parsed.indicators);
        if (parsed.settings) setSettings(parsed.settings);
      }
    } catch (e) {
      console.error('Failed to load chart preferences', e);
    }
    setHydrated(true);
  }, []);

  // Save preferences when they change
  const handleIndicatorsChange = (nextIndicators: ChartIndicators) => {
    setIndicators(nextIndicators);
    try {
      localStorage.setItem(
        'hfx_chart_config',
        JSON.stringify({ indicators: nextIndicators, settings })
      );
    } catch (e) {
      console.error(e);
    }
  };

  const handleSettingsChange = (nextSettings: ChartSettings) => {
    setSettings(nextSettings);
    try {
      localStorage.setItem(
        'hfx_chart_config',
        JSON.stringify({ indicators, settings: nextSettings })
      );
    } catch (e) {
      console.error(e);
    }
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

  const {
    data: candles,
    isLoading,
    isFetching,
    error,
    refetch,
  } = useCandles(symbol, tf, 300, { enabled: visible });

  // Fetch active indicators
  const { data: indicatorResults } = useIndicators(symbol, tf, activeIndicatorsRequest, 300);

  // Only fetch structure when at least one overlay is on.
  const overlaysOn = activeOverlays.length > 0;
  const { data: structure } = useStructure(symbol, tf, {
    enabled: overlaysOn,
    ...(overlaysOn ? { kinds: activeOverlays } : {}),
  });

  // Reference price = previous closed bar's close.
  const referenceClose = useMemo(() => {
    if (!candles || candles.length < 2) return null;
    return candles.at(-2)?.c ?? null;
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

  const overlaySet = useMemo(() => {
    if (!structure || !candles) return null;
    const times = candles.map((c) => c.t);
    return buildOverlays(structure, times, PALETTE, toggleRecord);
  }, [structure, candles, toggleRecord]);

  return (
    <div ref={containerRef} className="-mx-4 flex flex-col animate-in fade-in duration-300">
      {/* Sticky floating sub-header (Dynamic Island style) */}
      <div
        className="sticky z-20 px-4 pt-3 pb-2 transition-all"
        style={{ top: 'calc(var(--topbar-h) + env(safe-area-inset-top))' }}
      >
        <header className="card-premium flex flex-col gap-3 p-3">
          <div className="flex flex-wrap items-center justify-between gap-3 px-1">
            <SymbolPicker active={symbol} />
            <PriceTag symbol={symbol} referencePrice={referenceClose} />
          </div>
          <div className="flex flex-wrap items-center justify-between gap-2 px-1">
            <div className="scrollbar-hide -mx-1 flex-1 overflow-x-auto px-1">
              <TimeframePicker value={tf} onChange={setTf} />
            </div>
            <div className="flex shrink-0 items-center gap-2">
              <StaleIndicator isFetching={isFetching && !isLoading} />
              
              {/* Overlays Sheet */}
              <OverlaySheet active={activeOverlays} onToggle={toggleOverlay} />
              
              {/* Premium preferences & indicators Customizer */}
              {hydrated && (
                <ChartSettingsDrawer
                  settings={settings}
                  onSettingsChange={handleSettingsChange}
                  indicators={indicators}
                  onIndicatorsChange={handleIndicatorsChange}
                  trigger={
                    <Tooltip label="Preferences">
                      <button
                        aria-label="Preferences"
                        className="glass-subtle text-fg-muted hover:text-fg focus-visible:ring-brand inline-flex size-11 items-center justify-center rounded-full focus:outline-none focus-visible:ring-2 cursor-pointer"
                      >
                        <SlidersHorizontal className="size-4" />
                      </button>
                    </Tooltip>
                  }
                />
              )}

              {process.env.NEXT_PUBLIC_TRADINGVIEW_ENABLED === '1' ? (
                <Tooltip label="Pro chart">
                  <Link
                    href={`/chart/${symbol}/pro?tf=${tf}`}
                    aria-label="Pro chart"
                    className="glass-subtle text-fg-muted hover:text-fg focus-visible:ring-brand inline-flex size-11 items-center justify-center rounded-full focus:outline-none focus-visible:ring-2"
                  >
                    <Maximize2 className="size-4" />
                  </Link>
                </Tooltip>
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
        ) : !candles || candles.length === 0 ? (
          <ChartEmpty symbol={symbol} tf={tf} onRetry={() => void refetch()} />
        ) : (
          <Chart
            symbol={symbol}
            tf={tf}
            candles={candles}
            indicatorResults={indicatorResults}
            settings={settings}
            overlays={overlaySet}
          />
        )}

        {overlaysOn ? (
          <p className="text-fg-subtle text-xs tabular-nums">{summary(structure)}</p>
        ) : null}

        <p className="text-fg-subtle text-xs">
          Polling at 1.5s for price · {tf} candles per server cache TTL · Source: BiQuote
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
