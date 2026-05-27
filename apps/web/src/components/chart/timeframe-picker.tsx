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
      className="glass-subtle inline-flex items-center gap-0.5 rounded-xl p-0.5"
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
              'relative rounded-lg px-2.5 py-1.5 text-[11px] font-semibold tabular-nums transition-colors',
              'min-w-[28px]',
              active ? 'text-brand-fg' : 'text-fg-muted hover:text-fg',
            )}
          >
            {active ? (
              <m.span
                layoutId="tf-indicator"
                className="absolute inset-0 -z-0 rounded-lg"
                style={{
                  background:
                    'linear-gradient(135deg, oklch(80% 0.16 78) 0%, oklch(74% 0.18 60) 100%)',
                  boxShadow:
                    'inset 0 1px 0 0 oklch(100% 0 0 / 0.15), 0 4px 12px -2px oklch(78% 0.16 78 / 0.4)',
                }}
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
