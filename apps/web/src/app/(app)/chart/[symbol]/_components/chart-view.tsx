'use client';

// Client orchestration for the chart page. The route file stays a server
// component (so it can do `notFound()` based on the symbol) and delegates
// the interactive surface to this component.
//
// Phase 5 polish: sticky glass sub-header below TopBar, overlay toggles
// moved into a bottom sheet, animated price + TF picker, proper
// loading/error/empty states (Phase 4).
import type { Symbol } from '@hamafx/shared';
import { Maximize2 } from 'lucide-react';
import Link from 'next/link';
import { useMemo } from 'react';

import { Chart } from '@/components/chart/chart';
import { useOverlayToggles } from '@/components/chart/overlay-toggle';
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

export function ChartView({ symbol }: { symbol: Symbol }) {
  const [tf, setTf] = useTimeframe();
  const [activeOverlays, toggleOverlay] = useOverlayToggles();
  const { data: candles, isLoading, error, refetch } = useCandles(symbol, tf);

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
    <div className="-mx-4 flex flex-col">
      {/* Sticky glass sub-header — sits flush below the TopBar */}
      <header className="border-divider bg-bg-elev-1/85 supports-[backdrop-filter]:bg-bg-elev-1/70 sticky top-12 z-20 border-b backdrop-blur-md">
        <div className="flex flex-col gap-2 px-4 py-2.5">
          <div className="flex items-center justify-between gap-3">
            <SymbolPicker active={symbol} />
            <PriceTag symbol={symbol} referencePrice={referenceClose} />
          </div>
          <div className="flex items-center justify-between gap-2">
            <TimeframePicker value={tf} onChange={setTf} />
            <div className="flex items-center gap-2">
              <OverlaySheet active={activeOverlays} onToggle={toggleOverlay} />
              {process.env.NEXT_PUBLIC_TRADINGVIEW_ENABLED === '1' ? (
                <Link
                  href={`/chart/${symbol}/pro?tf=${tf}`}
                  aria-label="Pro chart"
                  className="border-divider bg-bg-elev-2 text-fg-muted hover:text-fg focus-visible:ring-brand inline-flex h-9 w-9 items-center justify-center rounded-md border focus:outline-none focus-visible:ring-2"
                >
                  <Maximize2 className="size-3.5" />
                </Link>
              ) : null}
            </div>
          </div>
        </div>
      </header>

      <div className="flex flex-col gap-4 px-4 py-4">
        {isLoading ? (
          <ChartSkeleton />
        ) : error ? (
          <ChartError error={error} onRetry={() => void refetch()} />
        ) : !candles || candles.length === 0 ? (
          <ChartEmpty symbol={symbol} tf={tf} onRetry={() => void refetch()} />
        ) : (
          <Chart symbol={symbol} tf={tf} overlays={overlaySet} />
        )}

        {overlaysOn ? (
          <p className="text-fg-subtle text-[11px] tabular-nums">{summary(structure)}</p>
        ) : null}

        <p className="text-fg-subtle text-[11px]">
          Polling at 1.5s for price · {tf} candles per server cache TTL · Source: Twelve Data
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
