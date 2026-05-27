'use client';

// Floating action button. Static position, brand gradient with ambient glow.
// No scale/translate animations — just opacity hover for stability.

import { forwardRef, type ButtonHTMLAttributes } from 'react';

import { cn } from '@/lib/cn';

type Props = ButtonHTMLAttributes<HTMLButtonElement>;

export const Fab = forwardRef<HTMLButtonElement, Props>(function Fab(
  { className, children, type = 'button', ...rest },
  ref,
) {
  return (
    <button
      ref={ref}
      type={type}
      className={cn(
        'fixed right-4 z-40 inline-flex h-14 w-14 items-center justify-center rounded-full',
        'text-brand-fg font-semibold transition-opacity duration-150',
        'hover:opacity-90',
        'focus-visible:ring-brand focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-offset-bg',
        'disabled:cursor-not-allowed disabled:opacity-60',
        className,
      )}
      style={{
        background:
          'linear-gradient(135deg, oklch(80% 0.16 78) 0%, oklch(74% 0.18 60) 100%)',
        boxShadow:
          '0 12px 32px -8px oklch(78% 0.16 78 / 0.55), 0 0 0 1px oklch(78% 0.16 78 / 0.3), inset 0 1px 0 0 oklch(100% 0 0 / 0.2)',
        bottom: 'calc(96px + env(safe-area-inset-bottom))',
      }}
      {...rest}
    >
      {children}
    </button>
  );
});
