// SPDX-License-Identifier: Apache-2.0

import { forwardRef, type InputHTMLAttributes } from 'react';

import { cn } from '@/lib/cn';

export interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  error?: boolean;
}

// Mobile-first: h-12 (48px) — comfortably above the 44pt minimum so the
// input is unmistakably tappable. text-base (16px) prevents iOS Safari's
// auto-zoom on focus, which fires whenever an input renders smaller than
// 16px and is one of the worst mobile UX bugs we used to ship.
export const Input = forwardRef<HTMLInputElement, InputProps>(function Input(
  { className, error, ...rest },
  ref,
) {
  return (
    <input
      ref={ref}
      aria-invalid={error ? 'true' : undefined}
      className={cn(
        'bg-bg-elev-1/60 text-fg placeholder:text-fg-subtle',
        'h-12 w-full rounded-sm border px-4 text-base',
        error
          ? 'border-danger/60 focus:ring-2 focus:ring-danger/30 focus-visible:outline-none'
          : 'border-border',
        'transition-all duration-150 ease-in-out',
        'focus:bg-bg-elev-1/80',
        'disabled:cursor-not-allowed disabled:opacity-60',
        className,
      )}
      {...rest}
    />
  );
});
