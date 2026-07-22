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

// Static button — no scale/whileTap that can cause layout shift.
// Opacity + color transitions only. Spinner uses lucide's IconLoader2 to
// satisfy steering rule §10 ("@tabler/icons-react exclusively, no inline SVGs").
//
// Mobile-first sizes:
//   sm = 40px (h-10) — fits in dense action rows; 4px below 44pt min so
//                       only use sm where the button is in a row of icon
//                       buttons that already have ≥44pt hit areas
//   md = 48px (h-12) — default. Comfortable thumb-zone target.
//   lg = 56px (h-14) — primary CTA on landing/empty states.

import { IconLoader2 } from '@tabler/icons-react';
import { forwardRef, type ButtonHTMLAttributes } from 'react';

import { cn } from '@/lib/cn';

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'success';
type Size = 'sm' | 'md' | 'lg';

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
  loading?: boolean;
}

// Primary/danger get their fills via inlineStyle below (theme tokens).
const variants: Record<Variant, string> = {
  primary: 'bg-brand text-brand-fg font-semibold hover:bg-brand/90 border border-brand-border',
  secondary: 'border border-border bg-bg-elev-1 text-fg hover:bg-bg-elev-2',
  ghost: 'text-fg-muted hover:text-fg hover:bg-bg-elev-1',
  danger: 'bg-danger text-white font-semibold hover:bg-danger/90',
  success: 'bg-success text-black font-semibold hover:bg-success/90',
};

const sizes: Record<Size, string> = {
  sm: 'h-10 px-3 text-sm rounded-sm',     // 40px
  md: 'h-12 px-4 text-sm rounded-sm',     // 48px (comfortable thumb hit area)
  lg: 'h-14 px-5 text-base rounded-sm',   // 56px (prominent CTA)
};

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  {
    className,
    variant = 'primary',
    size = 'md',
    loading,
    disabled,
    children,
    type = 'button',
    style,
    ...rest
  },
  ref,
) {
  const isDisabled = disabled || loading || false;

  // Variant-driven inline styles removed — flat surfaces only.
  const inlineStyle: React.CSSProperties = style ?? {};

  return (
    <button
      ref={ref}
      type={type}
      disabled={isDisabled}
      aria-busy={loading || false}
      style={inlineStyle}
      className={cn(
        'inline-flex items-center justify-center gap-2 rounded-sm font-medium',
        'transition-colors duration-150',
        'focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-brand focus:outline-none',
        'disabled:cursor-not-allowed disabled:opacity-60 disabled:shadow-none',
        variants[variant],
        sizes[size],
        className,
      )}
      {...rest}
    >
      {loading ? <IconLoader2 className="size-4 animate-spin" aria-hidden="true" /> : null}
      {children}
    </button>
  );
});
