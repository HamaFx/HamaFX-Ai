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

/**
 * <CommandPalette> — global ⌘K / Ctrl-K launcher.
 *
 * Phase B — UX_UPGRADE_PLAN.md item 11.
 *
 * Mounts once at the app layout level. Listens for the keyboard
 * shortcut, opens a vaul drawer with an input + results list, and
 * dispatches commands on Enter.
 *
 * Mobile fallback: when the device has coarse pointer (touch), we
 * render a floating "Quick switch" button bottom-right that opens
 * the same drawer. Desktop keyboard users get ⌘K only.
 *
 * The palette is intentionally narrow in scope:
 *   - Static command list (no async search across threads here —
 *     that lives in the chat search affordance and would add API
 *     complexity for marginal value).
 *   - One keyboard shortcut. We do not implement g+key sequences
 *     (Vim-style). The plan calls for a single launcher.
 *   - No analytics. The palette is a power-user affordance; logging
 *     every selection would inflate telemetry without insight.
 */

import { Command, Search } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react';

import { Drawer, DrawerContent, DrawerHeader, DrawerTitle } from '@/components/ui/drawer';
import { cn } from '@/lib/cn';
import { rankByQuery } from '@/lib/fuzzy-match';
import {
  COMMANDS,
  type CommandGroup,
  type CommandItem,
} from '@/lib/commands';

const GROUP_LABELS: Record<CommandGroup, string> = {
  navigation: 'Navigate',
  create: 'Create',
  settings: 'Settings',
};
const GROUP_ORDER: CommandGroup[] = ['navigation', 'create', 'settings'];

export interface CommandPaletteProps {
  /**
   * Imperative handler for the "new chat" command. We don't put
   * this in the static command list because the implementation
   * needs `router` + the chat thread-creation route.
   */
  onNewChat?: () => void;
}

export function CommandPalette({ onNewChat }: CommandPaletteProps) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [activeIdx, setActiveIdx] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const inputId = useId();

  // Touch detection — single read on mount, no resize listener
  // (changing input mode at runtime would be confusing).
  const [isTouch, setIsTouch] = useState(false);
  useEffect(() => {
    if (typeof window === 'undefined') return;
    setIsTouch(window.matchMedia('(pointer: coarse)').matches);
  }, []);

  // Keyboard shortcut listener.
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      const isK = e.key === 'k' || e.key === 'K';
      if (isK && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        setOpen((v) => !v);
      }
    }
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);

  // Reset state every time the drawer opens.
  useEffect(() => {
    if (open) {
      setQuery('');
      setActiveIdx(0);
      // Focus the input after vaul animates in. requestAnimationFrame
      // is the standard hook for "after layout".
      requestAnimationFrame(() => inputRef.current?.focus());
    }
  }, [open]);

  const runCommand = useCallback(
    (cmd: CommandItem) => {
      setOpen(false);
      if (cmd.id === 'create-chat') {
        onNewChat?.();
        return;
      }
      if (cmd.href) {
        router.push(cmd.href);
      }
    },
    [router, onNewChat],
  );

  // Build the search corpus: each command's label + keywords joined
  // into a single searchable string. The displayed label stays
  // untouched; we only use the joined string for matching.
  const corpus = useMemo(() => {
    // Each row carries `label` (joined for matching) and the
    // original CommandItem so the UI can render icon, href, etc.
    type Row = { item: CommandItem; label: string; displayLabel: string };
    const rows: Row[] = COMMANDS.map((c) => ({
      item: c,
      label: [c.label, ...(c.keywords ?? [])].join(' '),
      displayLabel: c.label,
    }));
    return rows;
  }, []);

  const ranked = useMemo(() => {
    const matches = rankByQuery(query, corpus);
    return matches.map(({ item, match }) => {
      // Translate matched indices (into the joined label + keywords
      // string) back into the display label for highlighting. Indices
      // outside the display label are keyword hits — drop them.
      const labelIndices = match.indices.filter((i) => i < item.displayLabel.length);
      return { command: item.item, match, labelIndices };
    });
  }, [query, corpus]);

  // Group ranked results preserving the global rank order within each
  // group so the active-index jumps between groups in a sensible way.
  const grouped = useMemo(() => {
    const out: Record<CommandGroup, Array<{ command: CommandItem; labelIndices: number[] }>> = {
      navigation: [],
      create: [],
      settings: [],
    };
    for (const r of ranked) out[r.command.group].push({ command: r.command, labelIndices: r.labelIndices });
    return out;
  }, [ranked]);

  // Flatten in display order so keyboard nav (arrow up/down) can
  // step through every visible row in a single index space.
  const flatRows = useMemo(() => {
    const out: Array<{ command: CommandItem; labelIndices: number[] }> = [];
    for (const group of GROUP_ORDER) {
      for (const row of grouped[group]) out.push(row);
    }
    return out;
  }, [grouped]);

  // Clamp activeIdx when the result set changes.
  useEffect(() => {
    if (flatRows.length > 0 && activeIdx >= flatRows.length) {
      setActiveIdx(0);
    }
  }, [flatRows.length, activeIdx]);

  // Scroll active item into view when activeIdx changes.
  useEffect(() => {
    if (!open) return;
    const activeEl = document.querySelector(`[data-command-idx="${activeIdx}"]`);
    if (activeEl) {
      activeEl.scrollIntoView({ block: 'nearest' });
    }
  }, [activeIdx, open]);

  function onInputKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActiveIdx((i) => (flatRows.length === 0 ? 0 : (i + 1) % flatRows.length));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActiveIdx((i) => (flatRows.length === 0 ? 0 : (i - 1 + flatRows.length) % flatRows.length));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      const target = flatRows[activeIdx];
      if (target) runCommand(target.command);
    } else if (e.key === 'Escape') {
      e.preventDefault();
      setOpen(false);
    }
  }

  return (
    <>
      <Drawer open={open} onOpenChange={setOpen}>
        <DrawerContent className="max-h-[80svh]">
          <DrawerHeader>
            <DrawerTitle>
              <span className="flex items-center gap-2">
                <Command className="size-4" aria-hidden="true" />
                Quick switch
              </span>
            </DrawerTitle>
          </DrawerHeader>

          <div className="px-4 pb-3">
            <label htmlFor={inputId} className="sr-only">
              Search commands
            </label>
            <div className="relative">
              <Search
                aria-hidden="true"
                className="text-fg-subtle absolute left-3 top-1/2 size-4 -translate-y-1/2"
              />
              <input
                ref={inputRef}
                id={inputId}
                type="search"
                value={query}
                onChange={(e) => {
                  setQuery(e.target.value);
                  setActiveIdx(0);
                }}
                onKeyDown={onInputKeyDown}
                placeholder="Search…"
                autoComplete="off"
                spellCheck={false}
                className="bg-bg-elev-1/60 text-fg placeholder:text-fg-subtle focus:border-brand/60 border-divider h-11 w-full rounded-xl border pl-10 pr-4 text-sm focus:outline-none"
              />
            </div>
          </div>

          <div className="scrollbar-hide flex max-h-[50svh] flex-col overflow-y-auto px-2 pb-4">
            {flatRows.length === 0 ? (
              <p className="text-fg-subtle px-3 py-6 text-center text-sm">
                No commands match.
              </p>
            ) : (
              GROUP_ORDER.map((group) => {
                const rows = grouped[group];
                if (rows.length === 0) return null;
                return (
                  <section key={group} aria-labelledby={`cmd-group-${group}`} className="mb-2">
                    <h3
                      id={`cmd-group-${group}`}
                      className="text-fg-subtle px-3 pb-1 pt-2 text-caption font-medium uppercase tracking-wide"
                    >
                      {GROUP_LABELS[group]}
                    </h3>
                    <ul className="flex flex-col gap-1">
                      {rows.map(({ command, labelIndices }) => {
                        const flatIndex = flatRows.findIndex((r) => r.command.id === command.id);
                        const isActive = flatIndex === activeIdx;
                        const Icon = command.icon;
                        return (
                          <li key={command.id}>
                            <button
                              type="button"
                              data-command-idx={flatIndex}
                              onClick={() => runCommand(command)}
                              onMouseEnter={() => setActiveIdx(flatIndex)}
                              className={cn(
                                'flex min-h-[44px] w-full items-center gap-3 rounded-xl px-3 py-2 text-left text-sm transition-colors',
                                isActive
                                  ? 'bg-bg-elev-3 text-fg'
                                  : 'text-fg-muted hover:bg-bg-elev-2 hover:text-fg',
                              )}
                            >
                              <span
                                aria-hidden="true"
                                className="text-fg-muted inline-flex size-8 shrink-0 items-center justify-center rounded-lg bg-bg-elev-2"
                              >
                                <Icon className="size-4" strokeWidth={1.75} />
                              </span>
                              <span className="min-w-0 flex-1 truncate">
                                <HighlightedLabel label={command.label} indices={labelIndices} />
                              </span>
                              {command.shortcut ? (
                                <kbd className="bg-bg-elev-2 ring-divider rounded border px-1.5 font-mono text-caption ring-1">
                                  {command.shortcut}
                                </kbd>
                              ) : null}
                            </button>
                          </li>
                        );
                      })}
                    </ul>
                  </section>
                );
              })
            )}
          </div>
        </DrawerContent>
      </Drawer>

      {/* Touch fallback: a floating "Quick switch" button so mobile
          users have an equivalent surface to ⌘K. */}
      {isTouch ? (
        <button
          type="button"
          onClick={() => setOpen(true)}
          aria-label="Open command palette"
          className="bg-bg-elev-2 text-fg-muted border-divider hover:bg-bg-elev-3 hover:text-fg fixed right-4 bottom-24 z-30 inline-flex size-12 items-center justify-center rounded-full border shadow-md"
          style={{ bottom: 'calc(env(safe-area-inset-bottom) + 96px)' }}
        >
          <Command className="size-5" aria-hidden="true" />
        </button>
      ) : null}
    </>
  );
}

/**
 * Render a label with the matched indices highlighted. Indices that
 * are out of range are ignored. Non-highlighted characters render
 * normally; highlighted characters get a brand-toned background.
 */
function HighlightedLabel({ label, indices }: { label: string; indices: number[] }) {
  if (indices.length === 0) return <>{label}</>;
  const idxSet = new Set(indices);
  const out: React.ReactNode[] = [];
  for (let i = 0; i < label.length; i += 1) {
    const ch = label[i];
    if (idxSet.has(i)) {
      out.push(
        <mark key={i} className="bg-brand/20 text-fg rounded-sm px-0.5">
          {ch}
        </mark>,
      );
    } else {
      out.push(<span key={i}>{ch}</span>);
    }
  }
  return <>{out}</>;
}
