import { cn } from '@/lib/cn';

interface PlaceholderProps {
  title: string;
  description: string;
  /** Phase tag, e.g. "Phase 1b" — shown as a small chip. */
  phase?: string;
  className?: string;
  children?: React.ReactNode;
}

/**
 * Empty-state card used for routes that exist in the app shell but won't be
 * implemented until a later phase. Keeps the navigation discoverable while
 * making it obvious to anyone (you, or a future AI agent) what's pending.
 */
export function Placeholder({ title, description, phase, className, children }: PlaceholderProps) {
  return (
    <div
      className={cn(
        'border-border bg-bg-elev-1 flex flex-col items-start gap-3 rounded-lg border p-5',
        className,
      )}
    >
      <div className="flex flex-wrap items-center gap-2">
        <h2 className="text-fg text-base font-semibold">{title}</h2>
        {phase ? (
          <span className="border-border text-fg-muted rounded-full border px-2 py-0.5 text-[11px] font-medium">
            {phase}
          </span>
        ) : null}
      </div>
      <p className="text-fg-muted text-sm leading-relaxed">{description}</p>
      {children}
    </div>
  );
}
