import { Bell, BookOpen, ChevronRight, Cog } from 'lucide-react';
import type { Metadata } from 'next';
import Link from 'next/link';

import { PageHeader } from '@/components/layout/page-header';

export const metadata: Metadata = { title: 'More' };

const ITEMS: Array<{
  href: string;
  label: string;
  description: string;
  icon: typeof Bell;
}> = [
  {
    href: '/alerts',
    label: 'Alerts',
    description: 'Price / indicator / candle-close triggers',
    icon: Bell,
  },
  {
    href: '/journal',
    label: 'Journal',
    description: 'Trades, R-multiples, win-rate',
    icon: BookOpen,
  },
  {
    href: '/settings',
    label: 'Settings',
    description: 'Notifications, usage, session',
    icon: Cog,
  },
];

export default function MorePage() {
  return (
    <div className="flex flex-col gap-6">
      <PageHeader title="More" />
      <nav
        aria-label="More"
        className="border-divider bg-bg-elev-1 flex flex-col divide-y divide-divider rounded-lg border"
      >
        {ITEMS.map((item) => {
          const Icon = item.icon;
          return (
            <Link
              key={item.href}
              href={item.href}
              className="hover:bg-bg-elev-2 flex min-h-[60px] items-center gap-3 px-4 py-3.5 transition-colors"
            >
              <span className="bg-bg-elev-2 text-fg-muted inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg">
                <Icon className="size-4" />
              </span>
              <div className="min-w-0 flex-1">
                <span className="text-fg block text-sm font-medium">{item.label}</span>
                <span className="text-fg-subtle block text-xs">{item.description}</span>
              </div>
              <ChevronRight className="text-fg-subtle size-4 shrink-0" />
            </Link>
          );
        })}
      </nav>
    </div>
  );
}
