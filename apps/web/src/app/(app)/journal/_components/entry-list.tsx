'use client';

// Journal entries list. Mobile-first:
//   - card padding p-4 (16)
//   - delete confirmation via <ConfirmDrawer>, never window.confirm
//   - "close trade" inline form stacks vertically — three controls
//     (label+input → save → cancel) on a 430px screen don't fit
//     side-by-side and were causing the cancel button to wrap to a 2nd
//     row anyway.

import type { JournalEntry } from '@hamafx/shared';
import { Trash2 } from 'lucide-react';
import { useState } from 'react';

import { Button } from '@/components/ui/button';
import { useConfirm } from '@/components/ui/confirm-drawer';
import { Input } from '@/components/ui/input';
import { Tooltip } from '@/components/ui/tooltip';
import { cn } from '@/lib/cn';

interface EntryListProps {
  entries: JournalEntry[];
  onClosed: () => void;
  onDeleted: () => void;
}

export function EntryList({ entries, onClosed, onDeleted }: EntryListProps) {
  const [confirmEl, confirm] = useConfirm();

  if (entries.length === 0) {
    return (
      <p className="text-fg-subtle text-sm">No entries yet — log your first trade above.</p>
    );
  }
  return (
    <>
      <ul className="flex flex-col gap-3">
        {entries.map((e) => (
          <EntryRow
            key={e.id}
            entry={e}
            onClosed={onClosed}
            onDeleted={onDeleted}
            confirm={confirm}
          />
        ))}
      </ul>
      {confirmEl}
    </>
  );
}

type ConfirmFn = ReturnType<typeof useConfirm>[1];

function EntryRow({
  entry,
  onClosed,
  onDeleted,
  confirm,
}: {
  entry: JournalEntry;
  onClosed: () => void;
  onDeleted: () => void;
  confirm: ConfirmFn;
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
      setError('Exit must be a number');
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
    const ok = await confirm({
      title: 'Delete this entry?',
      description: `${entry.symbol} ${entry.side} @ ${entry.entry} will be permanently removed.`,
      confirmLabel: 'Delete',
      tone: 'danger',
    });
    if (!ok) return;
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
    <li className="card-premium flex flex-col gap-3 p-4">
      <div className="flex items-start gap-3">
        <div className="min-w-0 flex-1">
          <p className="flex items-center gap-2 text-sm font-semibold tabular-nums">
            <span className="text-fg">{entry.symbol}</span>
            <span className={cn('uppercase', sideColor)}>{entry.side}</span>
            <span className="text-fg-muted">@ {entry.entry}</span>
          </p>
          <p className="text-fg-subtle mt-2 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs tabular-nums">
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
          {entry.notes ? <p className="text-fg-muted mt-2 text-xs">{entry.notes}</p> : null}
        </div>

        <div className="flex shrink-0 flex-col items-end gap-2">
          {entry.outcome === 'open' ? (
            !closing ? (
              <Button
                type="button"
                size="sm"
                variant="secondary"
                onClick={() => setClosing(true)}
              >
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
          <Tooltip label="Delete">
            <button
              type="button"
              aria-label="Delete entry"
              onClick={() => void remove()}
              disabled={busy}
              className="text-bear/70 hover:text-bear hover:bg-bear/10 inline-flex size-11 items-center justify-center rounded-lg transition-colors disabled:opacity-50"
            >
              <Trash2 className="size-4" />
            </button>
          </Tooltip>
        </div>
      </div>

      {closing ? (
        <div className="border-divider flex flex-col gap-3 border-t pt-3">
          <div>
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
              className="mt-1"
            />
            {error ? <p className="text-bear mt-2 text-xs">{error}</p> : null}
          </div>
          <div className="flex gap-2">
            <Button
              type="button"
              size="md"
              onClick={close}
              disabled={busy || !exit}
              className="flex-1"
            >
              Save
            </Button>
            <Button
              type="button"
              size="md"
              variant="ghost"
              onClick={() => {
                setClosing(false);
                setExit('');
                setError(null);
              }}
              disabled={busy}
              className="flex-1"
            >
              Cancel
            </Button>
          </div>
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
