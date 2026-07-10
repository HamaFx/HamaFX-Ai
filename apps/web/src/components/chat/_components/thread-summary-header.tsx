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

// Phase 1.5 — Thread summary header.
//
// A collapsible card pinned above the message list. Shows a synopsis of the
// thread + key insights (reuses the `summarize_thread` tool output). Only
// appears once the thread has grown long enough (~20 messages) AND a summary
// has been generated.

import {IconChevronDown, IconChevronUp, IconBolt, IconX} from '@tabler/icons-react';
import { AnimatePresence, m } from 'motion/react';
import { useState } from 'react';

interface ThreadSummaryHeaderProps {
  synopsis: string;
  insights: Array<{ text: string; symbol?: string | null }>;
  onDismiss?: () => void;
}

export function ThreadSummaryHeader({ synopsis, insights, onDismiss }: ThreadSummaryHeaderProps) {
  const [open, setOpen] = useState(false);

  return (
    <div
      role="status"
      aria-label="Thread summary"
      className="border border-border bg-bg-elev-1 rounded-sm p-3 mb-3"
    >
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <IconBolt className="size-3.5 text-fg" />
          <span className="text-body-sm font-semibold text-fg">Thread summary</span>
        </div>
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => setOpen((v) => !v)}
            aria-expanded={open}
            aria-label={open ? 'Collapse summary' : 'Expand summary'}
            className="text-fg-subtle hover:text-fg inline-flex size-7 items-center justify-center rounded-sm transition-colors"
          >
            {open ? <IconChevronUp className="size-3.5" /> : <IconChevronDown className="size-3.5" />}
          </button>
          {onDismiss ? (
            <button
              type="button"
              onClick={onDismiss}
              aria-label="Dismiss summary"
              className="text-fg-subtle hover:text-danger inline-flex size-7 items-center justify-center rounded-sm transition-colors"
            >
              <IconX className="size-3.5" />
            </button>
          ) : null}
        </div>
      </div>

      {/* Collapsed: synopsis preview */}
      {!open ? (
        <p className="text-fg-muted text-xs line-clamp-2 mt-1.5">{synopsis}</p>
      ) : null}

      <AnimatePresence initial={false}>
        {open ? (
          <m.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="overflow-hidden"
          >
            <div className="flex flex-col gap-2 pt-2">
              <p className="text-fg text-sm leading-[1.4]">{synopsis}</p>

              {insights.length > 0 ? (
                <ul className="flex flex-col gap-1">
                  {insights.map((ins, i) => (
                    <li
                      key={i}
                      className="border-divider flex items-baseline gap-2 rounded-sm border p-2 text-xs"
                    >
                      <span className="text-fg-muted">→</span>
                      <span className="text-fg flex-1">{ins.text}</span>
                      {ins.symbol ? (
                        <span className="bg-bg-elev-2 text-fg-muted rounded-sm px-1.5 py-0.5 text-caption font-medium">
                          {ins.symbol}
                        </span>
                      ) : null}
                    </li>
                  ))}
                </ul>
              ) : null}
            </div>
          </m.div>
        ) : null}
      </AnimatePresence>
    </div>
  );
}
