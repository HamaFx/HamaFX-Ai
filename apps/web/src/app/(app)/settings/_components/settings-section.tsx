// SPDX-License-Identifier: Apache-2.0

// Premium settings section.

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
  iconColor = 'var(--color-bg-elev-3)',
  title,
  description,
  children,
}: SettingsSectionProps) {
  return (
    <section
      aria-labelledby={`section-${title.toLowerCase().replace(/\s+/g, '-')}`}
      className="flex flex-col gap-3"
    >
      <header className="flex items-center gap-3 px-0.5">
        {icon ? (
          <span
            className="text-fg inline-flex h-7 w-7 items-center justify-center rounded-sm"
            style={{
              background: iconColor,
            }}
          >
            {icon}
          </span>
        ) : null}
        <div className="flex flex-col gap-0.5">
          <h2
            id={`section-${title.toLowerCase().replace(/\s+/g, '-')}`}
            className="text-fg text-sm font-semibold tracking-tight"
          >
            {title}
          </h2>
          {description ? <p className="text-fg-subtle text-caption">{description}</p> : null}
        </div>
      </header>
      <div className="flex flex-col gap-3">{children}</div>
    </section>
  );
}
