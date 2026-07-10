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

// Generic renderer for tool-call parts. The AI SDK v5 streams parts of
// shape `{ type: 'tool-<name>', input, output, state }`. Each tool COULD
// have a bespoke renderer (mini chart for get_candles, etc.); for Phase 1b
// we ship one expandable card that works for all five tools and looks
// crisp on mobile. Bespoke renderers can land per-tool later without
// touching the message-list code.

import { useState, useId } from 'react';
import { m } from 'motion/react';
import { IconChevronDown, IconChevronRight } from '@tabler/icons-react';

import { cn } from '@/lib/cn';

interface ToolCardProps {
  name: string;
  state: 'input-streaming' | 'input-available' | 'output-available' | 'output-error';
  input: unknown;
  output: unknown;
  errorText?: string;
}

const PRETTY_NAME: Record<string, string> = {
  'tool-get_price': 'price',
  'tool-get_candles': 'candles',
  'tool-get_indicators': 'indicators',
  'tool-get_news': 'news',
  'tool-get_calendar': 'calendar',
};

export function ToolCard({ name, state, input, output, errorText }: ToolCardProps) {
  const [expanded, setExpanded] = useState(false);
  const contentId = useId();
  const label = PRETTY_NAME[name] ?? name.replace(/^tool-/, '').replace(/_/g, ' ');
  const running = state === 'input-streaming' || state === 'input-available';
  const failed = state === 'output-error';

  // Tiny one-liner summary so the card communicates without expanding.
  const summary = failed
    ? (errorText ?? 'tool failed')
    : running
      ? 'running…'
      : oneLiner(label, output);

  return (
    <m.div
      layout
      initial={false}
      className={cn(
        'border-border bg-bg-elev-1 rounded-sm border',
        failed && 'border-danger/30',
      )}
    >
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        className="flex w-full items-center justify-between gap-2 border-b border-divider px-3 py-2 text-left text-xs"
        aria-expanded={expanded}
        aria-controls={contentId}
      >
        <span className="text-fg-muted flex items-center gap-1.5 font-medium">
          <span>{label}</span>
          <span className={cn('text-fg-subtle truncate font-mono tabular-nums', running && 'animate-pulse')}>
            · {summary}
          </span>
        </span>
        <span className="text-fg-subtle">
          {expanded ? <IconChevronDown className="size-4" /> : <IconChevronRight className="size-4" />}
        </span>
      </button>

      {expanded ? (
        <m.div
          key="tool-card-content"
          initial={{ opacity: 0, height: 0 }}
          animate={{ opacity: 1, height: 'auto' }}
          exit={{ opacity: 0, height: 0 }}
          transition={{ duration: 0.2 }}
          id={contentId}
          className="border-divider mt-0 space-y-2 px-3 py-3 font-mono tabular-nums text-sm overflow-hidden"
        >
          <Section label="input" data={input} />
          {failed ? (
            <Section label="error" data={{ message: errorText ?? 'unknown' }} />
          ) : output !== undefined ? (
            <Section label="output" data={output} />
          ) : null}
        </m.div>
      ) : null}
    </m.div>
  );
}

function Section({ label, data }: { label: string; data: unknown }) {
  return (
    <div>
      <div className="text-fg-subtle mb-0.5 text-xs uppercase tracking-wide">{label}</div>
      <pre className="bg-bg-elev-2 max-h-40 overflow-auto rounded-sm p-2 text-caption leading-tight">
        {safeStringify(data)}
      </pre>
    </div>
  );
}

function safeStringify(v: unknown): string {
  try {
    const str = JSON.stringify(v, null, 2);
    if (str.length > 5000) {
      return str.slice(0, 5000) + '\n... (truncated)';
    }
    return str;
  } catch {
    const str = String(v);
    if (str.length > 5000) {
      return str.slice(0, 5000) + '\n... (truncated)';
    }
    return str;
  }
}

/**
 * One-liner summary tailored per tool. Falls back to a generic key count.
 */
function oneLiner(label: string, output: unknown): string {
  if (output === null || output === undefined) return 'no output';
  if (label === 'price') {
    const ticks = (output as { ticks?: { symbol: string; mid: number }[] }).ticks;
    if (Array.isArray(ticks) && ticks.length > 0) {
      return ticks.map((t) => `${t.symbol} ${t.mid}`).join(', ');
    }
  }
  if (label === 'candles') {
    const c = (output as { candles?: unknown[] }).candles;
    if (Array.isArray(c)) return `${c.length} bars`;
  }
  if (label === 'indicators') {
    const r = (output as { results?: { kind: string }[] }).results;
    if (Array.isArray(r)) return r.map((x) => x.kind).join(', ');
  }
  if (label === 'news' || label === 'calendar') {
    const o = output as { items?: unknown[]; pipelinePending?: boolean };
    if (o.pipelinePending) return 'pipeline not yet populated';
    return `${o.items?.length ?? 0} items`;
  }
  if (typeof output === 'object') {
    return `${Object.keys(output as Record<string, unknown>).length} fields`;
  }
  return String(output).slice(0, 60);
}
