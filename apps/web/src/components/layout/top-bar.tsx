import Link from 'next/link';

import { cn } from '@/lib/cn';

interface TopBarProps {
  title?: string;
  /**
   * Optional right-aligned slot — pass icons/buttons that vary per page
   * (e.g. timeframe picker on /chart, thread switcher on /chat).
   */
  right?: React.ReactNode;
}

export function TopBar({ title, right }: TopBarProps) {
  return (
    <header
      className={cn(
        'glass-subtle sticky top-0 z-30 border-b border-divider',
        'pt-[env(safe-area-inset-top)]',
      )}
    >
      <div className="mx-auto flex h-12 max-w-2xl items-center justify-between gap-3 px-4">
        <Link
          href="/chat"
          className="group flex items-center gap-2 text-sm font-semibold tracking-tight transition-opacity hover:opacity-80"
        >
          <span
            aria-hidden="true"
            className="relative inline-flex h-6 w-6 items-center justify-center rounded-md transition-transform group-hover:scale-110"
            style={{
              background:
                'linear-gradient(135deg, oklch(78% 0.16 78 / 1) 0%, oklch(72% 0.18 295 / 1) 100%)',
              boxShadow: '0 0 12px -2px oklch(78% 0.16 78 / 0.4)',
            }}
          >
            <span className="text-[11px] font-bold text-bg">H</span>
          </span>
          <span className="text-fg">
            {title ?? 'HamaFX'}
            <span className="text-fg-subtle font-normal">·Ai</span>
          </span>
        </Link>
        <div className="flex items-center gap-2">{right}</div>
      </div>
    </header>
  );
}
