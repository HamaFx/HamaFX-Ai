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
// Opacity + color transitions only. Spinner uses lucide's Loader2 to
// satisfy steering rule §10 ("lucide-react exclusively, no inline SVGs").
//
// Mobile-first sizes:
//   sm = 40px (h-10) — fits in dense action rows; 4px below 44pt min so
//                       only use sm where the button is in a row of icon
//                       buttons that already have ≥44pt hit areas
//   md = 48px (h-12) — default. Comfortable thumb-zone target.
//   lg = 56px (h-14) — primary CTA on landing/empty states.

import { Loader2 } from 'lucide-react';
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
  primary: 'text-brand-fg font-semibold hover:opacity-90',
  secondary: 'border border-divider bg-bg-elev-2 text-fg hover:bg-bg-elev-3',
  ghost: 'text-fg hover:bg-bg-elev-1',
  danger: 'text-bg font-semibold hover:opacity-90',
  success: 'bg-bull text-bg font-semibold hover:opacity-90',
};

const sizes: Record<Size, string> = {
  sm: 'h-10 px-4 text-sm',
  md: 'h-12 px-5 text-sm',
  lg: 'h-14 px-6 text-base',
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

  // Variant-driven inline styles — use theme tokens (gradients/shadows
  // defined in globals.css :root) so a future theme change touches one
  // file, not every Button instance.
  const inlineStyle: React.CSSProperties = (() => {
    if (variant === 'primary') {
      return {
        backgroundImage: 'var(--gradient-brand)',
        boxShadow: 'var(--shadow-brand-press)',
        ...style,
      };
    }
    if (variant === 'danger') {
      return {
        backgroundImage: 'var(--gradient-danger)',
        boxShadow: 'var(--shadow-danger-press)',
        ...style,
      };
    }
    return style ?? {};
  })();

  return (
    <button
      ref={ref}
      type={type}
      disabled={isDisabled}
      style={inlineStyle}
      className={cn(
        'inline-flex items-center justify-center gap-2 rounded-xl font-medium',
        'transition-[background,opacity,color] duration-150',
        'disabled:cursor-not-allowed disabled:opacity-60 disabled:shadow-none',
        variants[variant],
        sizes[size],
        className,
      )}
      {...rest}
    >
      {loading ? <Loader2 className="size-4 animate-spin" aria-hidden="true" /> : null}
      {children}
    </button>
  );
});
