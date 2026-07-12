'use client';

import {IconDownload, IconUpload, IconX, IconFileSpreadsheet} from '@tabler/icons-react';
import { useState } from 'react';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
import { cn } from '@/lib/cn';
import { getCsrfToken } from '@/lib/csrf';

interface ParsedTrade {
  symbol: string;
  side: 'long' | 'short';
  entry: number;
  stop: number | null;
  target: number | null;
  exit: number | null;
  size: number | null;
  openedAt: number;
  closedAt: number | null;
  notes: string | null;
}

export function ImportTrades({ onImported }: { onImported?: () => void }) {
  const [open, setOpen] = useState(false);
  const [parsed, setParsed] = useState<ParsedTrade[] | null>(null);
  const [importing, setImporting] = useState(false);

  function parseCSV(text: string): ParsedTrade[] {
    const lines = text.split('\n').map((l) => l.trim()).filter(Boolean);
    const results: ParsedTrade[] = [];

    for (const line of lines) {
      const cols = line.split(',').map((c) => c.trim());
      if (cols.length < 4) continue;
      const symbol = cols[0]!.toUpperCase();
      if (!['XAUUSD', 'EURUSD', 'GBPUSD'].includes(symbol)) continue;
      const side = cols[1]!.toLowerCase() === 'sell' ? 'short' : 'long';
      const entry = Number(cols[2]);
      if (!Number.isFinite(entry) || entry <= 0) continue;
      const openedAt = cols[3] ? new Date(cols[3]).getTime() : Date.now();
      if (!Number.isFinite(openedAt)) continue;
      const exit = cols[4] ? Number(cols[4]) : null;
      const stop = cols[5] ? Number(cols[5]) : null;
      const target = cols[6] ? Number(cols[6]) : null;
      const size = cols[7] ? Number(cols[7]) : null;
      // Parse closedAt if present (column 8: closed date)
      const closedAtRaw = cols[8] ? new Date(cols[8]).getTime() : NaN;
      const closedAt = Number.isFinite(closedAtRaw) ? closedAtRaw : null;
      const notesRaw = cols[9]?.trim() || null;

      results.push({
        symbol,
        side,
        entry,
        stop: stop && Number.isFinite(stop) ? stop : null,
        target: target && Number.isFinite(target) ? target : null,
        exit: exit && Number.isFinite(exit) ? exit : null,
        size: size && Number.isFinite(size) ? size : null,
        openedAt: Number.isFinite(openedAt) ? openedAt : Date.now(),
        closedAt,
        notes: notesRaw,
      });
    }

    return results;
  }

  function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const text = reader.result as string;
      const trades = parseCSV(text);
      if (trades.length === 0) {
        toast.error('No valid trades found in file');
        return;
      }
      setParsed(trades);
    };
    reader.readAsText(file);
  }

  async function handleImport() {
    if (!parsed || parsed.length === 0) return;
    setImporting(true);
    try {
      const csrf = getCsrfToken();
      const headers: Record<string, string> = { 'content-type': 'application/json' };
      if (csrf) headers['X-CSRF-Token'] = csrf;
      const res = await fetch('/api/journal/import', {
        method: 'POST',
        headers,
        body: JSON.stringify({ trades: parsed }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = (await res.json()) as { count: number };
      toast.success(`Imported ${data.count} trades`);
      setParsed(null);
      setOpen(false);
      onImported?.();
    } catch (err) {
      toast.error('Import failed', {
        description: err instanceof Error ? err.message : 'Unknown error',
      });
    } finally {
      setImporting(false);
    }
  }

  return (
    <>
      <Button
        type="button"
        variant="secondary"
        size="sm"
        onClick={() => setOpen(true)}
        className="self-start"
      >
        <IconDownload className="mr-1 size-4" />
        Import trades
      </Button>

      {open && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/60">
          <div className="w-full sm:max-w-lg rounded-sm bg-bg-elev-1 border border-border p-6 flex flex-col gap-4 max-h-[80vh] overflow-y-auto">
            <div className="flex items-center justify-between">
              <h3 className="text-base font-semibold text-fg">Import trades</h3>
              <button
                type="button"
                onClick={() => { setOpen(false); setParsed(null); }}
                className="text-fg-muted hover:text-fg"
              >
                <IconX className="size-5" />
              </button>
            </div>

            {!parsed ? (
              <div className="flex flex-col gap-3">
                <p className="text-sm text-fg-subtle">
                  Upload a CSV file with columns:{' '}
                  <code className="text-xs text-fg">symbol, side, entry, date, exit, stop, target, size, closedDate?, notes?</code>
                </p>
                <label className="flex items-center justify-center gap-2 rounded-sm border border-dashed border-border p-6 text-sm text-fg-subtle hover:border-border hover:text-fg transition-colors cursor-pointer">
                  <IconUpload className="size-5" />
                  Choose CSV file
                  <input
                    type="file"
                    accept=".csv,.xlsx,.html"
                    onChange={handleFile}
                    className="sr-only"
                  />
                </label>
              </div>
            ) : (
              <div className="flex flex-col gap-3">
                <div className="flex items-center gap-2 text-sm text-fg">
                  <IconFileSpreadsheet className="size-4 text-fg" />
                  <span className="font-medium">{parsed.length} trades parsed</span>
                </div>
                <div className="max-h-48 overflow-y-auto border border-border rounded-sm">
                  <table className="w-full text-xs tabular-nums">
                    <thead>
                      <tr className="bg-bg-elev-2 text-fg-subtle">
                        <th className="text-left p-2">Symbol</th>
                        <th className="text-left p-2">Side</th>
                        <th className="text-right p-2">Entry</th>
                        <th className="text-right p-2">Exit</th>
                      </tr>
                    </thead>
                    <tbody>
                      {parsed.slice(0, 20).map((t, i) => (
                        <tr key={i} className="border-t border-border">
                          <td className="p-2 text-fg">{t.symbol}</td>
                          <td className={cn('p-2', t.side === 'long' ? 'text-bull' : 'text-bear')}>{t.side}</td>
                          <td className="p-2 text-right text-fg">{t.entry}</td>
                          <td className="p-2 text-right text-fg">{t.exit ?? '—'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  {parsed.length > 20 && (
                    <p className="p-2 text-center text-xs text-fg-subtle">
                      … and {parsed.length - 20} more
                    </p>
                  )}
                </div>
                <div className="flex gap-3">
                  <Button variant="secondary" className="flex-1" onClick={() => setParsed(null)}>
                    Choose different file
                  </Button>
                  <Button className="flex-1" onClick={handleImport} loading={importing} disabled={importing}>
                    Import {parsed.length} trades
                  </Button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </>
  );
}
