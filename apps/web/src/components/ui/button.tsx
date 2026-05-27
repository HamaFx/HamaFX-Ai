'use client';

// Tap-responsive button. The whileTap scale-down comes from motion's
// domAnimation features (already loaded by MotionRoot). Variants and sizes
// match the original Tailwind-only button — visual API is stable.

import { m } from 'motion/react';
import { forwardRef, type ButtonHTMLAttributes } from 'react';

import { cn } from '@/lib/cn';

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger';
type Size = 'sm' | 'md' | 'lg';

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
  loading?: boolean;
}

const variants: Record<Variant, string> = {
  primary: 'bg-brand text-brand-fg hover:opacity-90',
  secondary: 'bg-bg-elev-2 text-fg hover:bg-bg-elev-1 border border-border',
  ghost: 'text-fg hover:bg-bg-elev-1',
  danger: 'bg-bear text-bg hover:opacity-90',
};

const sizes: Record<Size, string> = {
  sm: 'h-9 px-3 text-sm',
  md: 'h-11 px-4 text-sm',
  lg: 'h-12 px-5 text-base',
};

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { className, variant = 'primary', size = 'md', loading, disabled, children, type = 'button', ...rest },
  ref,
) {
  const isDisabled = disabled || loading || false;
  // Strip undefined entries — motion's HTMLMotionProps rejects exactOptionalPropertyTypes mismatches.
  const cleanRest: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(rest)) {
    if (v !== undefined) cleanRest[k] = v;
  }
  const motionProps: Record<string, unknown> = {
    ref,
    type,
    disabled: isDisabled,
    transition: { type: 'spring', stiffness: 400, damping: 30 },
    className: cn(
      'inline-flex items-center justify-center gap-2 rounded-md font-medium',
      'transition-[background,opacity,transform] duration-150',
      'disabled:cursor-not-allowed disabled:opacity-60',
      variants[variant],
      sizes[size],
      className,
    ),
    ...cleanRest,
  };
  if (!isDisabled) motionProps.whileTap = { scale: 0.97 };
  return (
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    <m.button {...(motionProps as any)}>
      {loading ? <span aria-hidden="true">…</span> : null}
      {children}
    </m.button>
  );
});
