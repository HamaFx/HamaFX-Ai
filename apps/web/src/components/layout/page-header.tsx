import type { ReactNode } from 'react';

interface PageHeaderProps {
  title: string;
  description?: string;
  icon?: ReactNode;
  children?: ReactNode;
}

export function PageHeader({ title, description, icon, children }: PageHeaderProps) {
  return (
    <header className="flex flex-col gap-2 pb-4">
      <div className="flex items-end justify-between gap-3">
        <div className="flex items-center gap-3">
          {icon ? (
            <span className="bg-bg-elev-2 text-fg-muted inline-flex h-9 w-9 items-center justify-center rounded-lg">
              {icon}
            </span>
          ) : null}
          <h1 className="text-fg text-xl font-semibold tracking-tight">{title}</h1>
        </div>
        {children ? <div className="flex items-center gap-2">{children}</div> : null}
      </div>
      {description ? <p className="text-fg-muted text-sm">{description}</p> : null}
    </header>
  );
}
