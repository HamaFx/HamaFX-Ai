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

// Chat top bar — replaces both the (app) TopBar and PageHeader for the
// chat route. Glass surface with safe-area-top padding.
//
//   [☰ menu]  [title + status + symbol pill]  [+ new chat] [⋯ more]
//
// The menu trigger uses the SAME shared <NavTrigger> as the global TopBar
// — both call into the single <NavDrawer> instance via context. There is
// only ever one drawer in the DOM, which fixes the "menu sometimes
// doesn't open" intermittent bug caused by stacked drawer instances.

import type { Symbol } from '@hamafx/shared';
import { Loader2, MessagesSquare, MoreHorizontal, Plus, Search, Sparkles, Trash2, Check, FileDown } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useEffect, useMemo, useRef, useState, useTransition } from 'react';
import { toast } from 'sonner';

import { NavTrigger } from '@/components/layout/nav-trigger';
import { useConfirm } from '@/components/ui/confirm-drawer';
import { Drawer, DrawerContent, DrawerHeader, DrawerTitle } from '@/components/ui/drawer';
import { Tooltip } from '@/components/ui/tooltip';
import { cn } from '@/lib/cn';
import { fetchCsrf } from '@/lib/csrf';
import { SymbolChip } from '@/components/ui/symbol-chip';
export interface ThreadSummary {
  id: string;
  title: string | null;
  pinnedSymbol: Symbol | null;
  updatedAt: number;
}

interface ChatTopBarProps {
  threadId: string;
  title: string;
  pinnedSymbol: Symbol | null;
  threads: ThreadSummary[];
  isStreaming: boolean;
}

export function ChatTopBar({ threadId, title, pinnedSymbol, threads, isStreaming }: ChatTopBarProps) {
  const router = useRouter();
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const [unpinning, setUnpinning] = useState(false);
  const [confirmEl, confirm] = useConfirm();
  const menuRef = useRef<HTMLDivElement>(null);

  // Click-out / escape close for the overflow menu.
  useEffect(() => {
    if (!menuOpen) return;
    function onPointerDown(e: PointerEvent) {
      if (!menuRef.current) return;
      if (!menuRef.current.contains(e.target as Node)) setMenuOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setMenuOpen(false);
    }
    window.addEventListener('pointerdown', onPointerDown);
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('pointerdown', onPointerDown);
      window.removeEventListener('keydown', onKey);
    };
  }, [menuOpen]);

  function newChat() {
    startTransition(async () => {
      try {
        const res = await fetchCsrf('/api/chat/threads', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: '{}',
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const json = (await res.json()) as { thread: { id: string } };
        router.push(`/chat/${json.thread.id}`);
      } catch (err) {
        toast.error('Failed to create chat', {
          description: err instanceof Error ? err.message : 'unknown',
        });
      }
    });
  }

  async function deleteCurrent() {
    setMenuOpen(false);
    const ok = await confirm({
      title: 'Delete this conversation?',
      description: 'Messages and tool calls in this thread will be removed permanently.',
      confirmLabel: 'Delete',
      tone: 'danger',
    });
    if (!ok) return;
    startTransition(async () => {
      try {
        const res = await fetchCsrf(`/api/chat/threads/${threadId}`, { method: 'DELETE' });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        toast.success('Deleted');
        const next = threads.find((t) => t.id !== threadId);
        if (next) router.push(`/chat/${next.id}`);
        else router.push('/chat');
      } catch (err) {
        toast.error('Delete failed', {
          description: err instanceof Error ? err.message : 'unknown',
        });
      }
    });
  }

  /**
   * Phase B — UX_UPGRADE_PLAN.md item 14.
   * Trigger a Markdown export download. The browser handles the
   * download because the route returns Content-Disposition:
   * attachment; we just open the URL in the same tab.
   */
  function exportThread() {
    setMenuOpen(false);
    // We can't POST a download via fetchCsrf and stream the result
    // back to the user as a file in a portable way across browsers.
    // Opening the URL in a new tab is the standard pattern: the
    // browser sees the Content-Disposition header and saves the
    // file instead of navigating.
    window.open(`/api/chat/threads/${threadId}/export`, '_blank', 'noopener,noreferrer');
  }

  /**
   * Phase A — UX_UPGRADE_PLAN.md item 1.
   * Clear the thread's pinnedSymbol via PATCH. The placeholder in
   * the composer updates on the next render (parent passes the
   * updated thread down via router.refresh()).
   */
  async function clearPin() {
    if (unpinning) return;
    setUnpinning(true);
    try {
      const res = await fetchCsrf(`/api/chat/threads/${threadId}`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ pinnedSymbol: null }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      toast.success('Pin cleared');
      router.refresh();
    } catch (err) {
      toast.error('Could not clear pin', {
        description: err instanceof Error ? err.message : 'unknown',
      });
    } finally {
      setUnpinning(false);
    }
  }

  return (
    <header
      className={cn(
        'sticky top-0 z-30 flex justify-center pointer-events-none transition-all duration-300',
        'pt-[calc(env(safe-area-inset-top)+12px)] px-3 pb-2',
      )}
    >
      <div
        className={cn(
          'glass-strong pointer-events-auto flex w-full max-w-[600px] items-center gap-1 rounded-full px-2 shadow-lg',
        )}
        style={{
          height: 'var(--topbar-h)',
          boxShadow: 'var(--shadow-inset-edge-soft), 0 8px 32px -8px oklch(78% 0.16 85 / 0.15)',
        }}
      >
        <NavTrigger />

        {/* Center "Dynamic Island": Encapsulates title + status */}
        <div className="flex min-w-0 flex-1 items-center justify-center">
          <div className="bg-bg-elev-1/40 ring-divider/50 shadow-sm backdrop-blur-md flex max-w-[90%] flex-col items-center justify-center rounded-full px-4 py-1 ring-1">
            <div className="flex max-w-full items-center gap-1.5">
              <h1 className="text-fg truncate text-body-sm font-semibold tracking-tight">{title}</h1>
              {pinnedSymbol ? (
                <SymbolChip
                  symbol={pinnedSymbol}
                  clearing={unpinning}
                  onClear={() => void clearPin()}
                />
              ) : null}
            </div>
            <p className="text-fg-subtle text-caption tabular-nums">
              {isStreaming ? (
                <span className="text-brand inline-flex items-center gap-1 font-medium">
                  <Sparkles className="size-2.5 animate-pulse" /> thinking…
                </span>
              ) : (
                'HamaFX-Ai copilot'
              )}
            </p>
          </div>
        </div>

        <Tooltip label="New chat" side="bottom">
          <button
            type="button"
            onClick={newChat}
            disabled={pending}
            aria-label="New chat"
            className="text-fg-muted hover:text-fg hover:bg-bg-elev-2 active:bg-bg-elev-3 inline-flex size-11 shrink-0 items-center justify-center rounded-full transition-colors disabled:opacity-50"
          >
            {pending ? <Loader2 className="size-5 animate-spin" /> : <Plus className="size-5" />}
          </button>
        </Tooltip>

        <div className="relative" ref={menuRef}>
          <button
            type="button"
            onClick={() => setMenuOpen((v) => !v)}
            aria-label="Conversation menu"
            aria-expanded={menuOpen}
            aria-haspopup="menu"
            className="text-fg-muted hover:text-fg hover:bg-bg-elev-2 active:bg-bg-elev-3 inline-flex size-11 shrink-0 items-center justify-center rounded-full transition-colors"
          >
            <MoreHorizontal className="size-5" />
          </button>
          {menuOpen ? (
            <div
              role="menu"
              className="glass-strong absolute right-0 top-12 z-50 w-56 overflow-hidden rounded-xl text-body-sm"
            >
              <button
                role="menuitem"
                type="button"
                onClick={() => {
                  setMenuOpen(false);
                  setDrawerOpen(true);
                }}
                className="text-fg hover:bg-bg-elev-2 flex min-h-[48px] w-full items-center gap-2 px-4 py-3 text-left"
              >
                <MessagesSquare className="size-4" />
                Switch conversation
              </button>
              <div className="border-divider/60 border-t" />
              <button
                role="menuitem"
                type="button"
                onClick={exportThread}
                className="text-fg hover:bg-bg-elev-2 flex min-h-[48px] w-full items-center gap-2 px-4 py-3 text-left"
              >
                <FileDown className="size-4" />
                Export as Markdown
              </button>
              <div className="border-divider/60 border-t" />
              <button
                role="menuitem"
                type="button"
                onClick={() => void deleteCurrent()}
                className="text-bear hover:bg-bear/10 flex min-h-[48px] w-full items-center gap-2 px-4 py-3 text-left"
              >
                <Trash2 className="size-4" />
                Delete conversation
              </button>
            </div>
          ) : null}
        </div>
      </div>

      <ThreadSwitcher
        open={drawerOpen}
        onOpenChange={setDrawerOpen}
        threadId={threadId}
        threads={threads}
        onPickNew={() => {
          setDrawerOpen(false);
          newChat();
        }}
      />

      {confirmEl}
    </header>
  );
}

// ---------------------------------------------------------------------------

interface ThreadSwitcherProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  threadId: string;
  threads: ThreadSummary[];
  onPickNew: () => void;
}

function ThreadSwitcher({ open, onOpenChange, threadId, threads, onPickNew }: ThreadSwitcherProps) {
  const router = useRouter();
  const [query, setQuery] = useState('');
  // Phase A — UX_UPGRADE_PLAN.md item 5.
  // Bulk-select mode. Only enabled when there are >5 threads so
  // users with small thread lists aren't shown UI they don't need.
  const [selectMode, setSelectMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [deleting, setDeleting] = useState(false);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return threads;
    return threads.filter((t) => (t.title ?? '').toLowerCase().includes(q));
  }, [query, threads]);

  const showSearch = threads.length > 5;
  const showSelectToggle = threads.length > 5;

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
    const ok = window.confirm(
      `Delete ${ids.length} conversation${ids.length === 1 ? '' : 's'}? This cannot be undone.`,
    );
    if (!ok) return;
    setDeleting(true);
    try {
      const res = await fetchCsrf('/api/chat/threads/bulk-delete', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ ids }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = (await res.json()) as { deleted?: number };
      toast.success(`Deleted ${json.deleted ?? ids.length}`);
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
                className="text-fg-muted hover:text-fg border-divider/60 hover:bg-bg-elev-2 inline-flex h-9 items-center gap-1.5 rounded-full border px-3 text-caption font-medium"
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
              <Search
                aria-hidden="true"
                className="text-fg-subtle absolute left-3 top-1/2 size-4 -translate-y-1/2"
              />
              <input
                id="thread-search"
                type="search"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search…"
                className="bg-bg-elev-1/60 text-fg placeholder:text-fg-subtle focus:border-brand/60 border-divider h-11 w-full rounded-xl border pl-10 pr-4 text-sm focus:outline-none"
              />
            </div>
          </div>
        ) : null}

        <div className="flex flex-col gap-1 px-2 pb-2">
          <button
            type="button"
            onClick={onPickNew}
            className="text-fg hover:bg-bg-elev-2 flex min-h-[56px] items-center gap-3 rounded-xl px-3 py-3 text-left text-sm font-semibold transition-colors"
          >
            <span
              aria-hidden="true"
              className="text-brand inline-flex size-10 items-center justify-center rounded-xl"
              style={{ background: 'oklch(82% 0.14 85 / 0.18)' }}
            >
              <Plus className="size-5" />
            </span>
            New conversation
          </button>
        </div>
        <div className="border-divider border-t" />
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
                      'flex min-h-[56px] w-full items-center gap-3 rounded-xl px-3 py-3 text-left text-sm transition-colors',
                      isActive && !selectMode
                        ? 'bg-bg-elev-3 text-fg'
                        : 'text-fg-muted hover:bg-bg-elev-2 hover:text-fg',
                      isSelected && 'ring-1 ring-brand/40 bg-brand/10 text-fg',
                    )}
                  >
                    {selectMode ? (
                      <span
                        aria-hidden="true"
                        className={cn(
                          'inline-flex size-5 shrink-0 items-center justify-center rounded-md border',
                          isSelected ? 'bg-brand border-brand text-bg' : 'border-divider/80 bg-bg-elev-1',
                        )}
                      >
                        {isSelected ? (
                          <Check className="size-3" strokeWidth={3} />
                        ) : null}
                      </span>
                    ) : null}
                    <div className="min-w-0 flex-1">
                      <span className="block truncate font-semibold">
                        {t.title ?? 'New conversation'}
                      </span>
                      <span className="text-fg-subtle mt-0.5 block text-body-sm tabular-nums">
                        {formatRelative(t.updatedAt)}
                      </span>
                    </div>
                    {t.pinnedSymbol ? (
                      <span className="bg-brand/15 text-brand ring-brand/30 shrink-0 rounded-full px-2 py-0.5 text-caption font-bold tabular-nums ring-1">
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
            className="border-divider bg-bg-elev-1 sticky bottom-0 flex items-center justify-between gap-2 border-t p-3"
          >
            <span className="text-fg-muted text-caption">
              {selectedIds.size} selected
            </span>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={exitSelectMode}
                className="text-fg-muted hover:text-fg border-divider/60 hover:bg-bg-elev-2 inline-flex h-9 items-center rounded-full border px-3 text-caption font-medium"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => void bulkDelete()}
                disabled={selectedIds.size === 0 || deleting}
                aria-label={`Delete ${selectedIds.size} selected conversation${selectedIds.size === 1 ? '' : 's'}`}
                className="text-bear border-bear/40 hover:bg-bear/15 inline-flex h-9 items-center gap-1.5 rounded-full border px-3 text-caption font-semibold disabled:cursor-not-allowed disabled:opacity-50"
              >
                {deleting ? (
                  <Loader2 className="size-3 animate-spin" aria-hidden="true" />
                ) : (
                  <Trash2 className="size-3.5" aria-hidden="true" />
                )}
                Delete selected ({selectedIds.size})
              </button>
            </div>
          </div>
        ) : null}
      </DrawerContent>
    </Drawer>
  );
}

function formatRelative(ms: number): string {
  const diff = Date.now() - ms;
  const min = Math.round(diff / 60_000);
  if (min < 1) return 'just now';
  if (min < 60) return `${min}m ago`;
  const hr = Math.round(min / 60);
  if (hr < 24) return `${hr}h ago`;
  const day = Math.round(hr / 24);
  return `${day}d ago`;
}
