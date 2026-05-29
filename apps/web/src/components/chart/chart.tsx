'use client';

// Premium Lightweight-charts wrapper with multi-pane indicator and theme customizer support.
// Exposes timescale range synchronization, axis dragging, dynamic color themes, and zoom controls.

import { priceDecimals, type Candle, type Symbol, type Timeframe, type IndicatorResult } from '@hamafx/shared';
import type * as LightweightCharts from 'lightweight-charts';
import { useEffect, useMemo, useRef } from 'react';
import { ZoomIn, ZoomOut, Maximize2 } from 'lucide-react';

import { cn } from '@/lib/cn';

import type { OverlaySet } from './overlays';

type LcModule = typeof LightweightCharts;
type UTCTimestamp = LightweightCharts.UTCTimestamp;

export interface ChartSettings {
  theme: 'slate' | 'navy' | 'black' | 'classic';
  gridStyle: 'solid' | 'dotted' | 'none';
  bullColor?: string;
  bearColor?: string;
}

export function getThemeColors(theme: 'slate' | 'navy' | 'black' | 'classic') {
  switch (theme) {
    case 'slate':
      return {
        bg: '#0f172a',      // Slate Dark Canvas
        grid: '#1e293b',    // Slate Border
        text: '#94a3b8',    // Muted slate text
      };
    case 'navy':
      return {
        bg: '#020617',      // Deep Space Navy
        grid: '#0f172a',    // Navy Border
        text: '#64748b',    // Muted navy text
      };
    case 'classic':
      return {
        bg: '#0e1118',      // Classic dark background
        grid: '#262a35',    // Classic grid line
        text: '#a1a8b3',    // Classic text
      };
    case 'black':
    default:
      return {
        bg: '#0c0c0c',      // True neutral dark background
        grid: '#1f1f1f',    // Subtle refined border grid
        text: '#a1a8b3',    // Sleek muted text gray
      };
  }
}

interface ChartProps {
  symbol: Symbol;
  tf: Timeframe;
  /** Candle data passed from the parent. */
  candles: Candle[];
  /** Optional indicator results computed on the server. */
  indicatorResults?: IndicatorResult[] | null | undefined;
  /** Tailwind height class; defaults to a mobile-first 60svh. */
  heightClass?: string;
  className?: string;
  /** Optional SMC overlays. */
  overlays?: OverlaySet | null | undefined;
  /** Optional chart customizer settings. */
  settings?: ChartSettings | null | undefined;
}

export function Chart({
  symbol,
  tf,
  candles,
  indicatorResults,
  heightClass = 'h-[60svh]',
  className,
  overlays,
  settings,
}: ChartProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const chartRef = useRef<ChartHandle | null>(null);

  // Sub-pane instances and DOM refs
  const rsiChartRef = useRef<any>(null);
  const macdChartRef = useRef<any>(null);
  const rsiContainerRef = useRef<HTMLDivElement | null>(null);
  const macdContainerRef = useRef<HTMLDivElement | null>(null);

  const decimals = useMemo(() => priceDecimals(symbol), [symbol]);

  const candlesRef = useRef(candles);
  candlesRef.current = candles;

  const overlaysRef = useRef(overlays);
  overlaysRef.current = overlays;

  const indicatorResultsRef = useRef(indicatorResults);
  indicatorResultsRef.current = indicatorResults;

  // Create the main chart exactly once per mount.
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    let cancelled = false;
    let handle: ChartHandle | null = null;

    void import('lightweight-charts').then((lc) => {
      if (cancelled || !containerRef.current) return;
      handle = createChart(lc, el, decimals, settings ?? null);
      chartRef.current = handle;

      // Immediately resize to the current container dimensions to prevent 0x0 canvas sizing bugs
      handle.resize(el.clientWidth, el.clientHeight);

      // Immediately populate candles, overlays and indicators if already loaded
      if (candlesRef.current && candlesRef.current.length > 0) {
        handle.setCandles(candlesRef.current);
      }
      if (overlaysRef.current) {
        handle.setOverlays(overlaysRef.current);
      }
      if (indicatorResultsRef.current) {
        handle.setIndicators(indicatorResultsRef.current);
      }
    });

    return () => {
      cancelled = true;
      handle?.dispose();
      chartRef.current = null;
    };
    // We intentionally don't depend on decimals or settings here to avoid unmounting/remounting
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

  // Push dynamic on-chart indicators whenever they update.
  useEffect(() => {
    chartRef.current?.setIndicators(indicatorResults ?? null);
  }, [indicatorResults, candles]);

  // Apply theme settings dynamically to main chart
  useEffect(() => {
    const handle = chartRef.current;
    if (!handle) return;
    const chart = handle.getChartInstance();
    if (!chart) return;
    
    const colors = getThemeColors(settings?.theme ?? 'black');
    const isNone = settings?.gridStyle === 'none';
    const gridColor = isNone ? 'transparent' : colors.grid;
    const gridStyle = settings?.gridStyle === 'dotted' ? 1 : 0;

    chart.applyOptions({
      layout: {
        background: { color: colors.bg },
        textColor: colors.text,
      },
      grid: {
        vertLines: { color: gridColor, style: gridStyle },
        horzLines: { color: gridColor, style: gridStyle },
      },
      rightPriceScale: { borderColor: colors.grid },
      timeScale: { borderColor: colors.grid },
    });
  }, [settings, candles]);

  // Extract off-chart oscillators
  const rsiResult = useMemo(() => indicatorResults?.find((r) => r.kind === 'rsi'), [indicatorResults]);
  const macdResult = useMemo(() => indicatorResults?.find((r) => r.kind === 'macd'), [indicatorResults]);

  // RSI Sub-pane Lifecycle
  useEffect(() => {
    const el = rsiContainerRef.current;
    if (!el || !rsiResult) {
      if (rsiChartRef.current) {
        rsiChartRef.current.remove();
        rsiChartRef.current = null;
      }
      return;
    }

    const colors = getThemeColors(settings?.theme ?? 'black');
    const isNone = settings?.gridStyle === 'none';
    const gridColor = isNone ? 'transparent' : colors.grid;
    const gridStyle = settings?.gridStyle === 'dotted' ? 1 : 0;
    
    if (!rsiChartRef.current) {
      void import('lightweight-charts').then((lc) => {
        if (!rsiContainerRef.current) return;
        
        const createChartFn = ('createChart' in lc) ? lc.createChart : ((lc as any).default?.createChart as any);
        const rsiChart = createChartFn(rsiContainerRef.current, {
          layout: {
            background: { color: colors.bg },
            textColor: colors.text,
            fontFamily: getComputedStyle(el).getPropertyValue('--font-sans') || 'Inter, system-ui, sans-serif',
          },
          grid: {
            vertLines: { color: gridColor, style: gridStyle },
            horzLines: { color: gridColor, style: gridStyle },
          },
          rightPriceScale: { borderColor: colors.grid, visible: true },
          timeScale: { borderColor: colors.grid, visible: false },
          crosshair: { mode: 1 },
          autoSize: true,
          handleScroll: { mouseWheel: false, pressedMouseMove: false, horzTouchDrag: false, vertTouchDrag: false },
          handleScale: { mouseWheel: false, pinch: false, axisPressedMouseMove: { time: false, price: false } },
        });

        rsiChartRef.current = rsiChart;

        const rsiSeries = rsiChart.addSeries(lc.LineSeries, {
          color: '#a855f7', // Purple theme
          lineWidth: 1.5,
          priceFormat: { type: 'price', precision: 1, minMove: 0.1 },
          priceLineVisible: false,
        });

        rsiSeries.createPriceLine({
          price: 70,
          color: '#7e22ce',
          lineWidth: 1,
          lineStyle: 1, // Dashed
          title: 'OB 70',
        });

        rsiSeries.createPriceLine({
          price: 30,
          color: '#7e22ce',
          lineWidth: 1,
          lineStyle: 1, // Dashed
          title: 'OS 30',
        });

        const data = rsiResult.values.map((v, idx) => {
          if (v === null || v === undefined) return null;
          const candle = candles[idx];
          if (!candle) return null;
          return {
            time: Math.floor(candle.t / 1000) as unknown as UTCTimestamp,
            value: typeof v === 'number' ? v : (v as any).value ?? null,
          };
        }).filter((d): d is { time: UTCTimestamp; value: number } => d !== null && d.value !== null);
        rsiSeries.setData(data);

        // Sync timescale
        const mainChart = chartRef.current?.getChartInstance();
        if (mainChart) {
          const range = mainChart.timeScale().getVisibleLogicalRange();
          if (range) rsiChart.timeScale().setVisibleLogicalRange(range);

          mainChart.timeScale().subscribeVisibleLogicalRangeChange((range: any) => {
            if (!range) return;
            rsiChart.timeScale().setVisibleLogicalRange(range);
          });
        }
      });
    } else {
      // Update existing RSI Chart colors and data
      const rsiChart = rsiChartRef.current;
      rsiChart.applyOptions({
        layout: { background: { color: colors.bg }, textColor: colors.text },
        grid: { vertLines: { color: gridColor, style: gridStyle }, horzLines: { color: gridColor, style: gridStyle } },
        rightPriceScale: { borderColor: colors.grid },
      });
    }

    return () => {
      if (rsiChartRef.current) {
        rsiChartRef.current.remove();
        rsiChartRef.current = null;
      }
    };
  }, [rsiResult, candles, settings?.theme, settings?.gridStyle]);

  // MACD Sub-pane Lifecycle
  useEffect(() => {
    const el = macdContainerRef.current;
    if (!el || !macdResult) {
      if (macdChartRef.current) {
        macdChartRef.current.remove();
        macdChartRef.current = null;
      }
      return;
    }

    const colors = getThemeColors(settings?.theme ?? 'black');
    const isNone = settings?.gridStyle === 'none';
    const gridColor = isNone ? 'transparent' : colors.grid;
    const gridStyle = settings?.gridStyle === 'dotted' ? 1 : 0;
    
    if (!macdChartRef.current) {
      void import('lightweight-charts').then((lc) => {
        if (!macdContainerRef.current) return;
        
        const createChartFn = ('createChart' in lc) ? lc.createChart : ((lc as any).default?.createChart as any);
        const macdChart = createChartFn(macdContainerRef.current, {
          layout: {
            background: { color: colors.bg },
            textColor: colors.text,
            fontFamily: getComputedStyle(el).getPropertyValue('--font-sans') || 'Inter, system-ui, sans-serif',
          },
          grid: {
            vertLines: { color: gridColor, style: gridStyle },
            horzLines: { color: gridColor, style: gridStyle },
          },
          rightPriceScale: { borderColor: colors.grid, visible: true },
          timeScale: { borderColor: colors.grid, visible: false },
          crosshair: { mode: 1 },
          autoSize: true,
          handleScroll: { mouseWheel: false, pressedMouseMove: false, horzTouchDrag: false, vertTouchDrag: false },
          handleScale: { mouseWheel: false, pinch: false, axisPressedMouseMove: { time: false, price: false } },
        });

        macdChartRef.current = macdChart;

        const macdSeries = macdChart.addSeries(lc.LineSeries, {
          color: '#2563eb', // Blue MACD line
          lineWidth: 1.5,
          priceLineVisible: false,
        });

        const signalSeries = macdChart.addSeries(lc.LineSeries, {
          color: '#f97316', // Orange Signal line
          lineWidth: 1.5,
          priceLineVisible: false,
        });

        const histSeries = macdChart.addSeries(lc.HistogramSeries, {
          color: '#48d597',
          priceFormat: { type: 'volume' },
          priceLineVisible: false,
        });

        const macdData: any[] = [];
        const signalData: any[] = [];
        const histData: any[] = [];

        macdResult.values.forEach((v, idx) => {
          if (!v || typeof v !== 'object') return;
          const candle = candles[idx];
          if (!candle) return;
          const t = Math.floor(candle.t / 1000) as unknown as UTCTimestamp;
          if (v.macd !== null && v.macd !== undefined) macdData.push({ time: t, value: v.macd });
          if (v.signal !== null && v.signal !== undefined) signalData.push({ time: t, value: v.signal });
          
          if (v.histogram !== null && v.histogram !== undefined) {
            const isUp = v.histogram >= 0;
            histData.push({
              time: t,
              value: v.histogram,
              color: isUp ? '#48d597' : '#f0594a', // Up green, down red
            });
          }
        });

        macdSeries.setData(macdData);
        signalSeries.setData(signalData);
        histSeries.setData(histData);

        // Sync timescale
        const mainChart = chartRef.current?.getChartInstance();
        if (mainChart) {
          const range = mainChart.timeScale().getVisibleLogicalRange();
          if (range) macdChart.timeScale().setVisibleLogicalRange(range);

          mainChart.timeScale().subscribeVisibleLogicalRangeChange((range: any) => {
            if (!range) return;
            macdChart.timeScale().setVisibleLogicalRange(range);
          });
        }
      });
    } else {
      const macdChart = macdChartRef.current;
      macdChart.applyOptions({
        layout: { background: { color: colors.bg }, textColor: colors.text },
        grid: { vertLines: { color: gridColor, style: gridStyle }, horzLines: { color: gridColor, style: gridStyle } },
        rightPriceScale: { borderColor: colors.grid },
      });
    }

    return () => {
      if (macdChartRef.current) {
        macdChartRef.current.remove();
        macdChartRef.current = null;
      }
    };
  }, [macdResult, candles, settings?.theme, settings?.gridStyle]);

  // Resize on container changes — important on mobile rotation.
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => {
      const w = el.clientWidth;
      const h = el.clientHeight;
      chartRef.current?.resize(w, h);
      
      if (rsiChartRef.current && rsiContainerRef.current) {
        rsiChartRef.current.resize(rsiContainerRef.current.clientWidth, rsiContainerRef.current.clientHeight, true);
      }
      if (macdChartRef.current && macdContainerRef.current) {
        macdChartRef.current.resize(macdContainerRef.current.clientWidth, macdContainerRef.current.clientHeight, true);
      }
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  return (
    <div className={cn('flex flex-col gap-2', className)}>
      {/* Primary Candlestick Pane */}
      <div className="border-border bg-bg-elev-1 relative overflow-hidden rounded-lg border">
        <div
          ref={containerRef}
          role="img"
          className={cn('w-full', heightClass)}
          aria-label={`${symbol} ${tf} chart`}
        />

        {/* Premium floating zoom and pan controls overlay */}
        <div className="absolute right-4 bottom-4 z-10 flex items-center gap-1 rounded-full border border-glass-edge bg-glass p-1 shadow-lg backdrop-blur-md">
          <button
            onClick={() => chartRef.current?.zoomIn()}
            className="flex size-8 items-center justify-center rounded-full text-fg-muted hover:bg-bg-elev-3 hover:text-fg transition-all cursor-pointer"
            title="Zoom In"
          >
            <ZoomIn className="size-4" />
          </button>
          <button
            onClick={() => chartRef.current?.zoomOut()}
            className="flex size-8 items-center justify-center rounded-full text-fg-muted hover:bg-bg-elev-3 hover:text-fg transition-all cursor-pointer"
            title="Zoom Out"
          >
            <ZoomOut className="size-4" />
          </button>
          <button
            onClick={() => chartRef.current?.resetView()}
            className="flex size-8 items-center justify-center rounded-full text-fg-muted hover:bg-bg-elev-3 hover:text-fg transition-all cursor-pointer"
            title="Reset View"
          >
            <Maximize2 className="size-4" />
          </button>
        </div>
      </div>

      {/* RSI oscillator sub-pane */}
      {rsiResult && (
        <div className="border-border bg-bg-elev-1 relative h-[120px] overflow-hidden rounded-lg border animate-in fade-in duration-200">
          <div ref={rsiContainerRef} className="h-full w-full" />
          <div className="absolute top-2 left-3 z-10 text-[9px] font-bold tracking-wider text-fg-subtle uppercase pointer-events-none">
            RSI (14)
          </div>
        </div>
      )}

      {/* MACD oscillator sub-pane */}
      {macdResult && (
        <div className="border-border bg-bg-elev-1 relative h-[140px] overflow-hidden rounded-lg border animate-in fade-in duration-200">
          <div ref={macdContainerRef} className="h-full w-full" />
          <div className="absolute top-2 left-3 z-10 text-[9px] font-bold tracking-wider text-fg-subtle uppercase pointer-events-none">
            MACD (12, 26, 9)
          </div>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Imperative handle. Keeps the React-shaped surface tiny.
// ---------------------------------------------------------------------------

interface ChartHandle {
  setCandles(candles: Candle[]): void;
  setOverlays(overlays: OverlaySet | null): void;
  setIndicators(results: IndicatorResult[] | null): void;
  resize(width: number, height: number): void;
  applyDecimals(decimals: number): void;
  zoomIn(): void;
  zoomOut(): void;
  resetView(): void;
  getChartInstance(): any;
  dispose(): void;
}

function getIndicatorColor(kind: string, period: number): string {
  if (kind === 'ema') {
    if (period === 20) return '#3b82f6';      // Bright Blue
    if (period === 50) return '#a855f7';      // Vibrant Purple
    if (period === 200) return '#eab308';     // Amber Gold
    return '#60a5fa';
  } else {
    // SMA
    if (period === 50) return '#10b981';      // Emerald Green
    if (period === 100) return '#ec4899';     // Pink
    return '#f43f5e';
  }
}

// Read theme colors dynamically, with Intercepting support for OKLCH strings.
function readThemeColors(el: HTMLElement) {
  const cs = getComputedStyle(el);
  const get = (v: string, fallback: string) => {
    const val = cs.getPropertyValue(v).trim();
    if (!val) return fallback;
    if (val.startsWith('oklch')) {
      switch (v) {
        case '--color-bg-elev-1':
          return '#0c0c0c';
        case '--color-border':
          return '#1f1f1f';
        case '--color-fg-muted':
          return '#a1a8b3';
        case '--color-bull':
          return '#48d597';
        case '--color-bear':
          return '#f0594a';
        default:
          return fallback;
      }
    }
    return val;
  };
  
  return {
    bg: get('--color-bg-elev-1', '#0e1118'),
    grid: get('--color-border', '#262a35'),
    text: get('--color-fg-muted', '#a1a8b3'),
    bull: get('--color-bull', '#48d597'),
    bear: get('--color-bear', '#f0594a'),
  };
}

function createChart(lc: LcModule, container: HTMLElement, decimals: number, settings: ChartSettings | null): ChartHandle {
  const initialTheme = settings?.theme ?? 'black';
  const initialGrid = settings?.gridStyle ?? 'solid';
  const colors = getThemeColors(initialTheme);
  const themeColors = readThemeColors(container);
  
  const isNone = initialGrid === 'none';
  const gridColor = isNone ? 'transparent' : colors.grid;
  const gridStyle = initialGrid === 'dotted' ? 1 : 0;

  // Handle ES module interop safely for Next.js dynamic imports
  const createChartFn = ('createChart' in lc) 
    ? lc.createChart 
    : ((lc as any).default?.createChart as any);

  if (!createChartFn) throw new Error("Could not find createChart function in imported module");

  const chart = createChartFn(container, {
    layout: {
      background: { color: colors.bg },
      textColor: colors.text,
      fontFamily:
        getComputedStyle(container).getPropertyValue('--font-sans') ||
        'Inter, system-ui, sans-serif',
    },
    grid: {
      vertLines: { color: gridColor, style: gridStyle },
      horzLines: { color: gridColor, style: gridStyle },
    },
    rightPriceScale: { borderColor: colors.grid },
    timeScale: { borderColor: colors.grid, timeVisible: true, secondsVisible: false },
    crosshair: { mode: 1 /* Magnet */ },
    autoSize: true,
    handleScroll: {
      mouseWheel: true,
      pressedMouseMove: true,
      horzTouchDrag: true,
      vertTouchDrag: true,
    },
    handleScale: {
      mouseWheel: true,
      pinch: true,
      axisPressedMouseMove: { time: true, price: true },
    },
  });

  const candleSeries = chart.addSeries(lc.CandlestickSeries, {
    upColor: themeColors.bull,
    downColor: themeColors.bear,
    borderUpColor: themeColors.bull,
    borderDownColor: themeColors.bear,
    wickUpColor: themeColors.bull,
    wickDownColor: themeColors.bear,
    priceFormat: { type: 'price', precision: decimals, minMove: 1 / 10 ** decimals },
  });

  let priceLineHandles: ReturnType<typeof candleSeries.createPriceLine>[] = [];
  let indicatorLineHandles: ReturnType<typeof chart.addSeries>[] = [];
  let currentCandles: Candle[] = [];

  return {
    setCandles(candles) {
      currentCandles = candles;
      candleSeries.setData(
        candles.map((c) => ({
          time: Math.floor(c.t / 1000) as unknown as UTCTimestamp,
          open: c.o,
          high: c.h,
          low: c.l,
          close: c.c,
        })),
      );
    },
    setOverlays(overlays) {
      const seriesAny = candleSeries as any;
      if (typeof seriesAny.setMarkers === 'function') {
        seriesAny.setMarkers(
          (overlays?.markers ?? []).map((m) => ({ ...m, size: Number(m.size) })),
        );
      }

      for (const h of priceLineHandles) {
        try {
          candleSeries.removePriceLine(h);
        } catch {}
      }
      priceLineHandles = [];
      for (const pl of overlays?.priceLines ?? []) {
        priceLineHandles.push(
          candleSeries.createPriceLine({
            ...pl,
            lineWidth: Number(pl.lineWidth) as 1 | 2 | 3 | 4,
            lineStyle: Number(pl.lineStyle) as 0 | 1 | 2 | 3 | 4,
          }),
        );
      }
    },
    setIndicators(results) {
      // Remove old overlays
      for (const s of indicatorLineHandles) {
        try {
          chart.removeSeries(s);
        } catch {}
      }
      indicatorLineHandles = [];

      if (!results) return;

      // Loop and draw dynamic overlays
      for (const res of results) {
        if (res.kind === 'ema' || res.kind === 'sma') {
          const period = res.params.period ?? 20;
          const color = getIndicatorColor(res.kind, period as number);
          
          const series = chart.addSeries(lc.LineSeries, {
            color,
            lineWidth: 2,
            title: `${res.kind.toUpperCase()} ${period}`,
            priceLineVisible: false,
          });
          indicatorLineHandles.push(series);

          series.setData(
            res.values.map((v, idx) => {
              if (v === null || v === undefined) return null;
              const value = typeof v === 'number' ? v : (v as any).value ?? null;
              if (value === null) return null;
              const candle = currentCandles[idx];
              if (!candle) return null;
              return {
                time: Math.floor(candle.t / 1000) as unknown as UTCTimestamp,
                value,
              };
            }).filter((d): d is { time: UTCTimestamp; value: number } => d !== null)
          );
        } else if (res.kind === 'bollinger') {
          const color = '#f5b041';
          
          const basisSeries = chart.addSeries(lc.LineSeries, {
            color,
            lineWidth: 1.5,
            title: 'BB Basis',
            priceLineVisible: false,
          });
          const upperSeries = chart.addSeries(lc.LineSeries, {
            color: '#7d8693',
            lineWidth: 1,
            lineStyle: 1,
            title: 'BB Upper',
            priceLineVisible: false,
          });
          const lowerSeries = chart.addSeries(lc.LineSeries, {
            color: '#7d8693',
            lineWidth: 1,
            lineStyle: 1,
            title: 'BB Lower',
            priceLineVisible: false,
          });
          indicatorLineHandles.push(basisSeries, upperSeries, lowerSeries);

          const basisData: any[] = [];
          const upperData: any[] = [];
          const lowerData: any[] = [];

          res.values.forEach((v, idx) => {
            if (!v || typeof v !== 'object') return;
            const candle = currentCandles[idx];
            if (!candle) return;
            const t = Math.floor(candle.t / 1000) as unknown as UTCTimestamp;
            if (v.basis !== null && v.basis !== undefined) basisData.push({ time: t, value: v.basis });
            if (v.upper !== null && v.upper !== undefined) upperData.push({ time: t, value: v.upper });
            if (v.lower !== null && v.lower !== undefined) lowerData.push({ time: t, value: v.lower });
          });

          basisSeries.setData(basisData);
          upperSeries.setData(upperData);
          lowerSeries.setData(lowerData);
        }
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
    zoomIn() {
      const ts = chart.timeScale();
      const range = ts.getVisibleLogicalRange();
      if (range) {
        const w = range.to - range.from;
        ts.setVisibleLogicalRange({
          from: range.from + w * 0.15,
          to: range.to - w * 0.15,
        });
      }
    },
    zoomOut() {
      const ts = chart.timeScale();
      const range = ts.getVisibleLogicalRange();
      if (range) {
        const w = range.to - range.from;
        ts.setVisibleLogicalRange({
          from: range.from - w * 0.15,
          to: range.to + w * 0.15,
        });
      }
    },
    resetView() {
      chart.timeScale().fitContent();
      chart.priceScale('right').resetMode();
    },
    getChartInstance() {
      return chart;
    },
    dispose() {
      chart.remove();
    },
  };
}
