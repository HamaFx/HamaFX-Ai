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

// Live price readout for the chart header. Subscribes to the global price
// poller so multiple tags on the same page share one upstream call.
//
// The price digits animate via `<AnimatedNumber>` (motion spring) so live
// updates feel alive instead of snapping. Delta gets a IconTrendingUp/Down
// icon for at-a-glance direction.

import { getSymbolDefinition, isKnownSymbol, priceDecimals, type Symbol } from '@hamafx/shared';
import {IconMinus, IconTrendingDown, IconTrendingUp} from '@tabler/icons-react';
import { useCallback, useRef, useState } from 'react';

import { AnimatedNumber } from '@/components/ui/animated-number';
import { usePrice } from '@/hooks/use-prices';
import { cn } from '@/lib/cn';

interface PriceTagProps {
  symbol: Symbol;
  /**
   * Reference price used to render +/- delta and bull/bear colour.
   * Pass the prior close (e.g. previous bar's close) to show change-vs-open.
   */
  referencePrice?: number | null;
  className?: string;
}

/**
 * Live price readout for the chart header. Uses IntersectionObserver to
 * pause polling when the tag is scrolled off-screen, saving bandwidth
 * and CPU for price tags that aren't visible (e.g. in a scrolled chart
 * or off-screen dashboard widget).
 */
export function PriceTag({ symbol, referencePrice, className }: PriceTagProps) {
  const observerRef = useRef<IntersectionObserver | null>(null);
  const [inView, setInView] = useState(true); // start visible to avoid flash

  // Callback ref: re-connects IntersectionObserver whenever the DOM node
  // changes (handles render-branch transitions without orphaning the observer).
  const elRef = useCallback((node: HTMLSpanElement | null) => {
    observerRef.current?.disconnect();
    observerRef.current = null;
    if (!node) return;
    const observer = new IntersectionObserver(
      ([entry]) => setInView(entry?.isIntersecting ?? true),
      { threshold: 0 },
    );
    observer.observe(node);
    observerRef.current = observer;
  }, []);

  const { tick, isLoading, isError } = usePrice(symbol, { enabled: inView });
  const decimals = isKnownSymbol(symbol) ? getSymbolDefinition(symbol).decimals : priceDecimals(symbol);

  if (isLoading) {
    return (
      <span ref={elRef} className={cn('text-fg-subtle text-base tabular-nums animate-pulse', className)}>
        —
      </span>
    );
  }
  if (isError || !tick) {
    return (
      <span ref={elRef} className={cn('text-danger text-xs tabular-nums', className)}>price unavailable</span>
    );
  }

  const delta = referencePrice != null ? tick.mid - referencePrice : null;
  const bull = delta !== null && delta > 0;
  const bear = delta !== null && delta < 0;

  return (
    <span ref={elRef} className={cn('flex items-baseline gap-2', className)}>
      <AnimatedNumber
        value={tick.mid}
        decimals={decimals}
        className={cn(
          'text-base font-semibold tabular-nums',
          bull && 'text-bull',
          bear && 'text-bear',
        )}
      />
      {delta !== null ? (
        <span
          className={cn(
            'inline-flex items-center gap-0.5 text-xs tabular-nums',
            bull && 'text-bull',
            bear && 'text-bear',
            !bull && !bear && 'text-fg-muted',
          )}
        >
          {bull ? <IconTrendingUp className="size-3" /> : bear ? <IconTrendingDown className="size-3" /> : <IconMinus className="size-3" />}
          {delta >= 0 ? '+' : ''}
          {delta.toFixed(decimals)}
        </span>
      ) : null}
    </span>
  );
}
