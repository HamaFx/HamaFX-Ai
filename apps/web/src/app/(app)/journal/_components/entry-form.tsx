'use client';

// New journal-entry form. Mobile-first: stacked, tap targets >= 44px.
// We require symbol/side/entry; stop/target/size/notes are optional.
import { SYMBOLS, type Symbol, type TradeSide } from '@hamafx/shared';
import { useState } from 'react';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/cn';

interface EntryFormProps {
  onCreated?: () => void;
}

export function EntryForm({ onCreated }: EntryFormProps) {
  const [symbol, setSymbol] = useState<Symbol>('XAUUSD');
  const [side, setSide] = useState<TradeSide>('long');
  const [entry, setEntry] = useState<string>('');
  const [stop, setStop] = useState<string>('');
  const [target, setTarget] = useState<string>('');
  const [size, setSize] = useState<string>('');
  const [notes, setNotes] = useState<string>('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);

    const parsed = {
      entry: Number(entry),
      stop: stop ? Number(stop) : null,
      target: target ? Number(target) : null,
      size: size ? Number(size) : null,
    };

    if (!Number.isFinite(parsed.entry)) {
      setBusy(false);
      setError('Entry must be a number');
      return;
    }

    try {
      const res = await fetch('/api/journal', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          symbol,
          side,
          openedAt: Date.now(),
          ...parsed,
          notes: notes.trim() || null,
        }),
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => null)) as {
          error?: { message?: string };
        } | null;
        throw new Error(body?.error?.message ?? `HTTP ${res.status}`);
      }
      setEntry('');
      setStop('');
      setTarget('');
      setSize('');
      setNotes('');
      onCreated?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Create failed');
    } finally {
      setBusy(false);
    }
  }

  return (
    <form
      onSubmit={submit}
      className="border-border bg-bg-elev-1 flex flex-col gap-3 rounded-lg border p-3"
    >
      <h2 className="text-sm font-semibold">Log trade</h2>

      <div className="flex gap-2">
        <Pills<Symbol>
          value={symbol}
          onChange={setSymbol}
          options={SYMBOLS.map((s) => ({ value: s, label: s }))}
        />
      </div>
      <div>
        <Pills<TradeSide>
          value={side}
          onChange={setSide}
          options={[
            { value: 'long', label: 'long ↑', tone: 'bull' },
            { value: 'short', label: 'short ↓', tone: 'bear' },
          ]}
        />
      </div>

      <div className="grid grid-cols-2 gap-2">
        <Field label="Entry" value={entry} setValue={setEntry} required />
        <Field label="Stop (optional)" value={stop} setValue={setStop} />
        <Field label="Target (optional)" value={target} setValue={setTarget} />
        <Field label="Size in lots (optional)" value={size} setValue={setSize} />
      </div>

      <div>
        <label className="text-fg-subtle text-[11px] uppercase tracking-wide" htmlFor="notes">
          Notes (optional)
        </label>
        <Input
          id="notes"
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          placeholder="thesis, news context, levels of interest…"
          maxLength={2000}
        />
      </div>

      {error ? <p className="text-bear text-xs">{error}</p> : null}

      <Button type="submit" size="sm" disabled={busy || !entry}>
        {busy ? 'Saving…' : 'Save entry'}
      </Button>
    </form>
  );
}

function Field({
  label,
  value,
  setValue,
  required,
}: {
  label: string;
  value: string;
  setValue: (v: string) => void;
  required?: boolean;
}) {
  const id = label.toLowerCase().replace(/[^a-z]/g, '-');
  return (
    <div className="flex flex-col gap-1">
      <label className="text-fg-subtle text-[11px] uppercase tracking-wide" htmlFor={id}>
        {label}
      </label>
      <Input
        id={id}
        value={value}
        onChange={(e) => setValue(e.target.value)}
        inputMode="decimal"
        required={required}
      />
    </div>
  );
}

interface PillsProps<T extends string> {
  value: T;
  onChange: (next: T) => void;
  options: ReadonlyArray<{ value: T; label: string; tone?: 'bull' | 'bear' }>;
}

function Pills<T extends string>({ value, onChange, options }: PillsProps<T>) {
  return (
    <div className="border-border bg-bg-elev-2 inline-flex items-center gap-0.5 rounded-md border p-0.5">
      {options.map((opt) => {
        const active = opt.value === value;
        return (
          <button
            key={opt.value}
            type="button"
            onClick={() => onChange(opt.value)}
            className={cn(
              'rounded px-2.5 py-1 text-[11px] font-medium tabular-nums transition-colors',
              active
                ? opt.tone === 'bull'
                  ? 'bg-bull text-bg'
                  : opt.tone === 'bear'
                    ? 'bg-bear text-bg'
                    : 'bg-brand text-brand-fg'
                : 'text-fg-muted hover:bg-bg-elev-1 hover:text-fg',
            )}
          >
            {opt.label}
          </button>
        );
      })}
    </div>
  );
}
