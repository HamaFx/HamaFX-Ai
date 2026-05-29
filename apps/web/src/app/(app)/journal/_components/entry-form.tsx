'use client';

// New journal-entry form. Mobile-first: stacked, all tap targets ≥ 44px,
// CTA is the size-lg primary button so it sits in the thumb zone of the
// drawer.

import { SYMBOLS, type Symbol, type TradeSide } from '@hamafx/shared';
import { useState } from 'react';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Segmented } from '@/components/ui/segmented';
import { fetchCsrf } from '@/lib/csrf';
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
  const [tagsInput, setTagsInput] = useState<string>('');
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

    // Field-level sanity check: long stops must be below entry, short above.
    if (parsed.stop !== null && Number.isFinite(parsed.stop)) {
      if (side === 'long' && parsed.stop >= parsed.entry) {
        setBusy(false);
        setError('Long stop must be below entry');
        return;
      }
      if (side === 'short' && parsed.stop <= parsed.entry) {
        setBusy(false);
        setError('Short stop must be above entry');
        return;
      }
    }

    const tags = tagsInput
      .split(',')
      .map((t) => t.trim())
      .filter((t) => t.length > 0);

    try {
      const res = await fetchCsrf('/api/journal', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          symbol,
          side,
          openedAt: Date.now(),
          ...parsed,
          notes: notes.trim() || null,
          tags,
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
      setTagsInput('');
      toast.success('Trade logged', { description: `${symbol} ${side} @ ${parsed.entry}` });
      onCreated?.();
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Create failed';
      toast.error('Save failed', { description: message });
      setError(message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-4 px-4 pb-4">
      <Segmented<Symbol>
        label="Symbol"
        value={symbol}
        onChange={setSymbol}
        role="radiogroup"
        variant="solid"
        size="md"
        options={SYMBOLS.map((s) => ({ value: s, label: s }))}
      />

      <Segmented<TradeSide>
        label="Side"
        value={side}
        onChange={setSide}
        role="radiogroup"
        variant="tone"
        size="md"
        options={[
          { value: 'long', label: 'long ↑', tone: 'bull' },
          { value: 'short', label: 'short ↓', tone: 'bear' },
        ]}
      />

      <div className="grid grid-cols-2 gap-3">
        <Field label="Entry" value={entry} setValue={setEntry} required />
        <Field label="Stop (optional)" value={stop} setValue={setStop} />
        <Field label="Target (optional)" value={target} setValue={setTarget} />
        <Field label="Size in lots (optional)" value={size} setValue={setSize} />
      </div>

      <div className="flex flex-col gap-2">
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

      <div className="flex flex-col gap-2">
        <label className="text-fg-subtle text-[11px] uppercase tracking-wide" htmlFor="tags">
          Tags (optional, comma-separated)
        </label>
        <Input
          id="tags"
          value={tagsInput}
          onChange={(e) => setTagsInput(e.target.value)}
          placeholder="SMC, FOMC, Breakout..."
          maxLength={500}
        />
      </div>

      {error ? <p className="text-bear text-sm">{error}</p> : null}

      <Button
        type="submit"
        size="lg"
        disabled={busy || !entry}
        loading={busy}
        className="mt-2"
      >
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
    <div className="flex flex-col gap-2">
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
