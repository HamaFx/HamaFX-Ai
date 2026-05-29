'use client';

// <Segmented> — single primitive replacing the four ad-hoc segmented controls
// the codebase had grown (TimeframePicker, SymbolPicker, alert-form's
// Segmented, journal entry-form's Pills). One shape, three rendering modes:
//
//   variant="gradient" → brand-gradient slide-in indicator (chart pickers)
//   variant="solid"    → flat brand bg on the active segment (forms)
//   variant="tone"     → bull/bear/brand tone per option (long/short, ↑/↓)
//
// The active indicator uses motion's shared `layoutId` so the highlight
// slides between segments. Pass a unique `groupId` per page so multiple
// Segmented controls don't share the same layout animation.
//
// Items can render as buttons (default) or links (Symbol picker on /chart
// keeps URL state). Pass `as="link"` + `hrefFor` to opt into Link mode.

import { m } from 'motion/react';
import { Link } from 'next-view-transitions';
import { useId } from 'react';

import { cn } from '@/lib/cn';

export type SegmentedVariant = 'gradient' | 'solid' | 'tone';
export type SegmentedTone = 'brand' | 'bull' | 'bear';

export interface SegmentedOption<T extends string> {
  value: T;
  label: string;
  /** Per-option tone — only consulted in `variant="tone"` mode. */
  tone?: SegmentedTone;
  /** Optional aria-label override for icon-only options. */
  ariaLabel?: string;
}

interface SegmentedBaseProps<T extends string> {
  /** Visible label rendered above the control. Hidden visually if `srLabel` is true. */
  label?: string;
  /** Treat `label` as visually hidden but kept for screen readers. */
  srLabel?: boolean;
  value: T;
  options: ReadonlyArray<SegmentedOption<T>>;
  /** ARIA role: 'tablist' for view switchers, 'radiogroup' for form choices. */
  role?: 'tablist' | 'radiogroup';
  variant?: SegmentedVariant;
  /** Unique layout-id key. Defaults to a useId() so each instance is isolated. */
  groupId?: string;
  size?: 'sm' | 'md';
  className?: string;
}

interface ButtonModeProps<T extends string> extends SegmentedBaseProps<T> {
  as?: 'button';
  onChange: (next: T) => void;
}

interface LinkModeProps<T extends string> extends SegmentedBaseProps<T> {
  as: 'link';
  hrefFor: (value: T) => string;
}

export type SegmentedProps<T extends string> = ButtonModeProps<T> | LinkModeProps<T>;

const SIZE: Record<NonNullable<SegmentedBaseProps<string>['size']>, string> = {
  // sm = 40px (h-10) so the inner button still clears 44pt when the
  // segmented sits inside a row that already has a tap-target frame
  // (e.g. chart sub-header where the wrapper is 44+).
  sm: 'h-10 text-[11px]',
  // md = 48px — default for forms. Sits in the thumb zone of bottom drawers.
  md: 'h-12 text-sm',
};

const ITEM_PAD: Record<NonNullable<SegmentedBaseProps<string>['size']>, string> = {
  sm: 'px-3 py-2',
  md: 'px-4 py-2.5',
};

export function Segmented<T extends string>(props: SegmentedProps<T>) {
  const {
    label,
    srLabel,
    value,
    options,
    role = 'tablist',
    variant = 'solid',
    groupId,
    size = 'sm',
    className,
  } = props;

  const generatedId = useId();
  const layoutId = `seg-${groupId ?? generatedId}`;

  return (
    <div className="flex flex-col gap-1">
      {label ? (
        <span
          className={cn(
            'text-fg-subtle text-[11px] uppercase tracking-wide',
            srLabel && 'sr-only',
          )}
        >
          {label}
        </span>
      ) : null}
      <div
        role={role}
        aria-label={label}
        className={cn(
          variant === 'gradient'
            ? 'glass-subtle inline-flex items-center gap-0.5 rounded-xl p-0.5'
            : 'border-border bg-bg-elev-2 inline-flex flex-wrap items-center gap-0.5 rounded-md border p-0.5',
          className,
        )}
      >
        {options.map((opt) => {
          const active = opt.value === value;
          const baseItem = cn(
            'relative inline-flex min-w-[44px] items-center justify-center rounded-lg font-semibold tabular-nums transition-colors',
            'focus-visible:ring-brand focus:outline-none focus-visible:ring-2',
            ITEM_PAD[size],
            SIZE[size],
            !active && 'text-fg-muted hover:text-fg',
            active && variant === 'gradient' && 'text-brand-fg',
            active && variant === 'solid' && 'bg-brand text-brand-fg',
            active && variant === 'tone' && toneClass(opt.tone),
          );

          const indicator =
            active && variant === 'gradient' ? (
              <m.span
                layoutId={layoutId}
                className="absolute inset-0 -z-0 rounded-lg"
                style={{
                  backgroundImage: 'var(--gradient-brand)',
                  boxShadow:
                    'inset 0 1px 0 0 oklch(100% 0 0 / 0.15), 0 4px 12px -2px oklch(78% 0.16 78 / 0.4)',
                }}
                transition={{ type: 'spring', stiffness: 380, damping: 30 }}
              />
            ) : null;

          const labelEl = (
            <span className="relative z-10 leading-none">{opt.label}</span>
          );

          if (props.as === 'link') {
            return (
              <Link
                key={opt.value}
                href={props.hrefFor(opt.value)}
                role={role === 'tablist' ? 'tab' : undefined}
                aria-label={opt.ariaLabel}
                aria-selected={role === 'tablist' ? active : undefined}
                aria-checked={role === 'radiogroup' ? active : undefined}
                className={baseItem}
              >
                {indicator}
                {labelEl}
              </Link>
            );
          }

          return (
            <button
              key={opt.value}
              type="button"
              role={role === 'tablist' ? 'tab' : 'radio'}
              aria-label={opt.ariaLabel}
              aria-selected={role === 'tablist' ? active : undefined}
              aria-checked={role === 'radiogroup' ? active : undefined}
              onClick={() => props.onChange(opt.value)}
              className={baseItem}
            >
              {indicator}
              {labelEl}
            </button>
          );
        })}
      </div>
    </div>
  );
}

function toneClass(tone: SegmentedTone | undefined): string {
  if (tone === 'bull') return 'bg-bull text-bg';
  if (tone === 'bear') return 'bg-bear text-bg';
  return 'bg-brand text-brand-fg';
}
