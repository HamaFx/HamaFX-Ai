// SPDX-License-Identifier: Apache-2.0

import Image from 'next/image';
import { Link } from 'next-view-transitions';

import { cn } from '@/lib/cn';

export type KestrelBrandVariant = 'mark' | 'lockup';

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
  markSize?: 'xs' | 'sm';
  /** Hide the image from assistive technology when nearby copy names it. */
  decorative?: boolean;
  priority?: boolean;
  className?: string;
}

/**
 * Kestrel's single source of truth for product identity in the UI.
 *
 * Launcher icons stay square and compact; the transparent lockup is reserved
 * for auth, onboarding, navigation, and empty-state identity moments.
 */
export function KestrelBrand({
  variant = 'lockup',
  href,
  label = 'Kestrel',
  showName = false,
  markSize = 'sm',
  decorative = false,
  priority = false,
  className,
}: KestrelBrandProps) {
  const isDecorative = decorative && !href;
  const image = variant === 'mark' ? (
    <Image
      src="/icons/icon-192.png"
      alt={isDecorative ? '' : 'Kestrel'}
      aria-hidden={isDecorative || undefined}
      width={40}
      height={40}
      priority={priority}
      className={cn(
        'shrink-0 rounded-sm object-cover',
        markSize === 'xs' ? 'size-4' : 'size-7',
      )}
    />
  ) : (
    <Image
      src="/brand/kestrel-logo.png"
      alt={isDecorative ? '' : 'Kestrel'}
      aria-hidden={isDecorative || undefined}
      width={160}
      height={107}
      priority={priority}
      className="h-auto w-full object-contain"
    />
  );

  const content = variant === 'mark' && showName ? (
    <span className="inline-flex items-center gap-2">
      {image}
      <span className="text-fg text-sm font-semibold tracking-tight">{label}</span>
    </span>
  ) : image;

  const wrapperClassName = cn(
    'inline-flex shrink-0 items-center',
    variant === 'lockup' ? 'w-36' : undefined,
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
    <span aria-hidden={isDecorative || undefined} className={wrapperClassName}>
      {content}
    </span>
  );
}
