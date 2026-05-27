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
        'border-divider bg-bg-elev-1/85 sticky top-0 z-30 border-b',
        'pt-[env(safe-area-inset-top)] backdrop-blur-md',
        'supports-[backdrop-filter]:bg-bg-elev-1/70',
      )}
    >
      <div className="mx-auto flex h-12 max-w-2xl items-center justify-between gap-3 px-4">
        <Link
          href="/chat"
          className="text-fg text-sm font-semibold tracking-tight transition-opacity hover:opacity-80"
        >
          {title ?? 'HamaFX-Ai'}
        </Link>
        <div className="flex items-center gap-2">{right}</div>
      </div>
    </header>
  );
}
