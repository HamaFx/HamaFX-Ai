'use client';

import { useState, useMemo, useRef, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  ArrowDown,
  ArrowUp,
  Download,
  Plus,
  Search,
  Trash,
  Upload,
} from 'lucide-react';
import { toast } from 'sonner';
import { usePrices } from '@/hooks/use-prices';

interface SymbolItem {
  symbol: string;
  name?: string;
  category?: string;
  displayOrder: number;
}

interface SymbolCatalogItem {
  symbol: string;
  name: string;
  category: string;
  isActive: boolean | null;
  sortOrder: number | null;
}

interface SymbolsFormProps {
  initialSymbols: SymbolItem[];
  catalog: SymbolCatalogItem[];
}

export function SymbolsForm({ initialSymbols, catalog }: SymbolsFormProps) {
  const [watchlist, setWatchlist] = useState<SymbolItem[]>(initialSymbols);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [watchlistSearch, setWatchlistSearch] = useState('');
  const [catalogSearch, setCatalogSearch] = useState('');
  const [activeCategory, setActiveCategory] = useState<string>('all');
  const [bulkInput, setBulkInput] = useState('');
  const [isBulkAdding, setIsBulkAdding] = useState(false);
  const [catalogPage, setCatalogPage] = useState(0);
  const CATALOG_PAGE_SIZE = 20;
  
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  // Poll prices for all items in the watchlist
  const watchlistSymbols = useMemo(() => watchlist.map((w) => w.symbol), [watchlist]);
  const { data: ticks } = usePrices(watchlistSymbols);

  const priceMap = useMemo(() => {
    const map = new Map<string, number>();
    if (ticks) {
      for (const t of ticks) {
        map.set(t.symbol, t.mid);
      }
    }
    return map;
  }, [ticks]);

  // Filtered watchlist symbols
  const filteredWatchlist = useMemo(() => {
    return watchlist.filter((item) => {
      const q = watchlistSearch.toLowerCase().trim();
      if (!q) return true;
      return (
        item.symbol.toLowerCase().includes(q) ||
        (item.name && item.name.toLowerCase().includes(q))
      );
    });
  }, [watchlist, watchlistSearch]);

  // Catalog items not in the watchlist
  const availableCatalog = useMemo(() => {
    const watchlistSet = new Set(watchlist.map((w) => w.symbol));
    return catalog.filter((item) => !watchlistSet.has(item.symbol) && item.isActive);
  }, [catalog, watchlist]);

  // Filtered catalog items
  const filteredCatalog = useMemo(() => {
    return availableCatalog.filter((item) => {
      if (activeCategory !== 'all' && item.category !== activeCategory) {
        return false;
      }
      const q = catalogSearch.toLowerCase().trim();
      if (!q) return true;
      return (
        item.symbol.toLowerCase().includes(q) ||
        item.name.toLowerCase().includes(q)
      );
    });
  }, [availableCatalog, activeCategory, catalogSearch]);

  const totalPages = Math.max(1, Math.ceil(filteredCatalog.length / CATALOG_PAGE_SIZE));
  const paginatedCatalog = useMemo(() => {
    const start = catalogPage * CATALOG_PAGE_SIZE;
    return filteredCatalog.slice(start, start + CATALOG_PAGE_SIZE);
  }, [filteredCatalog, catalogPage]);

  // Reset to first page when filters change
  useEffect(() => {
    setCatalogPage(0);
  }, [activeCategory, catalogSearch]);

  const handleToggleSelect = (symbol: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(symbol)) {
        next.delete(symbol);
      } else {
        next.add(symbol);
      }
      return next;
    });
  };

  const handleToggleSelectAll = () => {
    if (selected.size === filteredWatchlist.length) {
      setSelected(new Set());
    } else {
      setSelected(new Set(filteredWatchlist.map((w) => w.symbol)));
    }
  };

  const moveItem = async (index: number, direction: 'up' | 'down') => {
    const newIndex = direction === 'up' ? index - 1 : index + 1;
    if (newIndex < 0 || newIndex >= watchlist.length) return;

    const newList = [...watchlist];
    const temp = newList[index]!;
    newList[index] = newList[newIndex]!;
    newList[newIndex] = temp;

    // Optimistic update
    setWatchlist(newList);

    try {
      const res = await fetch('/api/settings/symbols', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ symbols: newList.map((s) => s.symbol) }),
      });
      if (!res.ok) throw new Error();
    } catch {
      toast.error('Failed to update symbol order');
      // Rollback
      setWatchlist(watchlist);
    }
  };

  const handleAdd = async (symbol: string) => {
    const normalized = symbol.trim().toUpperCase();
    if (!normalized) return;

    if (watchlist.some((s) => s.symbol === normalized)) {
      toast.error(`${normalized} is already in your watchlist`);
      return;
    }

    const catalogItem = catalog.find((c) => c.symbol === normalized);
    if (!catalogItem) {
      toast.error(`${normalized} is not supported in the active catalog`);
      return;
    }

    const newItem: SymbolItem = {
      symbol: normalized,
      name: catalogItem.name,
      category: catalogItem.category,
      displayOrder: watchlist.length,
    };

    const originalList = [...watchlist];
    setWatchlist((prev) => [...prev, newItem]);

    try {
      const res = await fetch('/api/settings/symbols', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ symbol: normalized }),
      });
      if (!res.ok) throw new Error();
      toast.success(`${normalized} added to watchlist`);
    } catch {
      toast.error(`Failed to add ${normalized}`);
      setWatchlist(originalList);
    }
  };

  const handleRemove = async (symbol: string) => {
    const originalList = [...watchlist];
    setWatchlist((prev) => prev.filter((s) => s.symbol !== symbol));
    setSelected((prev) => {
      const next = new Set(prev);
      next.delete(symbol);
      return next;
    });

    try {
      const res = await fetch(`/api/settings/symbols/${symbol}`, {
        method: 'DELETE',
      });
      if (!res.ok) throw new Error();
      toast.success(`${symbol} removed from watchlist`);
    } catch {
      toast.error(`Failed to remove ${symbol}`);
      setWatchlist(originalList);
    }
  };

  const handleBulkDelete = async () => {
    if (selected.size === 0) return;
    const toDelete = Array.from(selected);
    const originalList = [...watchlist];

    setWatchlist((prev) => prev.filter((s) => !selected.has(s.symbol)));
    setSelected(new Set());

    try {
      const promises = toDelete.map((sym) =>
        fetch(`/api/settings/symbols/${sym}`, { method: 'DELETE' })
      );
      await Promise.all(promises);
      toast.success(`Successfully removed ${toDelete.length} symbols`);
    } catch {
      toast.error('Failed to complete some symbol removals');
      setWatchlist(originalList);
    }
  };

  const handleBulkAdd = async () => {
    const symbols = bulkInput
      .split(/[\s,]+/)
      .map((s) => s.trim().toUpperCase())
      .filter((s) => s.length > 0);

    if (symbols.length === 0) return;

    setIsBulkAdding(true);
    let successCount = 0;

    for (const sym of symbols) {
      const catalogItem = catalog.find((c) => c.symbol === sym);
      if (catalogItem && !watchlist.some((w) => w.symbol === sym)) {
        try {
          const res = await fetch('/api/settings/symbols', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ symbol: sym }),
          });
          if (res.ok) {
            setWatchlist((prev) => [
              ...prev,
              {
                symbol: sym,
                name: catalogItem.name,
                category: catalogItem.category,
                displayOrder: prev.length,
              },
            ]);
            successCount++;
          }
        } catch {
          console.warn(`[settings] failed to bulk-add symbol ${sym}`);
        }
      }
    }

    toast.success(`Bulk added ${successCount} symbols to watchlist`);
    setBulkInput('');
    setIsBulkAdding(false);
  };

  const handleExport = () => {
    if (watchlist.length === 0) {
      toast.error('Watchlist is empty');
      return;
    }
    const csvContent = 'data:text/csv;charset=utf-8,' + watchlist.map((e) => e.symbol).join(',');
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute('download', 'hamafx_watchlist.csv');
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    toast.success('Watchlist exported successfully');
  };

  const handleImport = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = async (event) => {
      const content = event.target?.result as string;
      const symbols = content
        .split(/[\s,]+/)
        .map((s) => s.trim().toUpperCase())
        .filter((s) => s.length > 0);

      if (symbols.length === 0) {
        toast.error('No valid symbols found in CSV');
        return;
      }

      let successCount = 0;
      for (const sym of symbols) {
        const catalogItem = catalog.find((c) => c.symbol === sym);
        if (catalogItem && !watchlist.some((w) => w.symbol === sym)) {
          try {
            const res = await fetch('/api/settings/symbols', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ symbol: sym }),
            });
            if (res.ok) {
              setWatchlist((prev) => [
                ...prev,
                {
                  symbol: sym,
                  name: catalogItem.name,
                  category: catalogItem.category,
                  displayOrder: prev.length,
                },
              ]);
              successCount++;
            }
          } catch {
            console.warn(`[settings] failed to import symbol ${sym}`);
          }
        }
      }
      toast.success(`Imported ${successCount} symbols successfully`);
    };
    reader.readAsText(file);
    e.target.value = ''; // Reset input
  };

  return (
    <div className="flex flex-col gap-6 font-sans">
      {/* Watchlist Section */}
      <div className="border border-divider bg-bg-elev-1 rounded-xl p-4 flex flex-col gap-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <h3 className="font-semibold text-fg text-sm uppercase tracking-wider">Your Watchlist</h3>
          
          <div className="flex items-center gap-2">
            <Button
              variant="ghost"
              size="sm"
              onClick={handleExport}
              className="text-fg-subtle hover:text-fg h-8 text-xs gap-1.5 cursor-pointer"
            >
              <Download className="size-3.5" /> Export
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => fileInputRef.current?.click()}
              className="text-fg-subtle hover:text-fg h-8 text-xs gap-1.5 cursor-pointer"
            >
              <Upload className="size-3.5" /> Import
            </Button>
            <input
              type="file"
              ref={fileInputRef}
              onChange={handleImport}
              accept=".csv"
              className="hidden"
            />
          </div>
        </div>

        {/* Watchlist Search */}
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-fg-muted" />
          <Input
            value={watchlistSearch}
            onChange={(e) => setWatchlistSearch(e.target.value)}
            placeholder="Search watchlist symbols..."
            className="pl-9 bg-bg h-9 text-sm"
          />
        </div>

        {/* Watchlist Table/List */}
        <div className="flex flex-col gap-2">
          {filteredWatchlist.length > 0 && (
            <div className="flex items-center justify-between px-3 py-1.5 text-caption text-fg-subtle border-b border-divider/60">
              <div className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={selected.size === filteredWatchlist.length && filteredWatchlist.length > 0}
                  onChange={handleToggleSelectAll}
                  aria-label="Select all symbols"
                  className="rounded border-divider bg-bg text-brand focus:ring-brand size-3.5 cursor-pointer"
                />
                <span>Select All</span>
              </div>
              {selected.size > 0 && (
                <button
                  type="button"
                  onClick={handleBulkDelete}
                  className="text-bear font-semibold hover:underline flex items-center gap-1 cursor-pointer"
                >
                  <Trash className="size-3" /> Remove Selected ({selected.size})
                </button>
              )}
            </div>
          )}

          <ul className="flex flex-col gap-1.5 max-h-96 overflow-y-auto pr-1">
            {filteredWatchlist.map((item, index) => {
              const price = priceMap.get(item.symbol);
              const decimals = item.symbol === 'XAUUSD' ? 2 : 5;
              const isSelected = selected.has(item.symbol);

              return (
                <li
                  key={item.symbol}
                  className={`flex items-center justify-between p-3 rounded-lg border transition-all ${
                    isSelected
                      ? 'bg-brand/5 border-brand/40 shadow-glow-brand/5'
                      : 'bg-surface border-surface-elevated hover:border-fg-subtle/30'
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <input
                      type="checkbox"
                      checked={isSelected}
                      onChange={() => handleToggleSelect(item.symbol)}
                      aria-label={`Select ${item.symbol}`}
                      className="rounded border-divider bg-bg text-brand focus:ring-brand size-3.5 cursor-pointer"
                    />
                    <div className="flex flex-col">
                      <div className="flex items-baseline gap-2">
                        <span className="font-mono text-sm font-semibold text-fg">{item.symbol}</span>
                        <span className="text-[10px] uppercase font-mono px-1 rounded bg-bg-elev-2 text-fg-subtle border border-divider">
                          {item.category}
                        </span>
                      </div>
                      <span className="text-caption text-fg-subtle">{item.name}</span>
                    </div>
                  </div>

                  <div className="flex items-center gap-3">
                    {/* Live price tag */}
                    <div className="flex flex-col items-end">
                      <span className="font-mono text-xs font-semibold text-fg">
                        {price !== undefined ? price.toFixed(decimals) : '—'}
                      </span>
                      {price !== undefined && (
                        <span className="text-[9px] text-fg-muted uppercase tracking-wider">Live</span>
                      )}
                    </div>

                    <div className="flex items-center border border-divider/60 rounded-md bg-bg">
                      <button
                        type="button"
                        onClick={() => moveItem(index, 'up')}
                        disabled={index === 0}
                        aria-label="Move symbol up"
                        className="p-1 text-fg-subtle hover:text-fg disabled:opacity-30 disabled:hover:text-fg-subtle cursor-pointer"
                      >
                        <ArrowUp className="size-3.5" />
                      </button>
                      <div className="w-px h-3.5 bg-divider/60" />
                      <button
                        type="button"
                        onClick={() => moveItem(index, 'down')}
                        disabled={index === watchlist.length - 1}
                        aria-label="Move symbol down"
                        className="p-1 text-fg-subtle hover:text-fg disabled:opacity-30 disabled:hover:text-fg-subtle cursor-pointer"
                      >
                        <ArrowDown className="size-3.5" />
                      </button>
                    </div>

                    <button
                      type="button"
                      onClick={() => handleRemove(item.symbol)}
                      aria-label={`Remove ${item.symbol} from watchlist`}
                      className="p-1.5 text-fg-subtle hover:text-bear hover:bg-bear/10 rounded-md transition-colors cursor-pointer"
                    >
                      <Trash className="size-3.5" />
                    </button>
                  </div>
                </li>
              );
            })}

            {filteredWatchlist.length === 0 && (
              <div className="text-center p-8 text-sm text-fg-subtle">
                {watchlistSearch
                  ? 'No symbols found matching your search.'
                  : 'Your watchlist is empty. Add symbols from the catalog below.'}
              </div>
            )}
          </ul>
        </div>
      </div>

      {/* Catalog / Suggestions Section */}
      <div className="border border-divider bg-bg-elev-1 rounded-xl p-4 flex flex-col gap-4">
        <h3 className="font-semibold text-fg text-sm uppercase tracking-wider">Available Symbol Catalog</h3>

        {/* Category Tabs */}
        <div className="flex bg-bg-elev-2 p-0.5 rounded-lg border border-divider overflow-x-auto scrollbar-none">
          {['all', 'forex', 'metals', 'crypto', 'indices'].map((cat) => (
            <button
              key={cat}
              type="button"
              onClick={() => setActiveCategory(cat)}
              className={`px-3 py-1.5 text-xs font-semibold rounded-md transition-all cursor-pointer shrink-0 uppercase tracking-wide ${
                activeCategory === cat
                  ? 'bg-bg-elev-1 text-fg shadow-sm'
                  : 'text-fg-muted hover:text-fg'
              }`}
            >
              {cat}
            </button>
          ))}
        </div>

        {/* Catalog Search & Bulk Add */}
        <div className="flex flex-col sm:flex-row gap-2">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-fg-muted" />
            <Input
              value={catalogSearch}
              onChange={(e) => setCatalogSearch(e.target.value)}
              placeholder="Search catalog by symbol or name..."
              className="pl-9 bg-bg h-9 text-sm"
            />
          </div>
          
          <div className="flex gap-2">
            <Input
              value={bulkInput}
              onChange={(e) => setBulkInput(e.target.value)}
              placeholder="Bulk symbols (comma separated)"
              className="bg-bg h-9 text-sm w-44"
            />
            <Button
              type="button"
              onClick={handleBulkAdd}
              disabled={isBulkAdding || !bulkInput.trim()}
              className="h-9 px-3 text-xs gap-1 cursor-pointer"
            >
              <Plus className="size-3.5" /> Bulk Add
            </Button>
          </div>
        </div>

        {/* Available Symbols List */}
        <ul className="grid grid-cols-1 sm:grid-cols-2 gap-2 min-h-[120px] pr-1">
          {paginatedCatalog.map((item) => (
            <li
              key={item.symbol}
              className="flex items-center justify-between p-3 rounded-lg border border-surface-elevated bg-surface hover:border-fg-subtle/30"
            >
              <div className="flex flex-col">
                <div className="flex items-baseline gap-2">
                  <span className="font-mono text-sm font-semibold text-fg">{item.symbol}</span>
                  <span className="text-[9px] uppercase font-mono px-1 rounded bg-bg-elev-2 text-fg-subtle border border-divider">
                    {item.category}
                  </span>
                </div>
                <span className="text-caption text-fg-subtle line-clamp-1">{item.name}</span>
              </div>

              <Button
                variant="secondary"
                size="sm"
                onClick={() => handleAdd(item.symbol)}
                className="h-8 w-8 p-0 cursor-pointer text-fg-subtle hover:text-brand"
                aria-label={`Add ${item.symbol} to watchlist`}
              >
                <Plus className="size-4" />
              </Button>
            </li>
          ))}

          {filteredCatalog.length === 0 && (
            <div className="col-span-full text-center p-6 text-sm text-fg-subtle">
              No matching available symbols found in the catalog.
            </div>
          )}
        </ul>

        {filteredCatalog.length > CATALOG_PAGE_SIZE && (
          <div className="flex items-center justify-between pt-2 border-t border-divider/60">
            <span className="text-caption text-fg-muted">
              {filteredCatalog.length} symbols
            </span>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setCatalogPage((p) => Math.max(0, p - 1))}
                disabled={catalogPage === 0}
                className="px-2.5 py-1 text-xs font-medium rounded-md border border-divider bg-bg-elev-1 text-fg-subtle hover:text-fg hover:border-divider disabled:opacity-30 disabled:cursor-not-allowed cursor-pointer"
              >
                Previous
              </button>
              <span className="text-caption text-fg-muted tabular-nums">
                Page {catalogPage + 1} of {totalPages}
              </span>
              <button
                type="button"
                onClick={() => setCatalogPage((p) => Math.min(totalPages - 1, p + 1))}
                disabled={catalogPage >= totalPages - 1}
                className="px-2.5 py-1 text-xs font-medium rounded-md border border-divider bg-bg-elev-1 text-fg-subtle hover:text-fg hover:border-divider disabled:opacity-30 disabled:cursor-not-allowed cursor-pointer"
              >
                Next
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

