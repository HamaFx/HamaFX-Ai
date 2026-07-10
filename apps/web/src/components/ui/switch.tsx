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

// <Switch> — pure CSS toggle. Used for app-wide preferences (motion, etc.)
// where we don't want a full Radix dependency for one control. Honors
// keyboard (space/enter via the underlying button) and aria-checked.

import { forwardRef, type ButtonHTMLAttributes } from 'react';

import { cn } from '@/lib/cn';

interface SwitchProps extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'onChange'> {
  checked: boolean;
  onCheckedChange: (next: boolean) => void;
  /** Accessible label for SR users. The visible label is rendered by the
   *  parent row. */
  srLabel: string;
}

export const Switch = forwardRef<HTMLButtonElement, SwitchProps>(function Switch(
  { checked, onCheckedChange, srLabel, className, disabled, ...rest },
  ref,
) {
  return (
    <button
      ref={ref}
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={srLabel}
      disabled={disabled}
      onClick={() => onCheckedChange(!checked)}
      className={cn(
        'relative inline-flex h-7 w-12 shrink-0 items-center rounded-sm transition-colors',
        'focus:outline-none focus-visible:ring-2 focus-visible:ring-fg focus-visible:ring-offset-2 focus-visible:ring-offset-bg',
        'disabled:cursor-not-allowed disabled:opacity-50',
        checked ? 'bg-brand' : 'bg-bg-elev-3',
        className,
      )}
      {...rest}
    >
      <span
        aria-hidden="true"
        className={cn(
          'inline-block size-5 rounded-sm bg-brand-fg shadow-sm transition-transform duration-150',
          checked ? 'translate-x-[22px]' : 'translate-x-0.5',
        )}
      />
    </button>
  );
});
