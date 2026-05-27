import { forwardRef, type InputHTMLAttributes } from 'react';

import { cn } from '@/lib/cn';

export type InputProps = InputHTMLAttributes<HTMLInputElement>;

// Mobile-first: h-12 (48px) — comfortably above the 44pt minimum so the
// input is unmistakably tappable. text-base (16px) prevents iOS Safari's
// auto-zoom on focus, which fires whenever an input renders smaller than
// 16px and is one of the worst mobile UX bugs we used to ship.
export const Input = forwardRef<HTMLInputElement, InputProps>(function Input(
  { className, ...rest },
  ref,
) {
  return (
    <input
      ref={ref}
      className={cn(
        'bg-bg-elev-1/60 text-fg placeholder:text-fg-subtle',
        'h-12 w-full rounded-xl border border-divider px-4 text-base',
        'backdrop-blur-sm',
        'transition-all duration-200',
        'focus:border-brand/60 focus:bg-bg-elev-1/80 focus:shadow-[0_0_0_3px_oklch(78%_0.16_78/0.12)]',
        'focus-visible:outline-none',
        'disabled:cursor-not-allowed disabled:opacity-60',
        className,
      )}
      {...rest}
    />
  );
});
