'use client';

// Mobile-friendly segmented control for the 8 supported timeframes.
// The active segment uses motion's layoutId so the highlight slides
// between segments instead of snapping.

import { TIMEFRAMES, type Timeframe } from '@hamafx/shared';
import { m } from 'motion/react';

import { cn } from '@/lib/cn';

interface TimeframePickerProps {
  value: Timeframe;
  onChange: (tf: Timeframe) => void;
  /**
   * Subset to render — defaults to the full 8. Useful if a future view only
   * supports intraday timeframes.
   */
  options?: readonly Timeframe[];
}

export function TimeframePicker({ value, onChange, options = TIMEFRAMES }: TimeframePickerProps) {
  return (
    <div
      role="tablist"
      aria-label="Timeframe"
      className="border-divider bg-bg-elev-2 inline-flex items-center gap-0.5 rounded-md border p-0.5"
    >
      {options.map((tf) => {
        const active = tf === value;
        return (
          <button
            key={tf}
            role="tab"
            type="button"
            aria-selected={active}
            onClick={() => onChange(tf)}
            className={cn(
              'relative rounded px-2 py-1 text-[11px] font-medium tabular-nums transition-colors',
              'min-w-[28px]',
              active ? 'text-brand-fg' : 'text-fg-muted hover:text-fg',
            )}
          >
            {active ? (
              <m.span
                layoutId="tf-indicator"
                className="bg-brand absolute inset-0 -z-0 rounded"
                transition={{ type: 'spring', stiffness: 380, damping: 30 }}
              />
            ) : null}
            <span className="relative z-10">{tf}</span>
          </button>
        );
      })}
    </div>
  );
}
