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
import { useEffect, useId, useRef, useState } from 'react';

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
  /** Optional group name for generating default aria-label */
  name?: string;
  /** Optional direct aria-label override */
  ariaLabel?: string;
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
  sm: 'h-10 text-body-sm',
  // md = 48px — default for forms. Sits in the thumb zone of bottom drawers.
  md: 'h-12 text-body-sm',
};

const ITEM_PAD: Record<NonNullable<SegmentedBaseProps<string>['size']>, string> = {
  sm: 'px-3 py-2',
  md: 'px-4 py-2.5',
};

export function Segmented<T extends string>(props: SegmentedProps<T>) {
  const {
    name,
    ariaLabel: customAriaLabel,
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
  const containerRef = useRef<HTMLDivElement>(null);

  const [focusedIndex, setFocusedIndex] = useState(() => {
    const idx = options.findIndex((o) => o.value === value);
    return idx >= 0 ? idx : 0;
  });

  useEffect(() => {
    const idx = options.findIndex((o) => o.value === value);
    if (idx >= 0) {
      setFocusedIndex(idx);
    }
  }, [value, options]);

  const focusIndex = (index: number) => {
    setFocusedIndex(index);
    const items = containerRef.current?.querySelectorAll<HTMLButtonElement | HTMLAnchorElement>(
      'button, a'
    );
    items?.[index]?.focus();
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    switch (e.key) {
      case 'ArrowLeft':
      case 'ArrowUp': {
        e.preventDefault();
        const prev = (focusedIndex - 1 + options.length) % options.length;
        focusIndex(prev);
        break;
      }
      case 'ArrowRight':
      case 'ArrowDown': {
        e.preventDefault();
        const next = (focusedIndex + 1) % options.length;
        focusIndex(next);
        break;
      }
      case 'Home': {
        e.preventDefault();
        focusIndex(0);
        break;
      }
      case 'End': {
        e.preventDefault();
        focusIndex(options.length - 1);
        break;
      }
      default:
        break;
    }
  };

  const computedAriaLabel =
    customAriaLabel || label || (srLabel ? `${name ?? 'Segmented'} selector` : undefined);

  return (
    <div className="flex flex-col gap-1">
      {label ? (
        <span
          className={cn(
            'text-fg-subtle text-body-sm uppercase tracking-wide',
            srLabel && 'sr-only',
          )}
        >
          {label}
        </span>
      ) : null}
      <div
        ref={containerRef}
        role={role}
        aria-label={computedAriaLabel}
        onKeyDown={handleKeyDown}
        className={cn(
          variant === 'gradient'
            ? 'border-border bg-zinc-900 inline-flex items-center gap-0.5 rounded-sm border p-0.5'
            : 'border-border bg-zinc-900 inline-flex flex-wrap items-center gap-0.5 rounded-sm border p-0.5',
          className,
        )}
      >
        {options.map((opt, optIndex) => {
          const active = opt.value === value;
          const baseItem = cn(
            'relative inline-flex min-w-[44px] items-center justify-center rounded-sm font-semibold tabular-nums transition-colors',
            'focus-visible:ring-fg focus:outline-none focus-visible:ring-2',
            ITEM_PAD[size],
            SIZE[size],
            !active && 'text-fg-muted hover:text-fg',
            active && variant === 'gradient' && 'text-black',
            active && variant === 'solid' && 'bg-fg text-black',
            active && variant === 'tone' && toneClass(opt.tone),
          );

          const indicator =
            active && variant === 'gradient' ? (
              <m.span
                layoutId={layoutId}
                className="absolute inset-0 -z-0 rounded-sm"
                style={{
                  backgroundImage: 'none',
                  boxShadow:
                    'inset 0 1px 0 0 rgba(250, 250, 250, 0.15), 0 4px 12px -2px rgba(250, 250, 250, 0.2)',
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
                tabIndex={optIndex === focusedIndex ? 0 : -1}
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
              tabIndex={optIndex === focusedIndex ? 0 : -1}
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
  if (tone === 'bull') return 'bg-emerald-500 text-black';
  if (tone === 'bear') return 'bg-red-500 text-black';
  return 'bg-fg text-black';
}
