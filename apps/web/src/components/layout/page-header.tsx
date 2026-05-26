interface PageHeaderProps {
  title: string;
  description?: string;
  children?: React.ReactNode;
}

export function PageHeader({ title, description, children }: PageHeaderProps) {
  return (
    <header className="flex flex-col gap-2 pb-4">
      <div className="flex items-end justify-between gap-3">
        <h1 className="text-fg text-xl font-semibold tracking-tight">{title}</h1>
        {children ? <div className="flex items-center gap-2">{children}</div> : null}
      </div>
      {description ? <p className="text-fg-muted text-sm">{description}</p> : null}
    </header>
  );
}
