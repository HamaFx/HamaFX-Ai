// SettingsRow — a labeled row inside a SettingsSection. Three slots:
//   [optional icon]  [label + optional description]   [right action]
//
// Used by both the toggle preferences and the channel-test rows so the
// settings page reads as one cohesive list rather than five different
// row layouts.

import type { ReactNode } from 'react';

import { cn } from '@/lib/cn';

interface SettingsRowProps {
  icon?: ReactNode;
  iconColor?: string;
  label: string;
  description?: ReactNode;
  /** Right-aligned action — button, switch, status pill, etc. */
  action: ReactNode;
  /** Stack the description below or wrap on narrow screens. */
  stack?: boolean;
  className?: string;
}

export function SettingsRow({
  icon,
  iconColor = 'oklch(20% 0 0 / 0.6)',
  label,
  description,
  action,
  stack,
  className,
}: SettingsRowProps) {
  return (
    <div
      className={cn(
        'flex min-h-[56px] items-center gap-3',
        stack ? 'flex-col items-stretch gap-3' : '',
        className,
      )}
    >
      {icon ? (
        <span
          aria-hidden="true"
          className="text-fg-muted inline-flex size-9 shrink-0 items-center justify-center rounded-lg"
          style={{
            background: iconColor,
            boxShadow: 'var(--shadow-inset-edge-soft)',
          }}
        >
          {icon}
        </span>
      ) : null}
      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span className="text-fg text-sm font-semibold leading-tight">{label}</span>
        {description ? (
          <span className="text-fg-subtle text-xs leading-snug">{description}</span>
        ) : null}
      </div>
      {!stack ? <div className="flex shrink-0 items-center gap-2">{action}</div> : null}
      {stack ? <div className="flex flex-wrap items-center gap-2">{action}</div> : null}
    </div>
  );
}
