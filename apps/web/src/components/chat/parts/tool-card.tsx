// Generic renderer for tool-call parts. The AI SDK v5 streams parts of
// shape `{ type: 'tool-<name>', input, output, state }`. Each tool COULD
// have a bespoke renderer (mini chart for get_candles, etc.); for Phase 1b
// we ship one expandable card that works for all five tools and looks
// crisp on mobile. Bespoke renderers can land per-tool later without
// touching the message-list code.

import { useState } from 'react';

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
  const label = PRETTY_NAME[name] ?? name.replace(/^tool-/, '');
  const running = state === 'input-streaming' || state === 'input-available';
  const failed = state === 'output-error';

  // Tiny one-liner summary so the card communicates without expanding.
  const summary = failed
    ? errorText ?? 'tool failed'
    : running
      ? 'running…'
      : oneLiner(label, output);

  return (
    <div
      className={cn(
        'border-border bg-bg-elev-1 rounded-md border px-2.5 py-1.5 text-xs',
        failed && 'border-bear/30',
      )}
    >
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        className="flex w-full items-center justify-between gap-2 text-left"
        aria-expanded={expanded}
      >
        <span className="text-fg-muted flex items-center gap-1.5 font-medium">
          <span aria-hidden>{running ? '◐' : failed ? '✕' : '✓'}</span>
          <span>{label}</span>
          <span className={cn('text-fg-subtle truncate', running && 'animate-pulse')}>
            · {summary}
          </span>
        </span>
        <span className="text-fg-subtle">{expanded ? '−' : '+'}</span>
      </button>

      {expanded ? (
        <div className="border-border mt-2 space-y-2 border-t pt-2 font-mono">
          <Section label="input" data={input} />
          {failed ? (
            <Section label="error" data={{ message: errorText ?? 'unknown' }} />
          ) : output !== undefined ? (
            <Section label="output" data={output} />
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

function Section({ label, data }: { label: string; data: unknown }) {
  return (
    <div>
      <div className="text-fg-subtle mb-0.5 uppercase tracking-wide">{label}</div>
      <pre className="bg-bg max-h-40 overflow-auto rounded p-2 text-[10px] leading-tight">
        {safeStringify(data)}
      </pre>
    </div>
  );
}

function safeStringify(v: unknown): string {
  try {
    return JSON.stringify(v, null, 2);
  } catch {
    return String(v);
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
