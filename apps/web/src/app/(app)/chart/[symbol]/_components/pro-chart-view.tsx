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

import { type Symbol } from '@hamafx/shared';
import { Link } from 'next-view-transitions';
import React, { useEffect, useMemo } from 'react';

import { PriceTag } from '@/components/chart/price-tag';
import { SymbolPicker } from '@/components/chart/symbol-picker';
import { TimeframePicker } from '@/components/chart/timeframe-picker';
import { PinToChat } from '@/components/chart/pin-to-chat';
import { StaleIndicator } from '@/components/ui/stale-indicator';
import { useChartData } from '@/hooks/use-chart-data';
import { useTimeframe } from '@/hooks/use-tf';
import { useLocalStorage } from '@/hooks/use-local-storage';
import { type ChartSettings } from '@/components/chart/chart';
import { type ChartIndicators } from '@/components/chart/chart-settings-drawer';
import { TradingViewWidget } from './tradingview-widget';

interface ChartConfig {
  indicators: ChartIndicators;
  settings: ChartSettings;
}

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

const MIGRATED_KEY = 'hfx_chart_config_migrated';

export function ProChartView({ symbol, watchlist }: { symbol: Symbol; watchlist: string[] }) {
  const [tf, setTf] = useTimeframe();
  const [, setConfig] = useLocalStorage<ChartConfig>('hfx_chart_config', {
    indicators: DEFAULT_INDICATORS,
    settings: DEFAULT_SETTINGS,
  });

  // Migrate from old storage key 'hamafx-chart-settings' to 'hfx_chart_config'
  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (window.localStorage.getItem(MIGRATED_KEY)) return;
    try {
      const oldRaw = window.localStorage.getItem('hamafx-chart-settings');
      if (oldRaw) {
        const oldSettings = JSON.parse(oldRaw) as Partial<ChartSettings>;
        setConfig((prev) => ({
          ...prev,
          settings: { ...prev.settings, ...oldSettings },
        }));
      }
    } catch {
      // ignore migration errors
    } finally {
      window.localStorage.setItem(MIGRATED_KEY, '1');
      window.localStorage.removeItem('hamafx-chart-settings');
    }
  }, [setConfig]);

  const { candles, isLoading, isFetching } = useChartData(symbol, tf, [], 300);

  const referenceClose = useMemo(() => {
    return candles && candles.length > 0 ? (candles[candles.length - 1]?.c ?? null) : null;
  }, [candles]);

  // Map settings.theme if needed. For now, all hamfx themes are dark/slate/navy, so 'dark' is default.
  const tvTheme = 'dark';

  return (
    <div className="-mx-4 flex flex-col animate-in fade-in duration-300">
      {/* Sticky floating sub-header */}
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

              <PinToChat symbol={symbol} />

              {/* Toggle Tab */}
              <div className="flex bg-bg-elev-2 p-0.5 rounded-sm border border-border">
                <span className="px-3 py-1.5 text-xs font-semibold rounded-sm bg-bg-elev-1 text-fg shadow-sm">
                  TradingView
                </span>
                <Link
                  href={`/chart/${symbol}/structure?tf=${tf}`}
                  className="px-3 py-1.5 text-xs font-medium rounded-sm text-fg-muted hover:text-fg transition-colors"
                >
                  Structure
                </Link>
              </div>
            </div>
          </div>
        </header>
      </div>

      <div className="flex flex-col gap-4 px-4 py-4">
        <TradingViewWidget symbol={symbol} tf={tf} theme={tvTheme} />
      </div>
    </div>
  );
}
