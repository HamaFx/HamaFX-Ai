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

// New journal-entry form. Mobile-first: stacked, all tap targets ≥ 44px,
// CTA is the size-lg primary button so it sits in the thumb zone of the
// drawer.

import { SYMBOLS, type Symbol, type TradeSide } from '@hamafx/shared';
import { useState } from 'react';
import { toast } from 'sonner';
import { z } from 'zod';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Segmented } from '@/components/ui/segmented';
import { fetchCsrf } from '@/lib/csrf';

const entrySchema = z.object({
  symbol: z.string().min(1, 'Symbol is required'),
  side: z.enum(['long', 'short']),
  entry: z.number({ invalid_type_error: 'Entry price must be a number' }).positive('Entry price must be positive'),
  stop: z.number().positive('Stop loss must be positive').nullable().optional(),
  target: z.number().positive('Target must be positive').nullable().optional(),
  size: z.number().positive('Size must be positive').nullable().optional(),
  notes: z.string().max(5000, 'Notes must be under 5000 characters').nullable().optional(),
  tags: z.array(z.string()).optional(),
});
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
      symbol,
      side,
      entry: entry ? Number(entry) : NaN,
      stop: stop ? Number(stop) : null,
      target: target ? Number(target) : null,
      size: size ? Number(size) : null,
      notes: notes.trim() || null,
      tags: tagsInput
        .split(',')
        .map((t) => t.trim())
        .filter((t) => t.length > 0),
    };

    const validation = entrySchema.safeParse(parsed);
    if (!validation.success) {
      setBusy(false);
      setError(validation.error.errors[0]?.message ?? 'Invalid input');
      return;
    }

    const data = validation.data;

    // Field-level sanity check: long stops must be below entry, short above.
    if (data.stop !== null && data.stop !== undefined) {
      if (side === 'long' && data.stop >= data.entry) {
        setBusy(false);
        setError('Long stop must be below entry');
        return;
      }
      if (side === 'short' && data.stop <= data.entry) {
        setBusy(false);
        setError('Short stop must be above entry');
        return;
      }
    }

    try {
      const res = await fetchCsrf('/api/journal', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          symbol: data.symbol,
          side: data.side,
          openedAt: Date.now(),
          entry: data.entry,
          stop: data.stop,
          target: data.target,
          size: data.size,
          notes: data.notes,
          tags: data.tags,
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
      toast.success('Trade logged', { description: `${symbol} ${side} @ ${data.entry}` });
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
        <label className="text-fg-subtle text-body-sm uppercase tracking-wide" htmlFor="notes">
          Notes (optional)
        </label>
        <Input
          id="notes"
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          placeholder="thesis, news context, levels of interest…"
          maxLength={5000}
        />
      </div>

      <div className="flex flex-col gap-2">
        <label className="text-fg-subtle text-body-sm uppercase tracking-wide" htmlFor="tags">
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
      <label className="text-fg-subtle text-body-sm uppercase tracking-wide" htmlFor={id}>
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
