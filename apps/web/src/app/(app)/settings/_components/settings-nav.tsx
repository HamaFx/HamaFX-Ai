'use client';

import { usePathname } from 'next/navigation';
import {IconArrowLeft, IconChevronRight} from '@tabler/icons-react';
import { Link } from 'next-view-transitions';
import {IconUser, IconKey, IconList, IconActivity, IconSettings, IconCpu, IconRobot, IconTarget, IconWallet, IconMessageCircle, IconCreditCard} from '@tabler/icons-react';
import { cn } from '@/lib/cn';

const NAV_ITEMS = [
  { href: '/settings', label: 'General', icon: IconSettings, exact: true },
  { href: '/settings/profile', label: 'Profile', icon: IconUser },
  { href: '/settings/api-keys', label: 'API Keys', icon: IconKey },
  { href: '/settings/models', label: 'Models', icon: IconCpu },
  { href: '/settings/agent', label: 'Agent', icon: IconRobot },
  { href: '/settings/symbols', label: 'Symbols', icon: IconList },
  { href: '/settings/usage', label: 'Usage', icon: IconActivity },
  { href: '/settings/track-record', label: 'Track Record', icon: IconTarget },
  { href: '/settings/portfolio', label: 'Portfolio', icon: IconWallet },
  { href: '/settings/telegram', label: 'Telegram', icon: IconMessageCircle },
  { href: '/settings/billing', label: 'Billing', icon: IconCreditCard },
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
            <IconArrowLeft className="size-3.5" />Settings</Link>
          {currentItem && (
            <>
              <IconChevronRight className="size-3.5 shrink-0" aria-hidden />
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
                      ? 'bg-brand/8 ring-1 ring-brand/22 text-brand'
                      : 'text-fg-subtle hover:bg-bg-elev-2 hover:text-fg'
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
