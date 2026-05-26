'use client';

// Mobile-friendly segmented control for the 8 supported timeframes.
// Compact enough to fit in the TopBar's right slot; uses brand colour for
// the active segment so it pops without a heavy outline.
import { TIMEFRAMES, type Timeframe } from '@hamafx/shared';

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
      className="border-border bg-bg-elev-2 inline-flex items-center gap-0.5 rounded-md border p-0.5"
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
              'rounded px-2 py-1 text-[11px] font-medium tabular-nums transition-colors',
              'min-w-[28px]',
              active ? 'bg-brand text-brand-fg' : 'text-fg-muted hover:bg-bg-elev-1 hover:text-fg',
            )}
          >
            {tf}
          </button>
        );
      })}
    </div>
  );
}
