'use client';

// Floating action button. Static position, brand gradient with ambient glow.
// No scale/translate animations — just opacity hover for stability.
//
// Positioning references the --fab-bottom token defined in globals.css.
// With the bottom nav removed, that token now equals the safe-area inset
// plus a 16px breathing gap.

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
        backgroundImage: 'var(--gradient-brand)',
        boxShadow: 'var(--shadow-brand-press-strong)',
        bottom: 'var(--fab-bottom)',
      }}
      {...rest}
    >
      {children}
    </button>
  );
});
