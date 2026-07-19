'use client';

import type { JournalEntry } from '@hamafx/shared';
import { pipSize, getSymbolDefinition } from '@hamafx/shared';
import { IconArrowUpRight, IconArrowDownRight, IconPlayerPlay, IconTrash } from '@tabler/icons-react';
import Image from 'next/image';
import { useState, useMemo } from 'react';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Tooltip } from '@/components/ui/tooltip';
import type { useConfirm } from '@/components/ui/confirm-drawer';
import { cn } from '@/lib/cn';
import { apiMutate } from '@/lib/api-client';

type ConfirmFn = ReturnType<typeof useConfirm>[1];

interface EntryRowProps {
  entry: JournalEntry;
  openedAtLabel: string;
  closedAtLabel?: string;
  livePrice?: number | undefined;
  onClosed: () => void;
  onDeleted: () => void;
  confirm: ConfirmFn;
}

export function EntryRow({
  entry,
  openedAtLabel,
  closedAtLabel,
  livePrice,
  onClosed,
  onDeleted,
  confirm,
}: EntryRowProps) {
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
      await apiMutate(`/api/journal/${entry.id}`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ exit: exitNum, closedAt: Date.now() }),
      });
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
      await apiMutate(`/api/journal/${entry.id}`, { method: 'DELETE' });
      onDeleted();
    } catch {
      // apiMutate throws on non-2xx — the parent's onDeleted won't fire
    } finally {
      setBusy(false);
    }
  }

  // Calculate Real-Time Live Profit / Loss Metrics
  const liveStats = useMemo(() => {
    if (entry.outcome !== 'open' || !livePrice) return null;

    const diff = entry.side === 'long' ? livePrice - entry.entry : entry.entry - livePrice;
    
    // Pip calculations: use symbol definition pipSize for correct multiplier
    const pipMultiplier = 1 / pipSize(entry.symbol);
    const pips = diff * pipMultiplier;

    // USD Cash calculations (size = lots)
    // Contract sizes: Gold = 100, Forex = 100000
    let cashPnl = 0;
    if (entry.size !== null) {
      const def = getSymbolDefinition(entry.symbol);
      const isCommodity = def?.currencies?.includes('XAU') ?? false;
      const contractSize = isCommodity ? 100 : 100000;
      cashPnl = entry.size * contractSize * diff;
    }

    // R-multiple calculations
    let rMultiple = 0;
    if (entry.stop !== null) {
      const risk = entry.side === 'long' ? entry.entry - entry.stop : entry.stop - entry.entry;
      rMultiple = risk > 0 ? diff / risk : 0;
    }

    return { pips, cashPnl, rMultiple };
  }, [entry, livePrice]);

  // Compute horizontal slider positioning for Stop Loss and IconTarget
  const sliderPosition = useMemo(() => {
    if (!livePrice || entry.stop === null || entry.target === null) return null;

    const stopPrice = entry.stop;
    const targetPrice = entry.target;

    let percentage = 0;

    if (entry.side === 'long') {
      const range = targetPrice - stopPrice;
      percentage = range > 0 ? ((livePrice - stopPrice) / range) * 100 : 50;
    } else {
      // Short
      const range = stopPrice - targetPrice;
      percentage = range > 0 ? ((stopPrice - livePrice) / range) * 100 : 50;
    }

    // Allow beyond-range values for "beyond stop/target" states
    return Math.min(Math.max(percentage, -20), 120);
  }, [entry, livePrice]);

  const sideColor = entry.side === 'long' ? 'text-bull' : 'text-bear';
  const sideBg = entry.side === 'long' ? 'bg-bull/10 border-bull/20' : 'bg-bear/10 border-bear/20';
  
  const isWin = entry.outcome === 'win' || (liveStats && liveStats.rMultiple > 0);
  const isLoss = entry.outcome === 'loss' || (liveStats && liveStats.rMultiple < 0);

  const outcomeColor = isWin ? 'text-bull' : isLoss ? 'text-bear' : 'text-fg-muted';

  return (
    <li className="border border-border bg-bg-elev-1 rounded-sm flex flex-col gap-3.5 p-4 hover:border-fg-muted/30 hover:shadow-sm transition-all duration-200">
      <div className="flex items-start gap-4">
        <div className="min-w-0 flex-1 flex flex-col gap-1.5">
          {/* Header Row */}
          <div className="flex flex-wrap items-center gap-2 text-sm font-bold tabular-nums">
            <span className={cn(
              'px-2 py-0.5 text-caption font-black uppercase tracking-wider rounded-sm border',
              sideBg,
              sideColor
            )}>
              {entry.side}
            </span>
            <span className="text-fg text-base tracking-tight">{entry.symbol}</span>
            <span className="text-fg-muted font-medium text-xs">at</span>
            <span className="text-fg font-extrabold">{entry.entry}</span>

            {/* Sizing lot indicator */}
            {entry.size !== null && (
              <span className="text-caption font-medium text-fg-subtle px-1.5 py-0.5 rounded-sm bg-bg-elev-3 border border-border/40">
                {entry.size} Lots
              </span>
            )}
          </div>

          {/* Opened & Closed Dates */}
          <p className="text-fg-subtle flex flex-wrap items-center gap-x-2 gap-y-1 text-xs font-semibold">
            <span>Opened {openedAtLabel}</span>
            {entry.closedAt && closedAtLabel && (
              <>
                <span className="text-fg-muted/50">·</span>
                <span>Closed {closedAtLabel}</span>
              </>
            )}
          </p>

          {/* Tags Strip */}
          {entry.tags && entry.tags.length > 0 && (
            <div className="flex flex-wrap gap-1 mt-1">
              {entry.tags.map((t) => (
                <span
                  key={t}
                  className="px-2 py-0.5 text-xs font-black uppercase tracking-wider rounded-sm bg-bg-elev-1 border border-border/20 text-fg"
                >
                  #{t}
                </span>
              ))}
            </div>
          )}

          {/* Screenshot thumbnail */}
          {entry.screenshotUrl && (
            <button
              type="button"
              onClick={() => { if (entry.screenshotUrl) window.open(entry.screenshotUrl, '_blank'); }}
              className="mt-1.5 inline-flex"
            >
              <Image
                src={entry.screenshotUrl}
                alt="Trade chart screenshot"
                width={48}
                height={48}
                className="size-12 rounded-sm object-cover border border-border hover:opacity-80 transition-opacity"
                unoptimized
              />
            </button>
          )}

          {/* Notes display */}
          {entry.notes && (
            <p className="text-fg-muted text-xs leading-[1.4] mt-1.5 border-l-2 border-border/70 pl-2.5 py-0.5">
              {entry.notes}
            </p>
          )}
        </div>

        {/* Action Panel / Metrics on Right Side */}
        <div className="flex shrink-0 flex-col items-end gap-2.5">
          {/* Outcome realization display */}
          {entry.outcome === 'open' ? (
            liveStats ? (
              <div className="flex flex-col items-end gap-0.5">
                {/* Live R Multiple */}
                {entry.stop !== null && (
                  <span className={cn('text-sm font-extrabold tabular-nums flex items-center gap-0.5', outcomeColor)}>
                    {liveStats.rMultiple >= 0 ? <IconArrowUpRight className="size-4" /> : <IconArrowDownRight className="size-4" />}
                    {liveStats.rMultiple >= 0 ? '+' : ''}{liveStats.rMultiple.toFixed(2)}R
                  </span>
                )}
                {/* Live cash value or Pip distance */}
                <span className="text-caption font-bold text-fg-muted tracking-wide tabular-nums">
                  {entry.size !== null 
                    ? `${liveStats.cashPnl >= 0 ? '+' : ''}$${liveStats.cashPnl.toFixed(2)}`
                    : `${liveStats.pips >= 0 ? '+' : ''}${liveStats.pips.toFixed(1)} Pips`
                  }
                </span>
              </div>
            ) : (
              <div className="flex items-center gap-1.5 text-fg font-bold text-xs animate-pulse">
                <IconPlayerPlay className="size-3 fill-brand" />
                <span>Live polling...</span>
              </div>
            )
          ) : (
            <div className="flex flex-col items-end">
              <span className={cn('text-xs font-black uppercase tracking-wider px-2 py-0.5 rounded-sm bg-bg-elev-3 border border-border/40', outcomeColor)}>
                {entry.outcome}
              </span>
              {entry.rMultiple !== null && (
                <span className={cn('text-sm font-extrabold mt-1 tabular-nums', outcomeColor)}>
                  {entry.rMultiple >= 0 ? '+' : ''}{entry.rMultiple.toFixed(2)}R
                </span>
              )}
            </div>
          )}

          {/* CTA controls */}
          <div className="flex items-center gap-1">
            {entry.outcome === 'open' && !closing && (
              <Button
                type="button"
                size="sm"
                variant="secondary"
                onClick={() => setClosing(true)}
                className="cursor-pointer"
              >
                Close...
              </Button>
            )}
            
            <Tooltip label="Delete Log">
              <button
                type="button"
                aria-label="Delete entry"
                onClick={() => void remove()}
                disabled={busy}
                className="text-bear/75 hover:text-bear hover:bg-bear/10 inline-flex size-9 items-center justify-center rounded-sm transition-colors disabled:opacity-50 cursor-pointer"
              >
                <IconTrash className="size-4" />
              </button>
            </Tooltip>
          </div>
        </div>
      </div>

      {/* Real-time Visual SL-to-TP Slider Bar */}
      {entry.outcome === 'open' && entry.stop !== null && entry.target !== null && livePrice && sliderPosition !== null && (
        <div className="border-t border-border/30 pt-3 flex flex-col gap-1.5 animate-in fade-in duration-200">
          <div className="flex items-center justify-between text-xs font-bold uppercase tracking-wider text-fg-subtle">
            <span className="text-bear">SL: {entry.stop}</span>
            <span className="text-fg-muted">Entry: {entry.entry}</span>
            <span className="text-bull">Target: {entry.target}</span>
          </div>

          <div className="relative h-2 w-full rounded-sm bg-bg-elev-3 border border-border/20 overflow-visible mt-1 flex items-center">
            {/* Entry Line Indicator */}
            <div
              style={{
                left: entry.side === 'long'
                  ? `${((entry.entry - entry.stop) / (entry.target - entry.stop)) * 100}%`
                  : `${((entry.stop - entry.entry) / (entry.stop - entry.target)) * 100}%`
              }}
              className="absolute h-4 w-0.5 bg-warn/80 z-10"
              title="Entry Price Level"
            />

            {/* Glowing Live Dot */}
            <div
              style={{ left: `${sliderPosition}%` }}
              className={cn(
                'absolute size-3 rounded-sm -translate-x-1/2 z-20 shadow-md border border-fg transition-all duration-300',
                isWin ? 'bg-bull shadow-md animate-pulse' : isLoss ? 'bg-bear shadow-md' : 'bg-fg-muted'
              )}
              title={`Live Price: ${livePrice}`}
            />

            {/* Profitable Region Shade */}
            {(() => {
              const entryPct = entry.side === 'long'
                ? ((entry.entry - entry.stop) / (entry.target - entry.stop)) * 100
                : ((entry.stop - entry.entry) / (entry.stop - entry.target)) * 100;
              const width = entry.side === 'long'
                ? sliderPosition - entryPct
                : entryPct - sliderPosition;
              const shadeLeft = entry.side === 'long'
                ? entryPct
                : sliderPosition;
              return (
                <div
                  style={{
                    left: `${Math.max(shadeLeft, 0)}%`,
                    width: `${Math.abs(Math.max(width, 0))}%`,
                  }}
                  className="absolute h-full bg-bull/10 rounded-r-full"
                />
              );
            })()}
          </div>
          <div className="flex justify-between items-center text-xs text-fg-muted font-semibold mt-0.5">
            <span className={sliderPosition < 0 ? 'text-bear font-bold' : ''}>
              {sliderPosition < 0 ? '✦ Beyond stop' : 'Stop Loss boundary'}
            </span>
            <span className={cn('font-bold', outcomeColor)}>Live Price: {livePrice}</span>
            <span className={sliderPosition > 100 ? 'text-bull font-bold' : ''}>
              {sliderPosition > 100 ? '✦ Beyond target' : 'Target boundary'}
            </span>
          </div>
        </div>
      )}

      {/* Manual close input stack */}
      {closing && (
        <div className="border-border flex flex-col gap-3 border-t pt-3">
          <div>
            <label
              className="text-fg-subtle text-caption font-bold uppercase tracking-wider"
              htmlFor={`exit-${entry.id}`}
            >
              Exit Price (Close Trade)
            </label>
            <Input
              id={`exit-${entry.id}`}
              value={exit}
              onChange={(ev) => setExit(ev.target.value)}
              inputMode="decimal"
              autoFocus
              className="mt-1.5 focus:border-border/70"
            />
            {error ? <p className="text-danger mt-2 text-xs font-semibold">{error}</p> : null}
          </div>
          <div className="flex gap-2">
            <Button
              type="button"
              size="md"
              onClick={close}
              disabled={busy || !exit}
              className="flex-1"
            >Save</Button>
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
      )}
    </li>
  );
}
