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

// Dynamic customizer and indicator selection drawer.
// Allows real-time toggling of moving averages, oscillators, theme canvasses, and grid styles.

import {
  Drawer,
  DrawerContent,
  DrawerHeader,
  DrawerTitle,
  DrawerTrigger,
} from '@/components/ui/drawer';
import { Switch } from '@/components/ui/switch';
import {IconPalette, IconActivity, IconGridDots, IconCheck, IconArrowBackUp} from '@tabler/icons-react';
import { cn } from '@/lib/cn';
import { Button } from '@/components/ui/button';
import { useConfirm } from '@/components/ui/confirm-drawer';
import type { ChartSettings } from './chart';

export interface ChartIndicators {
  ema20: boolean;
  ema50: boolean;
  ema200: boolean;
  sma50: boolean;
  sma100: boolean;
  bollinger: boolean;
  rsi: boolean;
  macd: boolean;
  atr: boolean;
  pivots: boolean;
}

interface ChartSettingsDrawerProps {
  settings: ChartSettings;
  onSettingsChange: (settings: ChartSettings) => void;
  indicators: ChartIndicators;
  onIndicatorsChange: (indicators: ChartIndicators) => void;
  trigger: React.ReactNode;
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

export function ChartSettingsDrawer({
  settings,
  onSettingsChange,
  indicators,
  onIndicatorsChange,
  trigger,
}: ChartSettingsDrawerProps) {
  const [confirmEl, confirm] = useConfirm();

  const themes = [
    { id: 'black', label: 'True Black', desc: 'Zero-chroma pure black' },
    { id: 'slate', label: 'Slate Dark', desc: 'Neutral slate canvas' },
    { id: 'navy', label: 'Space Navy', desc: 'Deep cosmic dark blue' },
    { id: 'classic', label: 'Classic Dark', desc: 'Hama legacy background' },
  ] as const;

  const grids = [
    { id: 'solid', label: 'Solid Grid' },
    { id: 'dotted', label: 'Dotted Grid' },
    { id: 'none', label: 'No Grid' },
  ] as const;

  const toggleIndicator = (key: keyof ChartIndicators) => {
    onIndicatorsChange({
      ...indicators,
      [key]: !indicators[key],
    });
  };

  const updateTheme = (theme: ChartSettings['theme']) => {
    onSettingsChange({
      ...settings,
      theme,
    });
  };

  const updateGrid = (gridStyle: ChartSettings['gridStyle']) => {
    onSettingsChange({
      ...settings,
      gridStyle,
    });
  };

  return (
    <Drawer>
      <DrawerTrigger asChild>{trigger}</DrawerTrigger>
      <DrawerContent className="max-h-[85svh] px-4">
        <DrawerHeader className="px-0">
          <DrawerTitle className="text-xl font-bold tracking-tight">Chart Preferences</DrawerTitle>
        </DrawerHeader>

        <div className="scrollbar-hide flex-1 overflow-y-auto py-2 pb-6 flex flex-col gap-6">
          
          {/* Section 1: Themes */}
          <div className="flex flex-col gap-2.5">
            <h3 className="text-xs font-bold uppercase tracking-wider text-fg-subtle flex items-center gap-1.5 px-0.5">
              <IconPalette className="size-3.5" />
              Theme Canvas
            </h3>
            <div className="grid grid-cols-2 gap-2">
              {themes.map((t) => (
                <button
                  key={t.id}
                  onClick={() => updateTheme(t.id)}
                  className={cn(
                    'flex flex-col text-left p-3 rounded-sm border border-border bg-bg-elev-2/50 transition-all hover:bg-bg-elev-3 cursor-pointer relative',
                    settings.theme === t.id && 'border-border/70 bg-bg-elev-1 shadow-none/10'
                  )}
                >
                  <span className="text-sm font-semibold">{t.label}</span>
                  <span className="text-xs text-fg-muted mt-0.5">{t.desc}</span>
                  {settings.theme === t.id && (
                    <IconCheck className="size-4 text-fg absolute right-3 top-3.5" />
                  )}
                </button>
              ))}
            </div>
          </div>

          {/* Section 2: Grid Lines */}
          <div className="flex flex-col gap-2.5">
            <h3 className="text-xs font-bold uppercase tracking-wider text-fg-subtle flex items-center gap-1.5 px-0.5">
              <IconGridDots className="size-3.5" />
              Grid Styles
            </h3>
            <div className="grid grid-cols-3 gap-2">
              {grids.map((g) => (
                <button
                  key={g.id}
                  onClick={() => updateGrid(g.id)}
                  className={cn(
                    'text-center py-2.5 text-xs font-semibold rounded-sm border border-border bg-bg-elev-2/50 transition-all hover:bg-bg-elev-3 cursor-pointer relative',
                    settings.gridStyle === g.id && 'border-border/70 bg-bg-elev-1'
                  )}
                >
                  {g.label}
                  {settings.gridStyle === g.id && (
                    <IconCheck className="size-3 text-fg absolute right-2 top-2.5" />
                  )}
                </button>
              ))}
            </div>
          </div>

          {/* Section 3: Indicators */}
          <div className="flex flex-col gap-2.5">
            <h3 className="text-xs font-bold uppercase tracking-wider text-fg-subtle flex items-center gap-1.5 px-0.5">
              <IconActivity className="size-3.5" />
              Indicator Layers
            </h3>
            
            <div className="flex flex-col gap-1 rounded-sm border border-border bg-bg-elev-2/40 overflow-hidden">
              
              {/* EMA 20 */}
              <div className="flex items-center justify-between p-3.5 border-b border-border/40">
                <div className="flex items-center gap-3">
                  <div className="size-2.5 rounded-sm bg-info shadow-md" />
                  <div className="flex flex-col">
                    <span className="text-sm font-semibold">EMA 20</span>
                    <span className="text-xs text-fg-muted mt-0.5">Exponential moving average (20 period)</span>
                  </div>
                </div>
                <Switch
                  checked={indicators.ema20}
                  onCheckedChange={() => toggleIndicator('ema20')}
                  srLabel="Toggle EMA 20"
                />
              </div>

              {/* EMA 50 */}
              <div className="flex items-center justify-between p-3.5 border-b border-border/40">
                <div className="flex items-center gap-3">
                  <div className="size-2.5 rounded-sm bg-accent shadow-md" />
                  <div className="flex flex-col">
                    <span className="text-sm font-semibold">EMA 50</span>
                    <span className="text-xs text-fg-muted mt-0.5">Exponential moving average (50 period)</span>
                  </div>
                </div>
                <Switch
                  checked={indicators.ema50}
                  onCheckedChange={() => toggleIndicator('ema50')}
                  srLabel="Toggle EMA 50"
                />
              </div>

              {/* EMA 200 */}
              <div className="flex items-center justify-between p-3.5 border-b border-border/40">
                <div className="flex items-center gap-3">
                  <div className="size-2.5 rounded-sm bg-warn shadow-md" />
                  <div className="flex flex-col">
                    <span className="text-sm font-semibold">EMA 200</span>
                    <span className="text-xs text-fg-muted mt-0.5">Exponential moving average (200 period)</span>
                  </div>
                </div>
                <Switch
                  checked={indicators.ema200}
                  onCheckedChange={() => toggleIndicator('ema200')}
                  srLabel="Toggle EMA 200"
                />
              </div>

              {/* SMA 50 */}
              <div className="flex items-center justify-between p-3.5 border-b border-border/40">
                <div className="flex items-center gap-3">
                  <div className="size-2.5 rounded-sm bg-bull shadow-md" />
                  <div className="flex flex-col">
                    <span className="text-sm font-semibold">SMA 50</span>
                    <span className="text-xs text-fg-muted mt-0.5">Simple moving average (50 period)</span>
                  </div>
                </div>
                <Switch
                  checked={indicators.sma50}
                  onCheckedChange={() => toggleIndicator('sma50')}
                  srLabel="Toggle SMA 50"
                />
              </div>

              {/* SMA 100 */}
              <div className="flex items-center justify-between p-3.5 border-b border-border/40">
                <div className="flex items-center gap-3">
                  <div className="size-2.5 rounded-sm bg-neutral shadow-md" />
                  <div className="flex flex-col">
                    <span className="text-sm font-semibold">SMA 100</span>
                    <span className="text-xs text-fg-muted mt-0.5">Simple moving average (100 period)</span>
                  </div>
                </div>
                <Switch
                  checked={indicators.sma100}
                  onCheckedChange={() => toggleIndicator('sma100')}
                  srLabel="Toggle SMA 100"
                />
              </div>

              {/* Bollinger Bands */}
              <div className="flex items-center justify-between p-3.5 border-b border-border/40">
                <div className="flex items-center gap-3">
                  <div className="size-2.5 rounded-sm bg-warn shadow-md animate-pulse" />
                  <div className="flex flex-col">
                    <span className="text-sm font-semibold">Bollinger Bands</span>
                    <span className="text-xs text-fg-muted mt-0.5">Volatility envelopes (20, 2)</span>
                  </div>
                </div>
                <Switch
                  checked={indicators.bollinger}
                  onCheckedChange={() => toggleIndicator('bollinger')}
                  srLabel="Toggle Bollinger Bands"
                />
              </div>

              {/* Pivot Points */}
              <div className="flex items-center justify-between p-3.5 border-b border-border/40">
                <div className="flex items-center gap-3">
                  <div className="size-2.5 rounded-sm bg-info shadow-md animate-pulse" />
                  <div className="flex flex-col">
                    <span className="text-sm font-semibold">Pivot Points</span>
                    <span className="text-xs text-fg-muted mt-0.5">Classic daily floor-trader pivots (PP, S/R levels)</span>
                  </div>
                </div>
                <Switch
                  checked={indicators.pivots}
                  onCheckedChange={() => toggleIndicator('pivots')}
                  srLabel="Toggle Pivot Points"
                />
              </div>

              {/* RSI Pane */}
              <div className="flex items-center justify-between p-3.5 border-b border-border/40 bg-accent/5">
                <div className="flex items-center gap-3">
                  <div className="size-2.5 rounded-sm bg-accent shadow-md animate-pulse" />
                  <div className="flex flex-col">
                    <span className="text-sm font-semibold text-accent">RSI Oscillator Pane</span>
                    <span className="text-xs text-accent/80 mt-0.5">Synchronized Relative Strength Index (14)</span>
                  </div>
                </div>
                <Switch
                  checked={indicators.rsi}
                  onCheckedChange={() => toggleIndicator('rsi')}
                  srLabel="Toggle RSI Pane"
                />
              </div>

              {/* MACD Pane */}
              <div className="flex items-center justify-between p-3.5 border-b border-border/40 bg-info/5">
                <div className="flex items-center gap-3">
                  <div className="size-2.5 rounded-sm bg-info shadow-md animate-pulse" />
                  <div className="flex flex-col">
                    <span className="text-sm font-semibold text-info">MACD Oscillator Pane</span>
                    <span className="text-xs text-info/80 mt-0.5">Moving average convergence divergence (12, 26, 9)</span>
                  </div>
                </div>
                <Switch
                  checked={indicators.macd}
                  onCheckedChange={() => toggleIndicator('macd')}
                  srLabel="Toggle MACD Pane"
                />
              </div>

              {/* ATR Pane */}
              <div className="flex items-center justify-between p-3.5 bg-warn/5">
                <div className="flex items-center gap-3">
                  <div className="size-2.5 rounded-sm bg-warn shadow-md animate-pulse" />
                  <div className="flex flex-col">
                    <span className="text-sm font-semibold text-warn">ATR Volatility Pane</span>
                    <span className="text-xs text-warn/80 mt-0.5">Synchronized Average True Range (14)</span>
                  </div>
                </div>
                <Switch
                  checked={indicators.atr}
                  onCheckedChange={() => toggleIndicator('atr')}
                  srLabel="Toggle ATR Pane"
                />
              </div>

            </div>
          </div>

          {/* Reset to defaults */}
          <div className="flex flex-col gap-2 pt-2">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={async () => {
                const ok = await confirm({
                  title: 'Reset chart preferences?',
                  description: 'All theme, grid, and indicator settings will return to their defaults.',
                  confirmLabel: 'Reset',
                });
                if (ok) {
                  onIndicatorsChange(DEFAULT_INDICATORS);
                  onSettingsChange(DEFAULT_SETTINGS);
                }
              }}
              className="self-start"
            >
              <IconArrowBackUp className="size-4" />
              Reset to defaults
            </Button>
          </div>

        </div>

        {confirmEl}
      </DrawerContent>
    </Drawer>
  );
}
