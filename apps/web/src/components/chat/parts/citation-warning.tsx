'use client';

// Phase 7c — soft citation warning footer.
//
// Renders a `data-citation-warning` UiPart as a tone-muted footer pill
// with an expandable list of unsupported claim phrases. We deliberately
// keep this quiet — the enforcer is heuristic and `stance: 'soft'` so
// we never want to overshadow the assistant's actual answer.

import { Quote, ChevronDown, ChevronRight } from 'lucide-react';
import { useState } from 'react';

import type { CitationWarningPart } from '@hamafx/shared';

interface CitationWarningProps {
  part: CitationWarningPart;
}

export function CitationWarningPartView({ part }: CitationWarningProps) {
  const [open, setOpen] = useState(false);
  const tone =
    part.stance === 'strict'
      ? 'border-warn/40 bg-warn/5 text-warn'
      : 'border-divider/60 bg-bg-elev-1/60 text-fg-muted';

  return (
    <div className={`flex flex-col gap-1 rounded-2xl border px-3 py-2 ${tone}`}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="hover:text-fg flex items-center gap-2 text-left text-[11px] font-medium focus:outline-none"
      >
        {open ? <ChevronDown className="size-3.5" /> : <ChevronRight className="size-3.5" />}
        <Quote className="size-3.5" />
        <span>
          {part.unsupportedClaims.length} statement
          {part.unsupportedClaims.length === 1 ? '' : 's'} without a tool source
        </span>
      </button>

      {open ? (
        <ul className="ml-6 flex flex-col gap-1 text-[11px]">
          {part.unsupportedClaims.map((c, i) => (
            <li key={i} className="text-fg-subtle">
              · {c}
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
