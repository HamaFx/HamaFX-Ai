'use client';

// Premium floating action button. Brand gradient surface, ambient glow,
// satisfying spring-back on tap. Sits above the BottomNav with safe-area
// clearance for the iPhone home indicator.

import { m } from 'motion/react';
import { forwardRef, type ComponentProps } from 'react';

import { cn } from '@/lib/cn';

type Props = Omit<ComponentProps<typeof m.button>, 'ref'>;

export const Fab = forwardRef<HTMLButtonElement, Props>(function Fab(
  { className, children, ...rest },
  ref,
) {
  return (
    <m.button
      ref={ref}
      whileTap={{ scale: 0.92 }}
      whileHover={{ scale: 1.05 }}
      transition={{ type: 'spring', stiffness: 400, damping: 25 }}
      className={cn(
        'fixed right-4 z-40 inline-flex h-14 w-14 items-center justify-center rounded-full',
        'text-brand-fg font-semibold',
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
    </m.button>
  );
});
