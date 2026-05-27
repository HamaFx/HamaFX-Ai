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
    iconBg: 'oklch(74% 0.2 152 / 0.18)',
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
    <div className="flex flex-col gap-5">
      <PageHeader title="More" />
      <nav aria-label="More" className="flex flex-col gap-2">
        {ITEMS.map((item) => {
          const Icon = item.icon;
          return (
            <Link
              key={item.href}
              href={item.href}
              className="card-premium group flex min-h-[68px] items-center gap-4 px-4 py-3.5 transition-all duration-200 active:scale-[0.99] md:hover:-translate-y-0.5 md:hover:shadow-lg"
            >
              <span
                className="text-fg inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-xl"
                style={{
                  background: item.iconBg,
                  boxShadow: 'inset 0 1px 0 0 oklch(100% 0 0 / 0.08)',
                }}
              >
                <Icon className="size-5" strokeWidth={2} />
              </span>
              <div className="min-w-0 flex-1">
                <span className="text-fg block text-sm font-semibold">{item.label}</span>
                <span className="text-fg-subtle block text-xs">{item.description}</span>
              </div>
              <ChevronRight className="text-fg-subtle size-4 shrink-0 transition-transform group-hover:translate-x-0.5" />
            </Link>
          );
        })}
      </nav>
    </div>
  );
}
