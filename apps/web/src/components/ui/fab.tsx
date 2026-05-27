'use client';

// Floating action button. Sits 80px above the BottomNav, respecting
// safe-area-bottom so it clears the home indicator. whileTap scale-down
// uses motion's domAnimation features (already loaded by MotionRoot).

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
      transition={{ type: 'spring', stiffness: 400, damping: 30 }}
      className={cn(
        'bg-brand text-brand-fg fixed right-4 z-40',
        'inline-flex h-14 w-14 items-center justify-center rounded-full',
        'shadow-lg shadow-black/30',
        'focus-visible:ring-brand focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-offset-bg',
        'disabled:cursor-not-allowed disabled:opacity-60',
        className,
      )}
      style={{ bottom: 'calc(80px + env(safe-area-inset-bottom))' }}
      {...rest}
    >
      {children}
    </m.button>
  );
});
