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

// TradingView Advanced Charting Widget — opt-in Pro chart view.
//
// Loads `tv.js` once via next/script, then constructs the widget against
// a div container. We pass the matching OANDA prefix the rest of the
// data layer uses (`OANDA:XAUUSD` etc.) so the symbol picker on the
// widget shows the same symbol the user came from.
//
// Failure modes:
//   - tv.js blocked / network down → after a generous timeout we render
//     a graceful message + back link (gov't / corporate networks often
//     block s3.tradingview.com).

import type { Symbol, Timeframe } from '@hamafx/shared';
import { Link } from 'next-view-transitions';
import Script from 'next/script';
import { useEffect, useRef, useState } from 'react';

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

const SYMBOL_TO_TV: Record<Symbol, string> = {
  XAUUSD: 'OANDA:XAUUSD',
  EURUSD: 'OANDA:EURUSD',
  GBPUSD: 'OANDA:GBPUSD',
};

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
}

export function TradingViewWidget({ symbol, tf }: TradingViewWidgetProps) {
  const containerId = `tv-${symbol}-${tf}`;
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [loadFailed, setLoadFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const start = Date.now();

    const tryInit = () => {
      if (cancelled) return;
      const tv = typeof window !== 'undefined' ? window.TradingView : undefined;
      if (tv) {
        try {
          new tv.widget({
            container_id: containerId,
            symbol: SYMBOL_TO_TV[symbol],
            interval: TF_TO_TV_INTERVAL[tf],
            theme: 'dark',
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
        } catch (err) {
          console.warn('[pro-chart] TradingView widget construct failed', err);
          setLoadFailed(true);
        }
        return;
      }
      if (Date.now() - start > LOAD_TIMEOUT_MS) {
        setLoadFailed(true);
        return;
      }
      setTimeout(tryInit, 250);
    };
    tryInit();

    return () => {
      cancelled = true;
      // eslint-disable-next-line react-hooks/exhaustive-deps -- ref pointer is fine to read at cleanup time
      const node = containerRef.current;
      if (node) node.innerHTML = '';
    };
  }, [containerId, symbol, tf]);

  return (
    <>
      <Script
        src="https://s3.tradingview.com/tv.js"
        strategy="afterInteractive"
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
      <p className="text-bear font-semibold">TradingView didn&apos;t load.</p>
      <p>
        The Advanced Charting Widget couldn&apos;t reach <code>s3.tradingview.com</code>.
        Some networks block third-party scripts; the bundled chart still works.
      </p>
      <Link href={`/chart/${symbol}`} className="text-brand text-sm underline-offset-2 hover:underline">
        ← back to bundled chart
      </Link>
    </div>
  );
}
