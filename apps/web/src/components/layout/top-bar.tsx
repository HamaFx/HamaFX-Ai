'use client';

// Top app bar — sticky glass surface with three slots:
//   [menu] [brand mark + title] [right slot]
//
// The menu trigger opens the <NavDrawer> (replacing the previous bottom
// nav). On the chat route we render <ChatTopBar> instead, which has its
// own copy of the same trigger.

import { Menu } from 'lucide-react';
import Link from 'next/link';

import { Tooltip } from '@/components/ui/tooltip';
import { cn } from '@/lib/cn';

import { NavDrawer } from './nav-drawer';

interface TopBarProps {
  title?: string;
  /**
   * Optional right-aligned slot — pass icons/buttons that vary per page
   * (e.g. timeframe picker on /chart, thread switcher on /chat).
   */
  right?: React.ReactNode;
}

export function TopBar({ title, right }: TopBarProps) {
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
        <NavDrawer
          trigger={
            <Tooltip label="Menu" side="bottom">
              <button
                type="button"
                aria-label="Open menu"
                className="text-fg-muted hover:text-fg hover:bg-bg-elev-2 inline-flex size-11 shrink-0 items-center justify-center rounded-xl transition-colors"
              >
                <Menu className="size-5" />
              </button>
            </Tooltip>
          }
        />

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
              boxShadow: '0 0 12px -2px oklch(78% 0.16 78 / 0.4)',
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
