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

const LOAD_TIMEOUT_MS = 6000;

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
  const [state, setState] = useState<'loading' | 'ready' | 'failed'>('loading');
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Try to create the widget once the container and TradingView API are both ready.
  const tryCreate = (tv: TradingViewGlobal) => {
    if (!containerRef.current || widgetRef.current) return;
    try {
      const w = new tv.widget({
        container_id: containerId,
        symbol: resolveTvSymbol(symbol),
        interval: TF_TO_TV_INTERVAL[tf] || '60',
        theme,
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
      setState('ready');
      if (timerRef.current) {
        clearTimeout(timerRef.current);
        timerRef.current = null;
      }
    } catch (err) {
      console.warn('[pro-chart] TradingView widget construct failed', err);
      setState('failed');
    }
  };

  useEffect(() => {
    // If TradingView is already available (script cached from prior navigation),
    // try immediately. Otherwise, wait for the Script onLoad callback.
    const tv = typeof window !== 'undefined' ? window.TradingView : undefined;
    if (tv) {
      tryCreate(tv);
    }

    // Set a timeout — if TradingView never becomes available, show fallback.
    if (!widgetRef.current) {
      timerRef.current = setTimeout(() => {
        const tvCheck = typeof window !== 'undefined' ? window.TradingView : undefined;
        if (tvCheck && containerRef.current && !widgetRef.current) {
          tryCreate(tvCheck);
        } else if (!tvCheck) {
          setState('failed');
        }
      }, LOAD_TIMEOUT_MS);
    }

    return () => {
      if (timerRef.current) {
        clearTimeout(timerRef.current);
        timerRef.current = null;
      }
      if (widgetRef.current) {
        widgetRef.current.remove();
        widgetRef.current = null;
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [containerId, symbol, tf, theme]);

  // Called when the tv.js <Script> finishes loading.
  const handleScriptLoad = () => {
    const tv = typeof window !== 'undefined' ? window.TradingView : undefined;
    if (tv) tryCreate(tv);
  };

  const height = 'calc(100vh - 4rem)';

  return (
    <>
      {/* Always render the Script so it actually loads. */}
      <Script
        src="https://s3.tradingview.com/tv.js"
        strategy="afterInteractive"
        onLoad={handleScriptLoad}
        onError={() => setState('failed')}
      />

      <div className="relative w-full" style={{ height }}>
        {/* The TradingView container — always rendered so the widget has a target. */}
        <div
          id={containerId}
          ref={containerRef}
          className="absolute inset-0"
          aria-label={`${symbol} ${tf} chart (TradingView)`}
        />

        {/* Loading skeleton — shown on top until the widget fills the container. */}
        {state === 'loading' && (
          <div className="bg-bg-elev-1 border-border absolute inset-0 z-10 flex flex-col items-center justify-center gap-3 rounded-sm border">
            <div className="bg-bg-elev-2 h-3 w-48 animate-pulse rounded-sm" />
            <div className="bg-bg-elev-2 h-3 w-32 animate-pulse rounded-sm" />
            <p className="text-fg-subtle mt-2 text-xs">Loading chart...</p>
          </div>
        )}

        {/* Error fallback — shown when TradingView fails to load. */}
        {state === 'failed' && (
          <div className="bg-bg-elev-1 border-border absolute inset-0 z-10 flex flex-col items-center justify-center gap-3 rounded-sm border p-6 text-center">
            <p className="text-bear text-lg font-semibold">Chart unavailable</p>
            <p className="text-fg-muted max-w-xs text-sm">
              The TradingView widget could not load. This may happen on networks that block third-party scripts.
            </p>
            <Link
              href="/chat"
              className="bg-bg-elev-2 hover:bg-bg-elev-3 border-border text-fg rounded-sm border px-4 py-2 text-sm transition-colors"
            >
              Open chat →
            </Link>
          </div>
        )}
      </div>
    </>
  );
}
