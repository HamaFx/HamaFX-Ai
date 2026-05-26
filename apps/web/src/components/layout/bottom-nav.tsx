'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

import { cn } from '@/lib/cn';

interface NavItem {
  href: string;
  label: string;
  /** Active when the current path starts with one of these prefixes. */
  match: readonly string[];
  icon: React.ReactNode;
}

// Lightweight inline SVGs — keep deps minimal at scaffold time. Swap to
// `lucide-react` when we wire the proper icon set in a later phase.
const Icon = {
  Chat: () => (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.75"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="size-5"
      aria-hidden="true"
    >
      <path d="M21 12a8 8 0 0 1-11.7 7.1L3 21l1.9-6.3A8 8 0 1 1 21 12Z" />
    </svg>
  ),
  Chart: () => (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.75"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="size-5"
      aria-hidden="true"
    >
      <path d="M3 3v18h18" />
      <path d="m7 14 3-3 4 4 6-7" />
    </svg>
  ),
  News: () => (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.75"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="size-5"
      aria-hidden="true"
    >
      <path d="M4 5h13a2 2 0 0 1 2 2v11a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V5Z" />
      <path d="M19 8h2v9a2 2 0 0 1-2 2" />
      <path d="M8 9h7M8 13h7M8 17h4" />
    </svg>
  ),
  Calendar: () => (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.75"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="size-5"
      aria-hidden="true"
    >
      <rect x="3" y="5" width="18" height="16" rx="2" />
      <path d="M3 10h18M8 3v4M16 3v4" />
    </svg>
  ),
  More: () => (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.75"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="size-5"
      aria-hidden="true"
    >
      <circle cx="5" cy="12" r="1.5" />
      <circle cx="12" cy="12" r="1.5" />
      <circle cx="19" cy="12" r="1.5" />
    </svg>
  ),
};

const ITEMS: readonly NavItem[] = [
  { href: '/chat', label: 'Chat', match: ['/chat'], icon: <Icon.Chat /> },
  { href: '/chart/XAUUSD', label: 'Chart', match: ['/chart'], icon: <Icon.Chart /> },
  { href: '/news', label: 'News', match: ['/news'], icon: <Icon.News /> },
  { href: '/calendar', label: 'Calendar', match: ['/calendar'], icon: <Icon.Calendar /> },
  {
    href: '/more',
    label: 'More',
    match: ['/more', '/alerts', '/journal', '/settings'],
    icon: <Icon.More />,
  },
];

export function BottomNav() {
  const pathname = usePathname();
  return (
    <nav
      aria-label="Primary"
      className={cn(
        'border-border bg-bg-elev-1 fixed inset-x-0 bottom-0 z-40 border-t',
        'pb-[env(safe-area-inset-bottom)]',
      )}
    >
      <ul className="mx-auto flex max-w-2xl items-stretch justify-between px-2">
        {ITEMS.map((item) => {
          const active = item.match.some((p) => pathname === p || pathname.startsWith(`${p}/`));
          return (
            <li key={item.href} className="flex-1">
              <Link
                href={item.href}
                aria-current={active ? 'page' : undefined}
                className={cn(
                  'flex h-16 min-w-[44px] flex-col items-center justify-center gap-1',
                  'transition-colors',
                  active ? 'text-fg' : 'text-fg-subtle hover:text-fg-muted',
                )}
              >
                <span
                  className={cn('rounded-full p-1.5', active ? 'bg-bg-elev-2' : 'bg-transparent')}
                >
                  {item.icon}
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
