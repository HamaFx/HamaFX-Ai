'use client';

// Three-segment switch for the supported symbols. The active segment uses
// motion's layoutId so the highlight slides between symbols.

import { SYMBOLS, type Symbol } from '@hamafx/shared';
import { m } from 'motion/react';
import Link from 'next/link';

import { useTimeframe } from '@/hooks/use-tf';
import { cn } from '@/lib/cn';

export function SymbolPicker({ active }: { active: Symbol }) {
  const [tf] = useTimeframe();
  return (
    <div
      role="tablist"
      aria-label="Symbol"
      className="glass-subtle inline-flex items-center gap-0.5 rounded-xl p-0.5"
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
              'relative rounded-lg px-3 py-1.5 text-xs font-semibold tabular-nums transition-colors',
              isActive ? 'text-brand-fg' : 'text-fg-muted hover:text-fg',
            )}
          >
            {isActive ? (
              <m.span
                layoutId="symbol-indicator"
                className="absolute inset-0 -z-0 rounded-lg"
                style={{
                  background:
                    'linear-gradient(135deg, oklch(80% 0.16 78) 0%, oklch(74% 0.18 60) 100%)',
                  boxShadow:
                    'inset 0 1px 0 0 oklch(100% 0 0 / 0.15), 0 4px 12px -2px oklch(78% 0.16 78 / 0.4)',
                }}
                transition={{ type: 'spring', stiffness: 380, damping: 30 }}
              />
            ) : null}
            <span className="relative z-10">{s}</span>
          </Link>
        );
      })}
    </div>
  );
}
