'use client';

// Top app bar — sticky glass surface with three slots:
//   [☰ menu] [brand mark + title] [right slot]
//
// The chat route renders its own <ChatTopBar>; we hide the global TopBar
// there so we don't have two stacked headers (and so the global TopBar
// doesn't catch focus or pointer events meant for the chat surface).
//
// usePathname makes this a client component, but the cost is one
// useState read per navigation — negligible, and well worth the
// simplicity vs. a route-group restructure.

import Link from 'next/link';
import { usePathname } from 'next/navigation';

import { cn } from '@/lib/cn';

import { NavTrigger } from './nav-trigger';

interface TopBarProps {
  title?: string;
  /**
   * Optional right-aligned slot — pass icons/buttons that vary per page.
   */
  right?: React.ReactNode;
}

export function TopBar({ title, right }: TopBarProps) {
  const pathname = usePathname() ?? '';

  // Chat brings its own top bar (ChatTopBar). Returning null here is the
  // simplest way to suppress the global one without restructuring routes.
  if (pathname.startsWith('/chat')) return null;

  return (
    <header
      className={cn(
        'glass-strong sticky top-0 z-30 border-b border-divider',
        'pt-[env(safe-area-inset-top)]',
      )}
    >
      <div
        className="mx-auto flex max-w-2xl items-center gap-2 px-3"
        style={{ height: 'var(--topbar-h)' }}
      >
        <NavTrigger />

        <Link
          href="/chat"
          aria-label="HamaFX-Ai home"
          className="group flex flex-1 items-center justify-center gap-2 px-1 text-sm font-semibold tracking-tight transition-opacity hover:opacity-80"
        >
          <span
            aria-hidden="true"
            className="relative inline-flex size-7 items-center justify-center rounded-md"
            style={{
              backgroundImage: 'var(--gradient-brand)',
              boxShadow: '0 0 12px -2px oklch(82% 0.14 85 / 0.4)',
            }}
          >
            <span className="text-bg text-xs font-bold">H</span>
          </span>
          <span className="text-fg">
            {title ?? 'HamaFX'}
            <span className="text-fg-subtle font-normal">·Ai</span>
          </span>
        </Link>

        <div className="flex min-w-[44px] items-center justify-end gap-2">{right}</div>
      </div>
    </header>
  );
}
