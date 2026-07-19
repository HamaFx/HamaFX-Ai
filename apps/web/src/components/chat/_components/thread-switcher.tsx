'use client';

import { useState, useMemo, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { IconSearch, IconPlus, IconLoader2, IconTrash, IconCheck } from '@tabler/icons-react';
import { toast } from 'sonner';

import { useConfirm } from '@/components/ui/confirm-drawer';
import { Drawer, DrawerContent, DrawerHeader, DrawerTitle } from '@/components/ui/drawer';
import { cn } from '@/lib/cn';
import { apiMutate } from '@/lib/api-client';
import { formatRelative } from '@/lib/format';

import type { ThreadSummary } from '../chat-top-bar';

interface ThreadSwitcherProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  threadId: string;
  threads: ThreadSummary[];
  onPickNew: () => void;
}

export function ThreadSwitcher({ open, onOpenChange, threadId, threads, onPickNew }: ThreadSwitcherProps) {
  const router = useRouter();
  const [query, setQuery] = useState('');
  // Phase A — UX_UPGRADE_PLAN.md item 5.
  // Bulk-select mode. Only enabled when there are >5 threads so
  // users with small thread lists aren't shown UI they don't need.
  const [selectMode, setSelectMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [deleting, setDeleting] = useState(false);
  const [confirmEl, confirm] = useConfirm();

  const [now, setNow] = useState(Date.now());
  // Debounced search term — prevents re-filter on every keystroke.
  const [debouncedQuery, setDebouncedQuery] = useState('');

  useEffect(() => {
    if (!open) return;
    const interval = setInterval(() => {
      setNow(Date.now());
    }, 60000);
    return () => clearInterval(interval);
  }, [open]);

  // Debounce search input (300ms)
  useEffect(() => {
    const timer = setTimeout(() => setDebouncedQuery(query), 300);
    return () => clearTimeout(timer);
  }, [query]);

  const filtered = useMemo(() => {
    const q = debouncedQuery.trim().toLowerCase();
    if (!q) return threads;
    return threads.filter((t) => (t.title ?? '').toLowerCase().includes(q));
  }, [debouncedQuery, threads]);

  const showSearch = threads.length >= 2;
  const showSelectToggle = threads.length >= 2;

  function toggleSelected(id: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function exitSelectMode() {
    setSelectMode(false);
    setSelectedIds(new Set());
  }

  async function bulkDelete() {
    if (selectedIds.size === 0 || deleting) return;
    const ids = Array.from(selectedIds);
    const ok = await confirm({
      title: `Delete ${ids.length} conversation${ids.length === 1 ? '' : 's'}?`,
      description: 'This cannot be undone.',
      confirmLabel: 'Delete',
      tone: 'danger',
    });
    if (!ok) return;
    setDeleting(true);
    try {
      const { deleted } = await apiMutate<{ deleted?: number }>('/api/chat/threads/bulk-delete', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ ids }),
      });
      toast.success(`Deleted ${deleted ?? ids.length}`);
      // If the active thread was deleted, jump to /chat (the
      // landing route will pick the next-most-recent or create
      // a fresh one). Otherwise stay put.
      if (selectedIds.has(threadId)) {
        const remaining = threads.find((t) => !selectedIds.has(t.id));
        router.push(remaining ? `/chat/${remaining.id}` : '/chat');
      } else {
        router.refresh();
      }
      exitSelectMode();
      onOpenChange(false);
    } catch (err) {
      toast.error('Bulk delete failed', {
        description: err instanceof Error ? err.message : 'unknown',
      });
    } finally {
      setDeleting(false);
    }
  }

  return (
    <Drawer
      open={open}
      onOpenChange={(v) => {
        if (!v) exitSelectMode();
        onOpenChange(v);
      }}
    >
      <DrawerContent>
        <DrawerHeader>
          <div className="flex items-center justify-between gap-2">
            <DrawerTitle>Conversations</DrawerTitle>
            {showSelectToggle ? (
              <button
                type="button"
                onClick={() => (selectMode ? exitSelectMode() : setSelectMode(true))}
                aria-pressed={selectMode}
                className="text-fg-muted hover:text-fg border-border/60 hover:bg-bg-elev-2 inline-flex h-9 items-center gap-1.5 rounded-sm border px-3 text-caption font-medium"
              >
                {selectMode ? 'Cancel' : 'Select'}
              </button>
            ) : null}
          </div>
        </DrawerHeader>

        {showSearch ? (
          <div className="px-4 pb-3">
            <label htmlFor="thread-search" className="sr-only">
              Search conversations
            </label>
            <div className="relative">
              <IconSearch
                aria-hidden="true"
                className="text-fg-subtle absolute left-3 top-1/2 size-4 -translate-y-1/2"
              />
              <input
                id="thread-search"
                type="search"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search…"
                className="bg-bg-elev-1/60 text-fg placeholder:text-fg-subtle focus:border-border border-border h-11 w-full rounded-sm border pl-10 pr-4 text-sm focus:outline-none"
              />
            </div>
          </div>
        ) : null}

        <div className="flex flex-col gap-1 px-2 pb-2">
          <button
            type="button"
            onClick={onPickNew}
            className="text-fg hover:bg-bg-elev-2 flex min-h-[56px] items-center gap-3 rounded-sm px-3 py-3 text-left text-sm font-semibold transition-colors"
          >
            <span
              aria-hidden="true"
              className="text-fg bg-bg-elev-3 inline-flex size-10 items-center justify-center rounded-sm"
            >
              <IconPlus className="size-5" />
            </span>
            New conversation
          </button>
        </div>
        <div className="border-border border-t" />
        <ul className="scrollbar-hide flex max-h-[60svh] flex-col gap-1 overflow-y-auto px-2 pb-4 pt-2">
          {filtered.length === 0 ? (
            <p className="text-fg-subtle px-3 py-4 text-center text-sm">
              {query ? 'No matches.' : 'No other conversations.'}
            </p>
          ) : (
            filtered.map((t) => {
              const isActive = t.id === threadId;
              const isSelected = selectedIds.has(t.id);
              return (
                <li key={t.id}>
                  <button
                    type="button"
                    onClick={() => {
                      if (selectMode) {
                        toggleSelected(t.id);
                        return;
                      }
                      onOpenChange(false);
                      if (!isActive) router.push(`/chat/${t.id}`);
                    }}
                    aria-pressed={selectMode ? isSelected : undefined}
                    className={cn(
                      'flex min-h-[56px] w-full items-center gap-3 rounded-sm px-3 py-3 text-left text-sm transition-colors',
                      isActive && !selectMode
                        ? 'bg-bg-elev-3 text-fg'
                        : 'text-fg-muted hover:bg-bg-elev-2 hover:text-fg',
                      isSelected && 'ring-1 ring-border bg-bg-elev-2 text-fg',
                    )}
                  >
                    {selectMode ? (
                      <span
                        aria-hidden="true"
                        className={cn(
                          'inline-flex size-5 shrink-0 items-center justify-center rounded-md border',
                          isSelected ? 'bg-fg border-border text-black' : 'border-border/80 bg-bg-elev-1',
                        )}
                      >
                        {isSelected ? (
                          <IconCheck className="size-3" strokeWidth={3} />
                        ) : null}
                      </span>
                    ) : null}
                    <div className="min-w-0 flex-1">
                      <span className="block truncate font-semibold">
                        {t.title ?? 'New conversation'}
                      </span>
                      <span className="text-fg-subtle mt-0.5 block text-body-sm tabular-nums">
                        {formatRelative(t.updatedAt, now)}
                      </span>
                    </div>
                    {t.pinnedSymbol ? (
                      <span className="bg-bg-elev-3 text-fg ring-border shrink-0 rounded-sm px-2 py-0.5 text-caption font-bold tabular-nums ring-1">
                        {t.pinnedSymbol}
                      </span>
                    ) : null}
                  </button>
                </li>
              );
            })
          )}
        </ul>

        {selectMode ? (
          <div
            role="toolbar"
            aria-label="Bulk actions"
            className="border-border bg-bg-elev-1 sticky bottom-0 flex items-center justify-between gap-2 border-t p-3"
          >
            <span className="text-fg-muted text-caption">
              {selectedIds.size} selected
            </span>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={exitSelectMode}
                className="text-fg-muted hover:text-fg border-border/60 hover:bg-bg-elev-2 inline-flex h-9 items-center rounded-sm border px-3 text-caption font-medium"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => void bulkDelete()}
                disabled={selectedIds.size === 0 || deleting}
                aria-label={`Delete ${selectedIds.size} selected conversation${selectedIds.size === 1 ? '' : 's'}`}
                className="text-danger border-danger/40 hover:bg-danger/15 inline-flex h-9 items-center gap-1.5 rounded-sm border px-3 text-caption font-semibold disabled:cursor-not-allowed disabled:opacity-50"
              >
                {deleting ? (
                  <IconLoader2 className="size-3 animate-spin" aria-hidden="true" />
                ) : (
                  <IconTrash className="size-3.5" aria-hidden="true" />
                )}
                Delete selected ({selectedIds.size})
              </button>
            </div>
          </div>
        ) : null}
        {confirmEl}
      </DrawerContent>
    </Drawer>
  );
}
