'use client';

// Phase 7c — collapsible "Thinking" chat part.
//
// Renders a `data-plan` UiPart as a tone-muted card with a chevron
// summary row + an expandable list of steps. Default collapsed so the
// user only sees the rationale at a glance. Expanding reveals the
// plan's steps and any expected tool calls.

import { Brain, ChevronRight, ChevronDown } from 'lucide-react';
import { useState } from 'react';

import type { UserPlanPart } from '@hamafx/shared';

import { cn } from '@/lib/cn';

interface PlanPartProps {
  plan: UserPlanPart;
}

const DOMAIN_LABEL: Record<UserPlanPart['domain'], string> = {
  fundamental: 'Fundamental plan',
  technical: 'Technical plan',
  summary: 'Summary plan',
  vision: 'Vision plan',
  generic: 'Plan',
};

export function PlanPart({ plan }: PlanPartProps) {
  const [open, setOpen] = useState(false);

  return (
    <div
      className={cn(
        'border-divider/60 bg-bg-elev-1 flex flex-col gap-1 rounded-2xl border px-3 py-2',
      )}
    >
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="text-fg-muted hover:text-fg flex items-center gap-2 text-left text-[11px] font-medium tabular-nums focus:outline-none"
      >
        {open ? (
          <ChevronDown className="size-3.5" />
        ) : (
          <ChevronRight className="size-3.5" />
        )}
        <Brain className="size-3.5" />
        <span className="text-fg-muted">{DOMAIN_LABEL[plan.domain]}</span>
        <span className="text-fg-subtle">·</span>
        <span className="text-fg-subtle line-clamp-1 flex-1">{plan.rationale}</span>
      </button>

      {open ? (
        <div className="flex flex-col gap-2 pt-1">
          {plan.steps.length > 0 ? (
            <ol className="text-fg-muted ml-6 flex flex-col gap-1 text-xs">
              {plan.steps.map((s, i) => (
                <li key={i} className="flex items-baseline gap-2">
                  <span className="text-fg-subtle font-mono text-[10px] tabular-nums">
                    {String(i + 1).padStart(2, '0')}
                  </span>
                  <span>{s}</span>
                </li>
              ))}
            </ol>
          ) : (
            <p className="text-fg-subtle ml-6 text-xs">No steps recorded.</p>
          )}

          {plan.expectedTools.length > 0 ? (
            <p className="text-fg-subtle ml-6 text-[10px]">
              Expected tools:{' '}
              {plan.expectedTools.map((t, i) => (
                <span
                  key={`${t}-${i}`}
                  className="bg-bg-elev-2 text-fg-muted ml-1 rounded px-1.5 py-0.5 font-mono text-[10px]"
                >
                  {t}
                </span>
              ))}
            </p>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
