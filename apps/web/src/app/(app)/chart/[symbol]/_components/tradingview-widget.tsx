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

import type { Symbol, Timeframe } from '@hamafx/shared';
import { getSymbolDefinition, isKnownSymbol } from '@hamafx/shared';
import { Link } from 'next-view-transitions';
import Script from 'next/script';
import { useEffect, useRef, useState, useId } from 'react';

interface TradingViewGlobal {
  widget: new (config: TradingViewWidgetConfig) => unknown;
}

interface TradingViewWidgetConfig {
  container_id: string;
  symbol: string;
  interval: string;
  theme: 'dark' | 'light';
  timezone: string;
  locale: string;
  style: '1';
  enable_publishing: false;
  hide_top_toolbar: false;
  hide_legend: false;
  withdateranges: true;
  allow_symbol_change: false;
  autosize: true;
}

declare global {
  interface Window {
    TradingView?: TradingViewGlobal;
  }
}

const SYMBOL_TO_TV: Record<string, string> = {
  XAUUSD: 'OANDA:XAUUSD',
  EURUSD: 'OANDA:EURUSD',
  GBPUSD: 'OANDA:GBPUSD',
};

/**
 * Resolve a symbol to its TradingView ticker.
 * Uses SymbolDefinition.tradingView from the catalog for known symbols,
 * falls back to the hardcoded map, then to OANDA:{symbol}.
 */
function resolveTvSymbol(symbol: string): string {
  if (isKnownSymbol(symbol)) {
    return getSymbolDefinition(symbol).tradingView;
  }
  return SYMBOL_TO_TV[symbol] || (symbol.includes(':') ? symbol : `OANDA:${symbol}`);
}

const TF_TO_TV_INTERVAL: Record<Timeframe, string> = {
  '1m': '1',
  '5m': '5',
  '15m': '15',
  '30m': '30',
  '1h': '60',
  '4h': '240',
  '1d': 'D',
  '1w': 'W',
};

const LOAD_TIMEOUT_MS = 8000;

interface TradingViewWidgetProps {
  symbol: Symbol;
  tf: Timeframe;
  theme?: 'dark' | 'light';
}

export function TradingViewWidget({ symbol, tf, theme = 'dark' }: TradingViewWidgetProps) {
  const idSuffix = useId().replace(/:/g, '');
  const containerId = `tv-widget-${symbol}-${tf}-${idSuffix}`;
  const containerRef = useRef<HTMLDivElement | null>(null);
  type WidgetInstance = { remove: () => void };
  const widgetRef = useRef<WidgetInstance | null>(null);
  const [loadFailed, setLoadFailed] = useState(false);
  const [scriptLoaded, setScriptLoaded] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    let cancelled = false;

    const tv = typeof window !== 'undefined' ? window.TradingView : undefined;
    if (tv) {
      initWidget(tv);
      return;
    }

    if (loadFailed) return;

    if (scriptLoaded) {
      const tvNew = typeof window !== 'undefined' ? window.TradingView : undefined;
      if (tvNew) {
        initWidget(tvNew);
      } else {
        setLoadFailed(true);
      }
      return;
    }

    timerRef.current = setTimeout(() => {
      const tvCheck = typeof window !== 'undefined' ? window.TradingView : undefined;
      if (!cancelled && !tvCheck) {
        setLoadFailed(true);
      }
    }, LOAD_TIMEOUT_MS);

    function initWidget(tv: TradingViewGlobal) {
      try {
        const w = new tv.widget({
          container_id: containerId,
          symbol: resolveTvSymbol(symbol),
          interval: TF_TO_TV_INTERVAL[tf] || '60',
          theme: theme,
          timezone: 'Etc/UTC',
          locale: 'en',
          style: '1',
          enable_publishing: false,
          hide_top_toolbar: false,
          hide_legend: false,
          withdateranges: true,
          allow_symbol_change: false,
          autosize: true,
        });
        widgetRef.current = w as WidgetInstance;
      } catch (err) {
        console.warn('[pro-chart] TradingView widget construct failed', err);
        setLoadFailed(true);
      }
    }

    const container = containerRef.current;
    return () => {
      cancelled = true;
      if (timerRef.current) {
        clearTimeout(timerRef.current);
        timerRef.current = null;
      }
      if (widgetRef.current) {
        widgetRef.current.remove();
        widgetRef.current = null;
      }
      if (container) {
        container.innerHTML = '';
      }
    };
  }, [containerId, symbol, tf, scriptLoaded, loadFailed, theme]);

  return (
    <>
      <Script
        src="https://s3.tradingview.com/tv.js"
        strategy="afterInteractive"
        onLoad={() => setScriptLoaded(true)}
        onError={() => setLoadFailed(true)}
      />
      {loadFailed ? (
        <FallbackMessage symbol={symbol} />
      ) : (
        <div
          id={containerId}
          ref={containerRef}
          className="border-border bg-bg-elev-1 rounded-lg border"
          style={{ height: '70svh' }}
          aria-label={`${symbol} ${tf} chart (TradingView)`}
        />
      )}
      <p className="text-fg-subtle pt-2 text-caption">Powered by TradingView</p>
    </>
  );
}

function FallbackMessage({ symbol }: { symbol: Symbol }) {
  return (
    <div
      role="alert"
      className="border-bear/30 bg-bg-elev-1 text-fg-muted flex flex-col gap-2 rounded-lg border p-4 text-sm"
    >
      <p className="text-bear font-semibold">TradingView did not load.</p>
      <p>
        The Advanced Charting Widget could not reach <code>s3.tradingview.com</code>.
        Some networks block third-party scripts; the bundled chart still works.
      </p>
      <Link href={`/chart/${symbol}/structure`} className="text-brand text-sm underline-offset-2 hover:underline">
        ← back to structure chart
      </Link>
    </div>
  );
}
