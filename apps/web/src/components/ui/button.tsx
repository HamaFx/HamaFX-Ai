// Static button — no scale/whileTap that can cause layout shift.
// Opacity + color transitions only.

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
  primary:
    'text-brand-fg font-semibold ' +
    '[background:linear-gradient(135deg,oklch(80%_0.16_78)_0%,oklch(74%_0.18_60)_100%)] ' +
    'shadow-[0_8px_24px_-6px_oklch(78%_0.16_78/0.5),inset_0_1px_0_0_oklch(100%_0_0/0.15)] ' +
    'hover:opacity-90',
  secondary: 'glass-subtle text-fg hover:bg-bg-elev-2',
  ghost: 'text-fg hover:bg-bg-elev-1',
  danger:
    'text-bg font-semibold ' +
    '[background:linear-gradient(135deg,oklch(70%_0.24_25)_0%,oklch(64%_0.24_15)_100%)] ' +
    'shadow-[0_8px_24px_-6px_oklch(68%_0.24_25/0.5),inset_0_1px_0_0_oklch(100%_0_0/0.15)] ' +
    'hover:opacity-90',
};

const sizes: Record<Size, string> = {
  sm: 'h-9 px-3.5 text-sm',
  md: 'h-11 px-5 text-sm',
  lg: 'h-12 px-6 text-base',
};

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { className, variant = 'primary', size = 'md', loading, disabled, children, type = 'button', ...rest },
  ref,
) {
  const isDisabled = disabled || loading || false;
  return (
    <button
      ref={ref}
      type={type}
      disabled={isDisabled}
      className={cn(
        'inline-flex items-center justify-center gap-1.5 rounded-xl font-medium',
        'transition-[background,opacity,color] duration-150',
        'disabled:cursor-not-allowed disabled:opacity-60 disabled:shadow-none',
        variants[variant],
        sizes[size],
        className,
      )}
      {...rest}
    >
      {loading ? <Spinner /> : null}
      {children}
    </button>
  );
});

function Spinner() {
  return (
    <svg
      aria-hidden="true"
      className="size-4 animate-spin"
      viewBox="0 0 24 24"
      fill="none"
    >
      <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" opacity="0.25" />
      <path
        d="M22 12a10 10 0 0 1-10 10"
        stroke="currentColor"
        strokeWidth="3"
        strokeLinecap="round"
      />
    </svg>
  );
}
