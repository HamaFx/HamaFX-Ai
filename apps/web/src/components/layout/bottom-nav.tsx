'use client';

// Mobile bottom navigation. Uses lucide-react for consistent stroke widths.
// Active item gets a subtle pill background; the active "indicator" tracks
// position with motion's layoutId for a seamless slide between tabs.

import { Calendar, LineChart, MessageCircle, MoreHorizontal, Newspaper } from 'lucide-react';
import { m } from 'motion/react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';

import { cn } from '@/lib/cn';

interface NavItem {
  href: string;
  label: string;
  /** Active when the current path starts with one of these prefixes. */
  match: readonly string[];
  icon: typeof MessageCircle;
}

const ITEMS: readonly NavItem[] = [
  { href: '/chat', label: 'Chat', match: ['/chat'], icon: MessageCircle },
  { href: '/chart/XAUUSD', label: 'Chart', match: ['/chart'], icon: LineChart },
  { href: '/news', label: 'News', match: ['/news'], icon: Newspaper },
  { href: '/calendar', label: 'Calendar', match: ['/calendar'], icon: Calendar },
  {
    href: '/more',
    label: 'More',
    match: ['/more', '/alerts', '/journal', '/settings'],
    icon: MoreHorizontal,
  },
];

export function BottomNav() {
  const pathname = usePathname();
  return (
    <nav
      aria-label="Primary"
      className={cn(
        'border-divider bg-bg-elev-1/95 fixed inset-x-0 bottom-0 z-40 border-t',
        'pb-[env(safe-area-inset-bottom)] backdrop-blur-md',
      )}
    >
      <ul className="mx-auto flex max-w-2xl items-stretch justify-between px-2">
        {ITEMS.map((item) => {
          const Icon = item.icon;
          const active = item.match.some((p) => pathname === p || pathname.startsWith(`${p}/`));
          return (
            <li key={item.href} className="flex-1">
              <Link
                href={item.href}
                aria-current={active ? 'page' : undefined}
                className={cn(
                  'relative flex h-16 min-w-[44px] flex-col items-center justify-center gap-1',
                  'transition-colors',
                  active ? 'text-fg' : 'text-fg-subtle hover:text-fg-muted',
                )}
              >
                <span className="relative inline-flex h-7 w-12 items-center justify-center">
                  {active ? (
                    <m.span
                      layoutId="bottom-nav-indicator"
                      className="bg-bg-elev-3 absolute inset-0 rounded-full"
                      transition={{ type: 'spring', stiffness: 380, damping: 30 }}
                    />
                  ) : null}
                  <Icon className="relative size-5" strokeWidth={1.75} />
                </span>
                <span className="text-[11px] font-medium leading-none">{item.label}</span>
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
