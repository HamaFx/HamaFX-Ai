'use client';

// Lightweight-charts wrapper.
//
// Why a thin imperative wrapper instead of a React component lib?
//   - lightweight-charts is vanilla DOM; React wrappers (klinecharts,
//     react-financial-charts) add a layer of indirection we don't need.
//   - We control the lifecycle precisely: create on mount, destroy on
//     unmount, and only call `setData`/`update` when inputs actually change.
//   - Theme tokens come from CSS custom properties so the chart
//     auto-syncs with dark/light mode without a re-render dance.
//
// Phase 2 added optional SMC overlays (markers + price lines). They're
// driven by a separate `overlays` prop so the parent owns the toggle UI;
// the chart just renders what it's told.

import type * as LightweightCharts from 'lightweight-charts';
import { useEffect, useMemo, useRef } from 'react';

import type { Candle, Symbol, Timeframe } from '@hamafx/shared';
import { priceDecimals } from '@hamafx/shared';

import type { OverlaySet } from './overlays';
import { useCandles } from '@/hooks/use-candles';
import { cn } from '@/lib/cn';

type LcModule = typeof LightweightCharts;
type UTCTimestamp = LightweightCharts.UTCTimestamp;

interface ChartProps {
  symbol: Symbol;
  tf: Timeframe;
  /** How many bars to fetch. Default 300 covers most indicator windows. */
  count?: number;
  /** Tailwind height class; defaults to a mobile-first 60svh. */
  heightClass?: string;
  className?: string;
  /**
   * Optional SMC overlays. Pass `null`/`undefined` to render no markers
   * or price lines. Updates re-render the overlays without re-creating
   * the chart.
   */
  overlays?: OverlaySet | null | undefined;
}

export function Chart({
  symbol,
  tf,
  count = 300,
  heightClass = 'h-[60svh]',
  className,
  overlays,
}: ChartProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  // We hold the chart + series in a ref instead of state — they're imperative
  // handles, never rendered, and React 19's effect timing means storing them
  // in state would cause a churn of re-renders on every call to setData.
  const chartRef = useRef<ChartHandle | null>(null);

  const { data: candles, isLoading, isError, error } = useCandles(symbol, tf, count);

  const decimals = useMemo(() => priceDecimals(symbol), [symbol]);

  // Create the chart exactly once per mount.
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    let cancelled = false;
    let handle: ChartHandle | null = null;

    void import('lightweight-charts').then((lc) => {
      if (cancelled || !containerRef.current) return;
      handle = createChart(lc, el, decimals);
      chartRef.current = handle;
    });

    return () => {
      cancelled = true;
      handle?.dispose();
      chartRef.current = null;
    };
    // We intentionally don't depend on `decimals` here — see the second effect.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Keep formatter in sync when the symbol changes (different decimal count).
  useEffect(() => {
    chartRef.current?.applyDecimals(decimals);
  }, [decimals]);

  // Push fresh candle data whenever the query refetches.
  useEffect(() => {
    if (!candles || candles.length === 0) return;
    chartRef.current?.setCandles(candles);
  }, [candles]);

  // Push overlays whenever they change. Empty/null overlays clear them.
  useEffect(() => {
    chartRef.current?.setOverlays(overlays ?? null);
  }, [overlays]);

  // Resize on container changes — important on mobile rotation.
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => {
      const w = el.clientWidth;
      const h = el.clientHeight;
      chartRef.current?.resize(w, h);
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  return (
    <div
      className={cn(
        'border-border bg-bg-elev-1 relative overflow-hidden rounded-lg border',
        className,
      )}
    >
      <div
        ref={containerRef}
        className={cn('w-full', heightClass)}
        aria-label={`${symbol} ${tf} chart`}
      />
      {isLoading ? (
        <div className="text-fg-muted absolute inset-0 grid place-items-center text-sm">
          Loading…
        </div>
      ) : null}
      {isError ? (
        <div className="absolute inset-0 grid place-items-center p-4 text-center">
          <p className="text-bear text-sm">
            Couldn&apos;t load chart: {(error as Error)?.message ?? 'unknown error'}
          </p>
        </div>
      ) : null}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Imperative handle. Keeps the React-shaped surface tiny.
// ---------------------------------------------------------------------------

interface ChartHandle {
  setCandles(candles: Candle[]): void;
  setOverlays(overlays: OverlaySet | null): void;
  resize(width: number, height: number): void;
  applyDecimals(decimals: number): void;
  dispose(): void;
}

// Read theme colours from CSS custom properties so dark/light works without
// hard-coding hex values. Falls back to dark-theme defaults on SSR.
function readThemeColors(el: HTMLElement) {
  const cs = getComputedStyle(el);
  const get = (v: string, fallback: string) => cs.getPropertyValue(v).trim() || fallback;
  return {
    bg: get('--color-bg-elev-1', '#0e1118'),
    grid: get('--color-border', '#262a35'),
    text: get('--color-fg-muted', '#a1a8b3'),
    bull: get('--color-bull', '#48d597'),
    bear: get('--color-bear', '#f0594a'),
  };
}

function createChart(lc: LcModule, container: HTMLElement, decimals: number): ChartHandle {
  const colors = readThemeColors(container);

  const chart = lc.createChart(container, {
    layout: {
      background: { color: colors.bg },
      textColor: colors.text,
      fontFamily:
        getComputedStyle(container).getPropertyValue('--font-sans') ||
        'Inter, system-ui, sans-serif',
    },
    grid: {
      vertLines: { color: colors.grid, style: 1 },
      horzLines: { color: colors.grid, style: 1 },
    },
    rightPriceScale: { borderColor: colors.grid },
    timeScale: { borderColor: colors.grid, timeVisible: true, secondsVisible: false },
    crosshair: { mode: 1 /* Magnet */ },
    autoSize: true,
    handleScroll: {
      mouseWheel: true,
      pressedMouseMove: true,
      horzTouchDrag: true,
      vertTouchDrag: false,
    },
    handleScale: {
      mouseWheel: true,
      pinch: true,
      axisPressedMouseMove: { time: true, price: false },
    },
  });

  const candleSeries = chart.addSeries(lc.CandlestickSeries, {
    upColor: colors.bull,
    downColor: colors.bear,
    borderUpColor: colors.bull,
    borderDownColor: colors.bear,
    wickUpColor: colors.bull,
    wickDownColor: colors.bear,
    priceFormat: { type: 'price', precision: decimals, minMove: 1 / 10 ** decimals },
  });

  // Track allocated price lines so we can detach them on every overlay
  // refresh — lightweight-charts has no "clear all price lines" call,
  // we have to remove them one by one with the handle returned by
  // `createPriceLine`.
  let priceLineHandles: ReturnType<typeof candleSeries.createPriceLine>[] = [];

  return {
    setCandles(candles) {
      candleSeries.setData(
        candles.map((c) => ({
          // lightweight-charts expects time in seconds for date-based bars.
          // For intraday we pass UTCTimestamp (seconds since epoch).
          time: Math.floor(c.t / 1000) as unknown as UTCTimestamp,
          open: c.o,
          high: c.h,
          low: c.l,
          close: c.c,
        })),
      );
    },
    setOverlays(overlays) {
      // Markers — single setMarkers replaces whatever was there.
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const seriesAny = candleSeries as any;
      if (typeof seriesAny.setMarkers === 'function') {
        seriesAny.setMarkers(overlays?.markers ?? []);
      }

      // Price lines — detach old, attach new.
      for (const h of priceLineHandles) {
        try {
          candleSeries.removePriceLine(h);
        } catch {
          /* already gone */
        }
      }
      priceLineHandles = [];
      for (const pl of overlays?.priceLines ?? []) {
        priceLineHandles.push(candleSeries.createPriceLine(pl));
      }
    },
    resize(width, height) {
      chart.resize(width, height, true);
    },
    applyDecimals(d) {
      candleSeries.applyOptions({
        priceFormat: { type: 'price', precision: d, minMove: 1 / 10 ** d },
      });
    },
    dispose() {
      chart.remove();
    },
  };
}
