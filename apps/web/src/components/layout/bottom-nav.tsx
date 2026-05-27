'use client';

// Glass bottom navigation — floating pill that respects the safe area.
// Active item gets a brand glow + sliding `motion.div layoutId` indicator.
// The whole bar uses backdrop-blur with a gradient border highlight for
// the premium glassmorphism feel.

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
      className="fixed inset-x-0 bottom-0 z-40 flex justify-center pb-[max(env(safe-area-inset-bottom),12px)] px-3 pt-2"
    >
      <div className="glass-strong w-full max-w-2xl rounded-2xl">
        <ul className="flex items-stretch justify-between px-2 py-1.5">
          {ITEMS.map((item) => {
            const Icon = item.icon;
            const active = item.match.some((p) => pathname === p || pathname.startsWith(`${p}/`));
            return (
              <li key={item.href} className="flex-1">
                <Link
                  href={item.href}
                  aria-current={active ? 'page' : undefined}
                  className={cn(
                    'group relative flex h-14 min-w-[44px] flex-col items-center justify-center gap-0.5',
                    'transition-colors duration-200',
                    active ? 'text-fg' : 'text-fg-subtle hover:text-fg-muted',
                  )}
                >
                  <span className="relative inline-flex h-9 w-14 items-center justify-center">
                    {active ? (
                      <m.span
                        layoutId="bottom-nav-indicator"
                        className="absolute inset-0 rounded-full"
                        style={{
                          background:
                            'linear-gradient(135deg, oklch(78% 0.16 78 / 0.18), oklch(72% 0.18 295 / 0.18))',
                          boxShadow:
                            'inset 0 1px 0 0 oklch(100% 0 0 / 0.1), 0 0 24px -2px oklch(78% 0.16 78 / 0.4)',
                        }}
                        transition={{ type: 'spring', stiffness: 380, damping: 30 }}
                      />
                    ) : null}
                    <Icon
                      className={cn(
                        'relative size-[22px] transition-transform duration-200',
                        active ? 'scale-110' : 'group-active:scale-90',
                      )}
                      strokeWidth={active ? 2 : 1.75}
                    />
                  </span>
                  <span
                    className={cn(
                      'text-[10px] font-medium leading-none transition-opacity',
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
