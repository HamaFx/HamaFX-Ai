'use client';

// Client orchestration for the chart page. The route file stays a server
// component (so it can do `notFound()` based on the symbol) and delegates
// the interactive surface to this component.
//
// Phase 2 added SMC overlays. The toggles live in the URL via nuqs so
// refreshing the page keeps the chosen overlays.
// Phase 3 added an opt-in "Pro" link to the TradingView Advanced
// Charting Widget when NEXT_PUBLIC_TRADINGVIEW_ENABLED='1'.
import type { Symbol } from '@hamafx/shared';
import Link from 'next/link';
import { useMemo } from 'react';

import { Chart } from '@/components/chart/chart';
import { OverlayToggle, useOverlayToggles } from '@/components/chart/overlay-toggle';
import {
  buildOverlays,
  type OverlayPalette,
  type OverlayToggles,
} from '@/components/chart/overlays';
import { PriceTag } from '@/components/chart/price-tag';
import { SymbolPicker } from '@/components/chart/symbol-picker';
import { TimeframePicker } from '@/components/chart/timeframe-picker';
import { useCandles } from '@/hooks/use-candles';
import { useStructure } from '@/hooks/use-structure';
import { useTimeframe } from '@/hooks/use-tf';

const PALETTE: OverlayPalette = {
  bull: '#48d597',
  bear: '#f0594a',
  warn: '#f5b041',
  muted: '#7d8693',
};

export function ChartView({ symbol }: { symbol: Symbol }) {
  const [tf, setTf] = useTimeframe();
  const [activeOverlays, toggleOverlay] = useOverlayToggles();
  const { data: candles } = useCandles(symbol, tf);

  // Only fetch structure when at least one overlay is on. This skips the
  // upstream Twelve Data quota hit + DB cache write when the user just
  // wants to see plain candles.
  const overlaysOn = activeOverlays.length > 0;
  const { data: structure } = useStructure(symbol, tf, {
    enabled: overlaysOn,
    ...(overlaysOn ? { kinds: activeOverlays } : {}),
  });

  // Reference price = previous closed bar's close. The most recent bar may
  // still be in progress, so we use index `-2` when available.
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
    // Align the structure's bar indices to candle times.
    const times = candles.map((c) => c.t);
    return buildOverlays(structure, times, PALETTE, toggleRecord);
  }, [structure, candles, toggleRecord]);

  return (
    <div className="flex flex-col gap-4">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-col gap-1">
          <SymbolPicker active={symbol} />
          <PriceTag symbol={symbol} referencePrice={referenceClose} />
        </div>
        <div className="flex items-center gap-2">
          <TimeframePicker value={tf} onChange={setTf} />
          {process.env.NEXT_PUBLIC_TRADINGVIEW_ENABLED === '1' ? (
            <Link
              href={`/chart/${symbol}/pro?tf=${tf}`}
              className="border-border bg-bg-elev-2 text-fg-muted hover:text-fg focus-visible:ring-brand inline-flex h-9 min-w-[44px] items-center justify-center rounded-md border px-2 text-[11px] font-medium focus:outline-none focus-visible:ring-2"
            >
              Pro
            </Link>
          ) : null}
        </div>
      </header>

      <Chart symbol={symbol} tf={tf} overlays={overlaySet} />

      <div className="flex flex-wrap items-center justify-between gap-2">
        <OverlayToggle active={activeOverlays} onToggle={toggleOverlay} />
        {overlaysOn ? (
          <span className="text-fg-subtle text-[11px] tabular-nums">{summary(structure)}</span>
        ) : null}
      </div>

      <p className="text-fg-subtle text-[11px]">
        Polling at 1.5 s for price, {tf} candles refresh per server cache TTL. Source: Twelve Data
        (primary).
      </p>
    </div>
  );
}

/** Compact "X swings · Y FVG" summary shown next to the toggle. */
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
