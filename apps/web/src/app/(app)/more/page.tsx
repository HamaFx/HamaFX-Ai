import type { Metadata } from 'next';
import Link from 'next/link';

import { PageHeader } from '@/components/layout/page-header';

export const metadata: Metadata = { title: 'More' };

const ITEMS: Array<{ href: string; label: string; description: string }> = [
  { href: '/alerts', label: 'Alerts', description: 'Price / indicator / candle-close triggers' },
  { href: '/journal', label: 'Journal', description: 'Trades, R-multiples, win-rate' },
  { href: '/settings', label: 'Settings', description: 'Theme, models, indicators' },
];

export default function MorePage() {
  return (
    <div className="flex flex-col gap-6">
      <PageHeader title="More" />
      <nav
        aria-label="More"
        className="border-border bg-bg-elev-1 flex flex-col divide-y divide-[var(--color-border)] rounded-lg border"
      >
        {ITEMS.map((item) => (
          <Link
            key={item.href}
            href={item.href}
            className="hover:bg-bg-elev-2 flex items-center justify-between gap-4 px-4 py-4 transition-colors"
          >
            <div className="flex flex-col">
              <span className="text-fg text-sm font-medium">{item.label}</span>
              <span className="text-fg-subtle text-xs">{item.description}</span>
            </div>
            <span aria-hidden="true" className="text-fg-subtle">
              ›
            </span>
          </Link>
        ))}
      </nav>
    </div>
  );
}
