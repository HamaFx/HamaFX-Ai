'use client';

// Mobile-first form for creating an alert. Three rule types share most
// fields; we render conditional inputs for `tf` (candle/indicator) and
// `indicator` (indicator-only). Phase 5: rendered inside a Drawer; the
// outer card wrapping has been dropped so the drawer handles spacing.
import { SYMBOLS, TIMEFRAMES, type Symbol, type Timeframe } from '@hamafx/shared';
import { useState } from 'react';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/cn';

type RuleType = 'priceCross' | 'candleClose' | 'indicatorCross';

interface AlertFormProps {
  /** Defaults to the first symbol — most users land here from /chart and
   *  expect that symbol to be pre-selected. */
  initialSymbol?: Symbol;
  onCreated?: () => void;
}

const COMMON_INDICATORS = ['rsi:14', 'ema:50', 'ema:200', 'sma:50', 'atr:14'] as const;

export function AlertForm({ initialSymbol, onCreated }: AlertFormProps) {
  const [type, setType] = useState<RuleType>('priceCross');
  const [symbol, setSymbol] = useState<Symbol>(initialSymbol ?? 'XAUUSD');
  const [tf, setTf] = useState<Timeframe>('1h');
  const [indicator, setIndicator] = useState<string>('rsi:14');
  const [direction, setDirection] = useState<'above' | 'below'>('above');
  const [level, setLevel] = useState<string>('');
  const [note, setNote] = useState<string>('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);

    const numericLevel = Number(level);
    if (!Number.isFinite(numericLevel)) {
      setSubmitting(false);
      setError('Level must be a number');
      return;
    }

    const rule =
      type === 'priceCross'
        ? { type: 'priceCross' as const, symbol, level: numericLevel, direction }
        : type === 'candleClose'
          ? { type: 'candleClose' as const, symbol, tf, level: numericLevel, direction }
          : {
              type: 'indicatorCross' as const,
              symbol,
              tf,
              indicator,
              level: numericLevel,
              direction,
            };

    try {
      const res = await fetch('/api/alerts', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          rule,
          channels: ['email'],
          note: note.trim() || null,
        }),
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => null)) as {
          error?: { message?: string };
        } | null;
        throw new Error(body?.error?.message ?? `HTTP ${res.status}`);
      }
      setLevel('');
      setNote('');
      toast.success('Alert created', { description: `${symbol} ${direction} ${numericLevel}` });
      onCreated?.();
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Create failed';
      toast.error('Create failed', { description: message });
      setError(message);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-3 px-4 pb-2">
      <Segmented<RuleType>
        label="When"
        value={type}
        onChange={setType}
        options={[
          { value: 'priceCross', label: 'price' },
          { value: 'candleClose', label: 'candle close' },
          { value: 'indicatorCross', label: 'indicator' },
        ]}
      />

      <Segmented<Symbol>
        label="Symbol"
        value={symbol}
        onChange={setSymbol}
        options={SYMBOLS.map((s) => ({ value: s, label: s }))}
      />

      {type !== 'priceCross' ? (
        <Segmented<Timeframe>
          label="Timeframe"
          value={tf}
          onChange={setTf}
          options={TIMEFRAMES.map((t) => ({ value: t, label: t }))}
        />
      ) : null}

      {type === 'indicatorCross' ? (
        <div className="flex flex-col gap-1">
          <span className="text-fg-subtle text-[11px] uppercase tracking-wide">Indicator</span>
          <div className="flex flex-wrap gap-1">
            {COMMON_INDICATORS.map((ind) => (
              <button
                key={ind}
                type="button"
                onClick={() => setIndicator(ind)}
                className={cn(
                  'border-border rounded border px-2 py-1 text-[11px]',
                  indicator === ind ? 'bg-brand text-brand-fg' : 'bg-bg-elev-2 text-fg-muted',
                )}
              >
                {ind}
              </button>
            ))}
          </div>
          <Input
            value={indicator}
            onChange={(e) => setIndicator(e.target.value)}
            placeholder="rsi:14, ema:50, macd:12,26,9"
            className="text-xs"
          />
        </div>
      ) : null}

      <Segmented
        label="Direction"
        value={direction}
        onChange={setDirection}
        options={[
          { value: 'above', label: 'above ↑' },
          { value: 'below', label: 'below ↓' },
        ]}
      />

      <div className="flex flex-col gap-1">
        <label className="text-fg-subtle text-[11px] uppercase tracking-wide" htmlFor="alert-level">
          Level
        </label>
        <Input
          id="alert-level"
          value={level}
          onChange={(e) => setLevel(e.target.value)}
          inputMode="decimal"
          placeholder={symbol === 'XAUUSD' ? 'e.g. 2400' : 'e.g. 1.0850'}
        />
      </div>

      <div className="flex flex-col gap-1">
        <label className="text-fg-subtle text-[11px] uppercase tracking-wide" htmlFor="alert-note">
          Note (optional)
        </label>
        <Input
          id="alert-note"
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder="why am I watching this level?"
          maxLength={280}
        />
      </div>

      {error ? <p className="text-bear text-xs">{error}</p> : null}

      <Button type="submit" disabled={submitting || !level} size="md">
        {submitting ? 'Creating…' : 'Create alert'}
      </Button>
    </form>
  );
}

interface SegmentedProps<T extends string> {
  label: string;
  value: T;
  onChange: (next: T) => void;
  options: ReadonlyArray<{ value: T; label: string }>;
}

function Segmented<T extends string>({ label, value, onChange, options }: SegmentedProps<T>) {
  return (
    <div className="flex flex-col gap-1">
      <span className="text-fg-subtle text-[11px] uppercase tracking-wide">{label}</span>
      <div className="border-border bg-bg-elev-2 inline-flex flex-wrap items-center gap-0.5 rounded-md border p-0.5">
        {options.map((opt) => {
          const active = opt.value === value;
          return (
            <button
              key={opt.value}
              type="button"
              onClick={() => onChange(opt.value)}
              className={cn(
                'rounded px-2 py-1 text-[11px] font-medium tabular-nums transition-colors',
                active
                  ? 'bg-brand text-brand-fg'
                  : 'text-fg-muted hover:bg-bg-elev-1 hover:text-fg',
              )}
            >
              {opt.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}
