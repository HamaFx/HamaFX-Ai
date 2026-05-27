'use client';

// Chat top bar — replaces both the (app) TopBar and PageHeader for the
// chat route. Glass surface with safe-area-top padding.
//
//   [☰ menu]   [title + status + symbol pill]   [+ new chat] [⋯ more]
//
// The menu trigger opens the global <NavDrawer> (same as the rest of the
// app). The thread switcher moved to the overflow menu so the top bar
// keeps a calm 4-button layout instead of crowding 5+.

import type { Symbol } from '@hamafx/shared';
import {
  Loader2,
  MessagesSquare,
  MoreHorizontal,
  Plus,
  Search,
  Sparkles,
  Trash2,
} from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useMemo, useState, useTransition } from 'react';
import { toast } from 'sonner';

import { NavDrawer } from '@/components/layout/nav-drawer';
import { useConfirm } from '@/components/ui/confirm-drawer';
import {
  Drawer,
  DrawerContent,
  DrawerHeader,
  DrawerTitle,
} from '@/components/ui/drawer';
import { Tooltip } from '@/components/ui/tooltip';
import { cn } from '@/lib/cn';

import { NavTrigger } from './nav-trigger';

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

export function ChatTopBar({
  threadId,
  title,
  pinnedSymbol,
  threads,
  isStreaming,
}: ChatTopBarProps) {
  const router = useRouter();
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const [confirmEl, confirm] = useConfirm();

  function newChat() {
    startTransition(async () => {
      try {
        const res = await fetch('/api/chat/threads', {
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
        const res = await fetch(`/api/chat/threads/${threadId}`, { method: 'DELETE' });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        toast.success('Deleted');
        const next = threads.find((t) => t.id !== threadId);
        if (next) {
          router.push(`/chat/${next.id}`);
        } else {
          router.push('/chat');
        }
      } catch (err) {
        toast.error('Delete failed', {
          description: err instanceof Error ? err.message : 'unknown',
        });
      }
    });
  }

  return (
    <header
      className="glass-strong sticky top-0 z-30"
      style={{ paddingTop: 'env(safe-area-inset-top)' }}
    >
      <div
        className="mx-auto flex max-w-2xl items-center gap-1 px-2"
        style={{ height: 'var(--topbar-h)' }}
      >
        {/* Left: nav drawer (global menu) */}
        <NavDrawer trigger={<NavTrigger />} />

        {/* Center: title + status */}
        <div className="flex min-w-0 flex-1 flex-col items-center justify-center gap-0.5">
          <div className="flex max-w-full items-center gap-1.5">
            <h1 className="text-fg truncate text-sm font-semibold tracking-tight">{title}</h1>
            {pinnedSymbol ? (
              <span className="bg-brand/15 text-brand ring-brand/30 shrink-0 rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tabular-nums ring-1">
                {pinnedSymbol}
              </span>
            ) : null}
          </div>
          <p className="text-fg-subtle text-[11px] tabular-nums">
            {isStreaming ? (
              <span className="text-brand inline-flex items-center gap-1">
                <Sparkles className="size-3 animate-pulse" /> thinking…
              </span>
            ) : (
              'HamaFX-Ai copilot'
            )}
          </p>
        </div>

        {/* Right: new chat + menu */}
        <Tooltip label="New chat" side="bottom">
          <button
            type="button"
            onClick={newChat}
            disabled={pending}
            aria-label="New chat"
            className="text-fg-muted hover:text-fg hover:bg-bg-elev-2 inline-flex size-11 shrink-0 items-center justify-center rounded-xl transition-colors disabled:opacity-50"
          >
            {pending ? <Loader2 className="size-5 animate-spin" /> : <Plus className="size-5" />}
          </button>
        </Tooltip>

        <div className="relative">
          <Tooltip label="More" side="bottom">
            <button
              type="button"
              onClick={() => setMenuOpen((v) => !v)}
              aria-label="Conversation menu"
              aria-expanded={menuOpen}
              className="text-fg-muted hover:text-fg hover:bg-bg-elev-2 inline-flex size-11 shrink-0 items-center justify-center rounded-xl transition-colors"
            >
              <MoreHorizontal className="size-5" />
            </button>
          </Tooltip>
          {menuOpen ? (
            <>
              <div
                className="fixed inset-0 z-40"
                onClick={() => setMenuOpen(false)}
                aria-hidden="true"
              />
              <div className="glass-strong absolute right-0 top-12 z-50 w-56 overflow-hidden rounded-xl text-sm">
                <button
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
                  type="button"
                  onClick={() => void deleteCurrent()}
                  className="text-bear hover:bg-bear/10 flex min-h-[48px] w-full items-center gap-2 px-4 py-3 text-left"
                >
                  <Trash2 className="size-4" />
                  Delete conversation
                </button>
              </div>
            </>
          ) : null}
        </div>
      </div>

      {/* Conversation switcher drawer (right-side action) */}
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

function ThreadSwitcher({
  open,
  onOpenChange,
  threadId,
  threads,
  onPickNew,
}: ThreadSwitcherProps) {
  const router = useRouter();
  const [query, setQuery] = useState('');

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return threads;
    return threads.filter((t) => (t.title ?? '').toLowerCase().includes(q));
  }, [query, threads]);

  const showSearch = threads.length > 5;

  return (
    <Drawer open={open} onOpenChange={onOpenChange}>
      <DrawerContent>
        <DrawerHeader>
          <DrawerTitle>Conversations</DrawerTitle>
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
              style={{ background: 'oklch(78% 0.16 78 / 0.18)' }}
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
              return (
                <li key={t.id}>
                  <button
                    type="button"
                    onClick={() => {
                      onOpenChange(false);
                      if (!isActive) router.push(`/chat/${t.id}`);
                    }}
                    className={cn(
                      'flex min-h-[56px] w-full items-center gap-3 rounded-xl px-3 py-3 text-left text-sm transition-colors',
                      isActive
                        ? 'bg-bg-elev-3 text-fg'
                        : 'text-fg-muted hover:bg-bg-elev-2 hover:text-fg',
                    )}
                  >
                    <div className="min-w-0 flex-1">
                      <span className="block truncate font-semibold">
                        {t.title ?? 'New conversation'}
                      </span>
                      <span className="text-fg-subtle mt-0.5 block text-[11px] tabular-nums">
                        {formatRelative(t.updatedAt)}
                      </span>
                    </div>
                    {t.pinnedSymbol ? (
                      <span className="bg-brand/15 text-brand ring-brand/30 shrink-0 rounded-full px-2 py-0.5 text-[10px] font-bold tabular-nums ring-1">
                        {t.pinnedSymbol}
                      </span>
                    ) : null}
                  </button>
                </li>
              );
            })
          )}
        </ul>
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
