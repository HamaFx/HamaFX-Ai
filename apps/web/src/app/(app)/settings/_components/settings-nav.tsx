'use client';

import { usePathname } from 'next/navigation';
import { ArrowLeft, ChevronRight } from 'lucide-react';
import { Link } from 'next-view-transitions';
import { User, Key, List, Activity, Settings, Brain, Bot, Target, Wallet, MessageCircle, CreditCard } from 'lucide-react';
import { cn } from '@/lib/cn';

const NAV_ITEMS = [
  { href: '/settings', label: 'General', icon: Settings, exact: true },
  { href: '/settings/profile', label: 'Profile', icon: User },
  { href: '/settings/api-keys', label: 'API Keys', icon: Key },
  { href: '/settings/models', label: 'Models', icon: Brain },
  { href: '/settings/agent', label: 'Agent', icon: Bot },
  { href: '/settings/symbols', label: 'Symbols', icon: List },
  { href: '/settings/usage', label: 'Usage', icon: Activity },
  { href: '/settings/track-record', label: 'Track Record', icon: Target },
  { href: '/settings/portfolio', label: 'Portfolio', icon: Wallet },
  { href: '/settings/telegram', label: 'Telegram', icon: MessageCircle },
  { href: '/settings/billing', label: 'Billing', icon: CreditCard },
];

export function SettingsNav() {
  const pathname = usePathname();
  const isSubPage = pathname !== '/settings';

  const currentItem = NAV_ITEMS.find((item) =>
    item.exact ? pathname === item.href : pathname?.startsWith(item.href),
  );

  return (
    <>
      {isSubPage && (
        <nav aria-label="Breadcrumb" className="flex items-center gap-1.5 text-sm text-fg-subtle">
          <Link
            href="/settings"
            className="inline-flex items-center gap-1.5 hover:text-fg transition-colors shrink-0"
          >
            <ArrowLeft className="size-3.5" />
            Settings
          </Link>
          {currentItem && (
            <>
              <ChevronRight className="size-3.5 shrink-0" aria-hidden />
              <span className="text-fg font-medium truncate" aria-current="page">
                {currentItem.label}
              </span>
            </>
          )}
        </nav>
      )}

      <aside className="md:w-56 shrink-0">
        <nav aria-label="Settings" className="flex flex-row md:flex-col gap-1 overflow-x-auto snap-x pb-2 md:pb-0">
          {NAV_ITEMS.map((item) => {
            const active = item.exact
              ? pathname === item.href
              : pathname?.startsWith(item.href);

            const Icon = item.icon;

            return (
                <Link
                  key={item.href}
                  href={item.href}
                  aria-current={active ? 'page' : undefined}
                  className={cn(
                    'flex items-center gap-3 rounded-sm px-3 py-2 text-sm font-medium transition-colors whitespace-nowrap snap-start',
                    active
                      ? 'bg-zinc-900 text-fg'
                      : 'text-fg-subtle hover:bg-surface-elevated hover:text-fg'
                  )}
                >
                <Icon className="size-4" />
                {item.label}
              </Link>
            );
          })}
        </nav>
      </aside>
    </>
  );
}
