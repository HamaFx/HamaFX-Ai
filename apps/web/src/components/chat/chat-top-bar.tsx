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
import {IconLoader2, IconMessages, IconDotsCircleHorizontal, IconPlus, IconBolt, IconTrash, IconCheck, IconFileDownload, IconCpu, IconChevronDown} from '@tabler/icons-react';
import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';
import { toast } from 'sonner';

import { NavTrigger } from '@/components/layout/nav-trigger';
import { useConfirm } from '@/components/ui/confirm-drawer';
import { Tooltip } from '@/components/ui/tooltip';
import { cn } from '@/lib/cn';
import { apiMutate } from '@/lib/api-client';
import { SymbolChip } from '@/components/ui/symbol-chip';
import { ThreadSwitcher } from './_components/thread-switcher';
import { usePopupMenu } from '@/hooks/use-popup-menu';

export type AnalysisMode = 'single' | 'quick' | 'standard' | 'full' | 'auto';

const MODE_LABELS: Record<AnalysisMode, string> = {
  auto: 'Auto',
  single: 'Single',
  quick: 'Quick',
  standard: 'Standard',
  full: 'Full',
};

const MODE_DESCRIPTIONS: Record<AnalysisMode, string> = {
  auto: 'AI picks the best mode',
  single: 'Fast, one agent',
  quick: 'Technical only (~3s)',
  standard: 'Technical + Fundamental (~5s)',
  full: 'All 4 agents + fusion (~8s)',
};

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
  analysisMode?: AnalysisMode;
  onAnalysisModeChange?: (mode: AnalysisMode) => void;
}

export function ChatTopBar({ threadId, title, pinnedSymbol, threads, isStreaming, analysisMode = 'auto', onAnalysisModeChange }: ChatTopBarProps) {
  const router = useRouter();
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const [unpinning, setUnpinning] = useState(false);
  const [confirmEl, confirm] = useConfirm();

  // M4: Popup menus via dedicated hook.
  const overflowMenu = usePopupMenu();
  const modeMenu = usePopupMenu({ focusFirstOnOpen: false });

  function newChat() {
    startTransition(async () => {
      try {
        const { thread } = await apiMutate<{ thread: { id: string } }>('/api/chat/threads', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: '{}',
        });
        router.refresh();
        router.push(`/chat/${thread.id}`);
      } catch (err) {
        toast.error('Failed to create chat', {
          description: err instanceof Error ? err.message : 'unknown',
        });
      }
    });
  }

  async function deleteCurrent() {
    overflowMenu.setOpen(false);
    const ok = await confirm({
      title: 'Delete this conversation?',
      description: 'Messages and tool calls in this thread will be removed permanently.',
      confirmLabel: 'Delete',
      tone: 'danger',
    });
    if (!ok) return;
    startTransition(async () => {
      try {
        await apiMutate(`/api/chat/threads/${threadId}`, { method: 'DELETE' });
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
    overflowMenu.setOpen(false);
    const exportUrl = `/api/chat/threads/${threadId}/export`;
    const newWindow = window.open(exportUrl, '_blank', 'noopener,noreferrer');
    if (!newWindow || newWindow.closed || typeof newWindow.closed === 'undefined') {
      toast.error('Pop-up blocked. Click here to download', {
        duration: 8000,
        action: {
          label: 'Download',
          onClick: () => {
            window.location.href = exportUrl;
          },
        },
      });
    }
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
      await apiMutate(`/api/chat/threads/${threadId}`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ pinnedSymbol: null }),
      });
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
        'sticky top-0 z-30 flex h-12 w-full shrink-0 items-center justify-between',
        'border-b border-border bg-bg/90 backdrop-blur-md px-3 pt-safe',
      )}
    >
      <NavTrigger />

      {/* Center: title + pinned symbol */}
      <div className="flex min-w-0 flex-1 items-center justify-center gap-1.5">
        <h1 className="text-fg truncate text-sm font-semibold tracking-tight">{title}</h1>
        {pinnedSymbol ? (
          <SymbolChip
            symbol={pinnedSymbol}
            clearing={unpinning}
            onClear={() => void clearPin()}
          />
        ) : null}
        {isStreaming ? (
          <span className="text-fg-subtle inline-flex items-center gap-1 text-caption font-medium">
            <IconBolt className="size-2.5 animate-pulse" /> thinking…
          </span>
        ) : null}
      </div>

        {/* Analysis Mode Selector */}
        {onAnalysisModeChange && (
          <div className="relative" ref={modeMenu.menuRef}>
            <button
              type="button"
              onClick={() => modeMenu.setOpen((v) => !v)}
              aria-label="Analysis mode"
              {...modeMenu.triggerProps}
              className="text-fg-muted hover:text-fg hover:bg-bg-elev-2 active:bg-bg-elev-3 inline-flex items-center gap-1 rounded-sm px-2.5 py-1.5 text-caption font-medium transition-colors shrink-0"
            >
              <IconCpu className="size-3.5" />
              <span className="hidden sm:inline">{MODE_LABELS[analysisMode]}</span>
              <IconChevronDown className="size-3" />
            </button>
            {modeMenu.open ? (
              <div
                {...modeMenu.menuProps}
                className="bg-bg-elev-1 border border-border shadow-xl absolute right-0 top-full z-50 mt-2 w-56 rounded-sm p-1.5"
              >
                {(Object.keys(MODE_LABELS) as AnalysisMode[]).map((mode) => (
                  <button
                    key={mode}
                    role="menuitem"
                    type="button"
                    onClick={() => {
                      onAnalysisModeChange(mode);
                      modeMenu.setOpen(false);
                    }}
                    className={cn(
                      'flex w-full items-center justify-between gap-2 rounded-sm px-3 py-2 text-left text-sm transition-colors',
                      analysisMode === mode
                        ? 'bg-bg-elev-2 text-fg font-medium'
                        : 'text-fg-muted hover:bg-bg-elev-2 hover:text-fg',
                    )}
                  >
                    <div className="flex flex-col gap-0.5">
                      <span>{MODE_LABELS[mode]}</span>
                      <span className="text-caption text-fg-subtle">{MODE_DESCRIPTIONS[mode]}</span>
                    </div>
                    {analysisMode === mode && <IconCheck className="size-4 text-fg shrink-0" />}
                  </button>
                ))}
              </div>
            ) : null}
          </div>
        )}

        <Tooltip label="New chat" side="bottom">
          <button
            type="button"
            onClick={newChat}
            disabled={pending}
            aria-label="New chat"
            className="text-fg-muted hover:text-fg hover:bg-bg-elev-2 active:bg-bg-elev-3 inline-flex size-11 shrink-0 items-center justify-center rounded-sm transition-colors disabled:opacity-50"
          >
            {pending ? <IconLoader2 className="size-5 animate-spin" /> : <IconPlus className="size-5" />}
          </button>
        </Tooltip>

        <div className="relative" ref={overflowMenu.menuRef}>
          <button
            ref={overflowMenu.triggerRef}
            type="button"
            onClick={() => overflowMenu.setOpen((v) => !v)}
            aria-label="Conversation menu"
            {...overflowMenu.triggerProps}
            className="text-fg-muted hover:text-fg hover:bg-bg-elev-2 active:bg-bg-elev-3 inline-flex size-11 shrink-0 items-center justify-center rounded-sm transition-colors"
          >
            <IconDotsCircleHorizontal className="size-5" />
          </button>
          {overflowMenu.open ? (
            <div
              {...overflowMenu.menuProps}
              className="surface-elevated absolute right-0 top-12 z-50 w-56 overflow-hidden rounded-sm text-body-sm"
            >
              <button
                role="menuitem"
                type="button"
                onClick={() => {
                  overflowMenu.setOpen(false);
                  setDrawerOpen(true);
                }}
                className="text-fg hover:bg-bg-elev-2 flex min-h-[48px] w-full items-center gap-2 px-4 py-3 text-left"
              >
                <IconMessages className="size-4" />
                Switch conversation
              </button>
              <div className="border-border/60 border-t" />
              <button
                role="menuitem"
                type="button"
                onClick={exportThread}
                className="text-fg hover:bg-bg-elev-2 flex min-h-[48px] w-full items-center gap-2 px-4 py-3 text-left"
              >
                <IconFileDownload className="size-4" />
                Export as Markdown
              </button>
              <div className="border-border/60 border-t" />
              <button
                role="menuitem"
                type="button"
                onClick={() => void deleteCurrent()}
                className="text-danger hover:bg-danger/10 flex min-h-[48px] w-full items-center gap-2 px-4 py-3 text-left"
              >
                <IconTrash className="size-4" />
                Delete conversation
              </button>
            </div>
          ) : null}
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



