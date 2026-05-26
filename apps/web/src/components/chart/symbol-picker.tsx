'use client';

// Three-segment switch for the supported symbols. Driven by the route, not
// state — clicking navigates so the URL stays the source of truth.
import { SYMBOLS, type Symbol } from '@hamafx/shared';
import Link from 'next/link';

import { useTimeframe } from '@/hooks/use-tf';
import { cn } from '@/lib/cn';

export function SymbolPicker({ active }: { active: Symbol }) {
  // Preserve `?tf=` when navigating between symbols.
  const [tf] = useTimeframe();
  return (
    <div
      role="tablist"
      aria-label="Symbol"
      className="border-border bg-bg-elev-1 inline-flex items-center gap-1 rounded-md border p-1"
    >
      {SYMBOLS.map((s) => {
        const isActive = s === active;
        return (
          <Link
            key={s}
            role="tab"
            aria-selected={isActive}
            href={`/chart/${s}?tf=${tf}`}
            className={cn(
              'rounded px-3 py-1.5 text-xs font-semibold tabular-nums transition-colors',
              isActive ? 'bg-bg-elev-2 text-fg' : 'text-fg-muted hover:bg-bg-elev-2 hover:text-fg',
            )}
          >
            {s}
          </Link>
        );
      })}
    </div>
  );
}
