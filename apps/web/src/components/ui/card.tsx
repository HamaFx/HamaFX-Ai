// SPDX-License-Identifier: Apache-2.0

/**
 * Shared flat card primitives for dashboard widgets and chat result surfaces.
 *
 * The shell owns the terminal surface, border, radius, spacing, and overflow
 * rules. Content-specific components remain responsible for their hierarchy.
 */

import { createElement, type HTMLAttributes, type ReactNode } from 'react';

import { cn } from '@/lib/cn';

export interface CardProps extends HTMLAttributes<HTMLElement> {
  /** Use a semantic section/article without duplicating the shell classes. */
  as?: 'div' | 'section' | 'article';
}

export function Card({ as = 'div', className, ...props }: CardProps) {
  return createElement(as, {
    ...props,
    className: cn(
      'border-border bg-bg-elev-1 flex flex-col gap-3 rounded-sm border p-4',
      className,
    ),
  });
}

interface CardSlotProps extends HTMLAttributes<HTMLDivElement> {
  children?: ReactNode;
}

export function CardHeader({ className, ...props }: CardSlotProps) {
  return <div className={cn('flex items-center justify-between gap-2', className)} {...props} />;
}

export function CardContent({ className, ...props }: CardSlotProps) {
  return <div className={cn('min-w-0', className)} {...props} />;
}

export function CardFooter({ className, ...props }: CardSlotProps) {
  return <div className={cn('mt-auto flex items-center gap-2', className)} {...props} />;
}
