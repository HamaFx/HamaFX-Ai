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
  iconBg: string;
}> = [
  {
    href: '/alerts',
    label: 'Alerts',
    description: 'Price / indicator / candle-close triggers',
    icon: Bell,
    iconBg: 'oklch(78% 0.16 78 / 0.18)',
  },
  {
    href: '/journal',
    label: 'Journal',
    description: 'Trades, R-multiples, win-rate',
    icon: BookOpen,
    iconBg: 'oklch(72% 0.2 152 / 0.18)',
  },
  {
    href: '/settings',
    label: 'Settings',
    description: 'Notifications, usage, session',
    icon: Cog,
    iconBg: 'oklch(72% 0.18 295 / 0.18)',
  },
];

export default function MorePage() {
  return (
    <div className="flex flex-col gap-6">
      <PageHeader title="More" />
      <nav aria-label="More" className="flex flex-col gap-3">
        {ITEMS.map((item) => {
          const Icon = item.icon;
          return (
            <Link
              key={item.href}
              href={item.href}
              className="card-premium group flex min-h-[72px] items-center gap-4 p-4 transition-colors duration-200 md:hover:bg-bg-elev-2/40"
            >
              <span
                aria-hidden="true"
                className="text-fg inline-flex size-12 shrink-0 items-center justify-center rounded-2xl"
                style={{
                  background: item.iconBg,
                  boxShadow: 'var(--shadow-inset-edge-soft)',
                }}
              >
                <Icon className="size-6" strokeWidth={2} />
              </span>
              <div className="min-w-0 flex-1">
                <span className="text-fg block text-base font-semibold">{item.label}</span>
                <span className="text-fg-muted block text-xs">{item.description}</span>
              </div>
              <ChevronRight className="text-fg-subtle size-5 shrink-0" aria-hidden="true" />
            </Link>
          );
        })}
      </nav>
    </div>
  );
}
