// Mobile-first page header. Hierarchy: page title is the loudest thing on
// the screen (text-2xl bold), description is one line of helper text in
// muted color. Optional icon tile is 48×48 (size-12) so it reads as
// scaffolding, not chrome.

import type { ReactNode } from 'react';

interface PageHeaderProps {
  title: string;
  description?: string;
  icon?: ReactNode;
  children?: ReactNode;
}

export function PageHeader({ title, description, icon, children }: PageHeaderProps) {
  return (
    <header className="flex flex-col gap-2 pb-2">
      <div className="flex items-end justify-between gap-3">
        <div className="flex items-center gap-3">
          {icon ? (
            <span
              aria-hidden="true"
              className="text-fg inline-flex size-12 items-center justify-center rounded-2xl"
              style={{
                backgroundImage: 'var(--gradient-brand-soft)',
                boxShadow: 'var(--shadow-inset-edge-soft)',
              }}
            >
              {icon}
            </span>
          ) : null}
          <h1 className="text-fg text-2xl font-bold tracking-tight">{title}</h1>
        </div>
        {children ? <div className="flex items-center gap-2">{children}</div> : null}
      </div>
      {description ? (
        <p className="text-fg-muted text-sm leading-relaxed">{description}</p>
      ) : null}
    </header>
  );
}
