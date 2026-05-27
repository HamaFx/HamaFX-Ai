// Reusable settings section. Card with an icon header and slot for rows.

import type { ReactNode } from 'react';

interface SettingsSectionProps {
  icon?: ReactNode;
  title: string;
  description?: string;
  children: ReactNode;
}

export function SettingsSection({ icon, title, description, children }: SettingsSectionProps) {
  return (
    <section
      aria-labelledby={`section-${title.toLowerCase().replace(/\s+/g, '-')}`}
      className="border-divider bg-bg-elev-1 flex flex-col gap-3 rounded-lg border p-4"
    >
      <header className="flex items-center gap-2.5">
        {icon ? (
          <span className="bg-bg-elev-2 text-fg-muted inline-flex h-8 w-8 items-center justify-center rounded-lg">
            {icon}
          </span>
        ) : null}
        <div className="flex flex-col">
          <h2
            id={`section-${title.toLowerCase().replace(/\s+/g, '-')}`}
            className="text-fg text-sm font-medium"
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
