import type { ReactNode } from 'react';

interface PageHeaderProps {
  title: string;
  description?: string;
  icon?: ReactNode;
  children?: ReactNode;
}

export function PageHeader({ title, description, icon, children }: PageHeaderProps) {
  return (
    <header className="flex flex-col gap-2 pb-1">
      <div className="flex items-end justify-between gap-3">
        <div className="flex items-center gap-3">
          {icon ? (
            <span
              className="text-fg inline-flex h-10 w-10 items-center justify-center rounded-2xl"
              style={{
                background:
                  'linear-gradient(135deg, oklch(78% 0.16 78 / 0.18), oklch(72% 0.18 295 / 0.18))',
                boxShadow: 'inset 0 1px 0 0 oklch(100% 0 0 / 0.08)',
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
