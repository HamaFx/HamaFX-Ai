'use client';

// Journal entries list. Open trades show a "Close…" button that pops the
// inline close form. Closed trades show their R-multiple + outcome.
import type { JournalEntry } from '@hamafx/shared';
import { useState } from 'react';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/cn';

interface EntryListProps {
  entries: JournalEntry[];
  onClosed: () => void;
  onDeleted: () => void;
}

export function EntryList({ entries, onClosed, onDeleted }: EntryListProps) {
  if (entries.length === 0) {
    return <p className="text-fg-subtle text-xs">No entries yet — log your first trade above.</p>;
  }
  return (
    <ul className="flex flex-col gap-2">
      {entries.map((e) => (
        <EntryRow key={e.id} entry={e} onClosed={onClosed} onDeleted={onDeleted} />
      ))}
    </ul>
  );
}

function EntryRow({
  entry,
  onClosed,
  onDeleted,
}: {
  entry: JournalEntry;
  onClosed: () => void;
  onDeleted: () => void;
}) {
  const [closing, setClosing] = useState(false);
  const [exit, setExit] = useState<string>('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function close() {
    setBusy(true);
    setError(null);
    const exitNum = Number(exit);
    if (!Number.isFinite(exitNum)) {
      setBusy(false);
      setError('exit must be numeric');
      return;
    }
    try {
      const res = await fetch(`/api/journal/${entry.id}`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ exit: exitNum, closedAt: Date.now() }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      setClosing(false);
      setExit('');
      onClosed();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'close failed');
    } finally {
      setBusy(false);
    }
  }

  async function remove() {
    if (!confirm('Delete this entry?')) return;
    setBusy(true);
    try {
      await fetch(`/api/journal/${entry.id}`, { method: 'DELETE' });
      onDeleted();
    } finally {
      setBusy(false);
    }
  }

  const sideColor = entry.side === 'long' ? 'text-bull' : 'text-bear';
  const outcomeColor =
    entry.outcome === 'win'
      ? 'text-bull'
      : entry.outcome === 'loss'
        ? 'text-bear'
        : 'text-fg-muted';

  return (
    <li className="border-border bg-bg-elev-1 flex flex-col gap-2 rounded-lg border p-3">
      <div className="flex items-start gap-3">
        <div className="min-w-0 flex-1">
          <p className="flex items-center gap-2 text-sm font-semibold tabular-nums">
            <span className="text-fg">{entry.symbol}</span>
            <span className={cn('uppercase', sideColor)}>{entry.side}</span>
            <span className="text-fg-muted">@ {entry.entry}</span>
          </p>
          <p className="text-fg-subtle mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[11px] tabular-nums">
            <span>{relative(entry.openedAt)}</span>
            {entry.stop !== null ? (
              <>
                <span aria-hidden>·</span>
                <span>stop {entry.stop}</span>
              </>
            ) : null}
            {entry.target !== null ? (
              <>
                <span aria-hidden>·</span>
                <span>target {entry.target}</span>
              </>
            ) : null}
            {entry.size !== null ? (
              <>
                <span aria-hidden>·</span>
                <span>{entry.size} lots</span>
              </>
            ) : null}
          </p>
          {entry.notes ? <p className="text-fg-muted mt-1 text-xs">{entry.notes}</p> : null}
        </div>

        <div className="flex shrink-0 flex-col items-end gap-1">
          {entry.outcome === 'open' ? (
            !closing ? (
              <Button type="button" size="sm" variant="secondary" onClick={() => setClosing(true)}>
                Close…
              </Button>
            ) : null
          ) : (
            <span className={cn('text-xs font-semibold uppercase', outcomeColor)}>
              {entry.outcome}
              {entry.rMultiple !== null ? (
                <span className="text-fg-muted ml-1 tabular-nums">
                  {entry.rMultiple >= 0 ? '+' : ''}
                  {entry.rMultiple.toFixed(2)}R
                </span>
              ) : null}
            </span>
          )}
          <Button
            type="button"
            size="sm"
            variant="ghost"
            className="text-bear"
            onClick={remove}
            disabled={busy}
          >
            ✕
          </Button>
        </div>
      </div>

      {closing ? (
        <div className="border-border flex items-end gap-2 border-t pt-2">
          <div className="flex-1">
            <label
              className="text-fg-subtle text-[11px] uppercase tracking-wide"
              htmlFor={`exit-${entry.id}`}
            >
              Exit price
            </label>
            <Input
              id={`exit-${entry.id}`}
              value={exit}
              onChange={(ev) => setExit(ev.target.value)}
              inputMode="decimal"
              autoFocus
            />
            {error ? <p className="text-bear mt-0.5 text-[11px]">{error}</p> : null}
          </div>
          <Button type="button" size="sm" onClick={close} disabled={busy || !exit}>
            Save
          </Button>
          <Button
            type="button"
            size="sm"
            variant="ghost"
            onClick={() => {
              setClosing(false);
              setExit('');
              setError(null);
            }}
            disabled={busy}
          >
            Cancel
          </Button>
        </div>
      ) : null}
    </li>
  );
}

function relative(ms: number): string {
  const diff = Date.now() - ms;
  const min = Math.round(diff / 60_000);
  if (min < 1) return 'just now';
  if (min < 60) return `${min}m ago`;
  const hr = Math.round(min / 60);
  if (hr < 24) return `${hr}h ago`;
  const day = Math.round(hr / 24);
  return `${day}d ago`;
}
