// SPDX-License-Identifier: Apache-2.0

import Image from 'next/image';
import { Link } from 'next-view-transitions';

import { cn } from '@/lib/cn';

export type KestrelBrandVariant = 'mark' | 'lockup' | 'svg-lockup' | 'svg-mark';

interface KestrelBrandProps {
  /** The square mark is for compact chrome; the lockup is for identity moments. */
  variant?: KestrelBrandVariant;
  /** Render the brand as a home link. */
  href?: string;
  /** Label used by the compact mark+name treatment. */
  label?: string;
  /** Add the product name beside the square mark. */
  showName?: boolean;
  /** Size the mark for compact chrome or tiny assistant identity slots. */
  markSize?: 'xs' | 'sm' | 'md' | 'lg';
  /** Hide the image from assistive technology when nearby copy names it. */
  decorative?: boolean;
  priority?: boolean;
  className?: string;
}

/**
 * High-precision vector SVG Kestrel mark.
 * Stylized geometric kestrel falcon wings with terminal precision.
 */
export function KestrelVectorMark({ size = 28, className }: { size?: number; className?: string }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 32 32"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={cn('shrink-0 select-none', className)}
      aria-hidden="true"
    >
      <rect width="32" height="32" rx="3" fill="#141414" stroke="#262626" strokeWidth="1" />
      {/* Outer wing left */}
      <path
        d="M6 10L16 16L11 23L6 10Z"
        fill="url(#kestrel-grad-1)"
        opacity="0.9"
      />
      {/* Outer wing right */}
      <path
        d="M26 10L16 16L21 23L26 10Z"
        fill="url(#kestrel-grad-2)"
        opacity="0.9"
      />
      {/* Central kestrel beacon / head */}
      <path
        d="M16 7L19.5 13.5L16 19L12.5 13.5L16 7Z"
        fill="#F56E0F"
      />
      {/* Tail fin */}
      <path
        d="M16 19L18 25H14L16 19Z"
        fill="#FF9A4D"
        opacity="0.8"
      />
      <defs>
        <linearGradient id="kestrel-grad-1" x1="6" y1="10" x2="16" y2="23" gradientUnits="userSpaceOnUse">
          <stop stopColor="#F56E0F" />
          <stop offset="1" stopColor="#7A3608" />
        </linearGradient>
        <linearGradient id="kestrel-grad-2" x1="26" y1="10" x2="16" y2="23" gradientUnits="userSpaceOnUse">
          <stop stopColor="#FF9A4D" />
          <stop offset="1" stopColor="#A8450A" />
        </linearGradient>
      </defs>
    </svg>
  );
}

/**
 * Kestrel's single source of truth for product identity in the UI.
 *
 * Provides vector SVG rendering for pixel-crisp display across all DPI scales.
 */
export function KestrelBrand({
  variant = 'mark',
  href,
  label = 'Kestrel',
  showName = false,
  markSize = 'sm',
  decorative = false,
  priority = false,
  className,
}: KestrelBrandProps) {
  const isDecorative = decorative && !href;
  
  const sizePx = markSize === 'xs' ? 18 : markSize === 'sm' ? 28 : markSize === 'md' ? 36 : 48;

  let content: React.ReactNode;

  if (variant === 'mark') {
    content = (
      <span className="inline-flex items-center gap-2">
        <KestrelVectorMark size={sizePx} />
        {showName && (
          <span className="text-fg text-sm font-semibold tracking-tight font-sans">
            {label}
          </span>
        )}
      </span>
    );
  } else {
    // Lockup
    content = (
      <div className="inline-flex items-center gap-3">
        <KestrelVectorMark size={36} />
        <div className="flex flex-col text-left leading-tight">
          <span className="text-fg font-bold tracking-wider text-base font-sans">
            KESTREL
          </span>
          <span className="text-brand font-mono text-[9px] font-semibold tracking-widest uppercase opacity-90">
            AI Market Intelligence
          </span>
        </div>
      </div>
    );
  }

  const wrapperClassName = cn(
    'inline-flex shrink-0 items-center transition-opacity hover:opacity-90',
    className,
  );

  if (href) {
    return (
      <Link
        href={href}
        aria-label="Kestrel home"
        className={wrapperClassName}
      >
        {content}
      </Link>
    );
  }

  return (
    <span
      aria-hidden={isDecorative || undefined}
      data-brand-variant={variant}
      className={wrapperClassName}
    >
      {content}
    </span>
  );
}
