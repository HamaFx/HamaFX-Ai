'use client';

/**
 * Copyright 2026 HamaFX
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

// Phase 7c — soft citation warning footer.
//
// Renders a `data-citation-warning` UiPart as a tone-muted footer pill
// with an expandable list of unsupported claim phrases. We deliberately
// keep this quiet — the enforcer is heuristic and `stance: 'soft'` so
// we never want to overshadow the assistant's actual answer.
//
// Phase B — UX_UPGRADE_PLAN.md item 9.
// When the warning part carries a structured `findings` array, we
// render each finding as its own row with a "supported" / "no tool
// source" pill. The legacy flat `unsupportedClaims` list is still
// rendered for parts persisted before the findings field landed.

import { Quote, ChevronDown, ChevronRight, Check, X } from 'lucide-react';
import { useState } from 'react';

import type { CitationWarningPart } from '@hamafx/shared';

interface CitationWarningProps {
  part: CitationWarningPart;
}

export function CitationWarningPartView({ part }: CitationWarningProps) {
  const [open, setOpen] = useState(false);
  const tone =
    part.stance === 'strict'
      ? 'border-amber-500/40 bg-amber-500/5 text-amber-500'
      : 'border-zinc-800 bg-zinc-950/60 text-fg-muted';

  const hasFindings = (part.findings?.length ?? 0) > 0;
  // Backward compat: parts without `findings` get one synthetic
  // finding per `unsupportedClaims` entry so the old layout still
  // works.
  const rows = hasFindings
    ? part.findings!.map((f) => ({
        text: f.text,
        supported: f.supported,
        supportingTool: f.supportingTool ?? null,
      }))
    : part.unsupportedClaims.map((text) => ({
        text,
        supported: false,
        supportingTool: null as string | null,
      }));

  return (
    <div className={`flex flex-col gap-1 rounded-sm border px-3 py-2 ${tone}`}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-controls="citation-warning-content"
        className="hover:text-fg flex items-center gap-2 text-left text-body-sm font-medium focus:outline-none"
      >
        {open ? <ChevronDown className="size-3.5" /> : <ChevronRight className="size-3.5" />}
        <Quote className="size-3.5" />
        <span>
          {rows.length} statement{rows.length === 1 ? '' : 's'} without a tool source
        </span>
      </button>

      {open ? (
        <ul id="citation-warning-content" className="ml-6 flex flex-col gap-1 text-body-sm">
          {rows.map((row, i) => (
            <li key={i} className="text-fg-subtle flex items-start gap-2">
              {row.supported ? (
                <Check
                  className="text-emerald-500 mt-0.5 size-3.5 shrink-0"
                  aria-label="supported"
                />
              ) : (
                <X
                  className="text-amber-500 mt-0.5 size-3.5 shrink-0"
                  aria-label="no tool source"
                />
              )}
              <span className="flex-1">{row.text}</span>
              {row.supportingTool ? (
                <span className="text-fg-subtle ml-2 font-mono text-caption">
                  {row.supportingTool}
                </span>
              ) : null}
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
