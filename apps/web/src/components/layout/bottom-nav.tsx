'use client';

// Glass bottom navigation — floating pill that respects the safe area.
// Active item gets a brand-soft pill + sliding `motion.div layoutId`
// indicator behind it.
//
// Mobile-first dimensions on the 8-pt grid:
//   - bar inner padding: px-2 py-2  (8/8)
//   - item height:       56         (multiple of 8, clears Apple's 44pt min
//                                    tap target with breathing room for label)
//   - icon size:         24 (size-6) — Material navigation standard
//   - indicator pill:    32×56 (4×7) so it spans more of the column
//
// Height token: --bottom-nav-h in globals.css. Keep this component's
// rendered height in sync with that token.

import { Calendar, LineChart, MessageCircle, MoreHorizontal, Newspaper } from 'lucide-react';
import { m } from 'motion/react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';

import { cn } from '@/lib/cn';

interface NavItem {
  href: string;
  label: string;
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
      className="fixed inset-x-0 bottom-0 z-40 flex justify-center px-3 pt-2"
      style={{ paddingBottom: 'max(env(safe-area-inset-bottom), 12px)' }}
    >
      <div className="glass-strong w-full max-w-2xl rounded-2xl">
        <ul className="flex items-stretch justify-between gap-1 p-2">
          {ITEMS.map((item) => {
            const Icon = item.icon;
            const active = item.match.some((p) => pathname === p || pathname.startsWith(`${p}/`));
            return (
              <li key={item.href} className="flex-1">
                <Link
                  href={item.href}
                  aria-current={active ? 'page' : undefined}
                  className={cn(
                    'group relative flex h-14 min-w-[44px] flex-col items-center justify-center gap-1',
                    'rounded-xl transition-colors duration-200',
                    active ? 'text-fg' : 'text-fg-subtle hover:text-fg-muted',
                  )}
                >
                  {active ? (
                    <m.span
                      layoutId="bottom-nav-indicator"
                      aria-hidden="true"
                      className="absolute inset-0 rounded-xl"
                      style={{
                        backgroundImage: 'var(--gradient-brand-soft)',
                        boxShadow:
                          'inset 0 1px 0 0 oklch(100% 0 0 / 0.1), 0 0 24px -2px oklch(78% 0.16 78 / 0.4)',
                      }}
                      transition={{ type: 'spring', stiffness: 380, damping: 30 }}
                    />
                  ) : null}
                  <Icon
                    className="relative size-6"
                    strokeWidth={active ? 2 : 1.75}
                    aria-hidden="true"
                  />
                  <span
                    className={cn(
                      'relative text-[10px] font-medium leading-none transition-opacity',
                      active ? 'opacity-100' : 'opacity-70',
                    )}
                  >
                    {item.label}
                  </span>
                </Link>
              </li>
            );
          })}
        </ul>
      </div>
    </nav>
  );
}
