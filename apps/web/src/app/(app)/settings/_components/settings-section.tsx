// Premium glass settings section.

import type { ReactNode } from 'react';

interface SettingsSectionProps {
  icon?: ReactNode;
  iconColor?: string;
  title: string;
  description?: string;
  children: ReactNode;
}

export function SettingsSection({
  icon,
  iconColor = 'oklch(78% 0.16 78 / 0.18)',
  title,
  description,
  children,
}: SettingsSectionProps) {
  return (
    <section
      aria-labelledby={`section-${title.toLowerCase().replace(/\s+/g, '-')}`}
      className="card-premium flex flex-col gap-4 p-4"
    >
      <header className="flex items-center gap-3">
        {icon ? (
          <span
            className="text-fg inline-flex h-9 w-9 items-center justify-center rounded-xl"
            style={{
              background: iconColor,
              boxShadow: 'inset 0 1px 0 0 oklch(100% 0 0 / 0.08)',
            }}
          >
            {icon}
          </span>
        ) : null}
        <div className="flex flex-col">
          <h2
            id={`section-${title.toLowerCase().replace(/\s+/g, '-')}`}
            className="text-fg text-base font-semibold tracking-tight"
          >
            {title}
          </h2>
          {description ? <p className="text-fg-subtle text-xs">{description}</p> : null}
        </div>
      </header>
      <div className="flex flex-col gap-3">{children}</div>
    </section>
  );
}
