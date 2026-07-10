'use client';

/**
 * TEMPORARY — Theme palette preview switcher.
 *
 * A floating panel (bottom-left) that lets you live-switch between colour
 * palettes to evaluate them in-context. The selected theme is persisted to
 * localStorage and applied before paint by an inline script in layout.tsx
 * (no FOUC). Only surface/border/text/brand tokens change — market colours
 * (bull/bear/success/danger) stay constant across all palettes.
 *
 * Removal checklist when a winner is chosen:
 *   1. Bake the winning palette's hex values into the @theme block in globals.css
 *   2. Delete the three :root[data-theme="..."] blocks in globals.css
 *   3. Delete this file (theme-preview.tsx)
 *   4. Remove the <ThemePreview /> import + mount + the <script> from layout.tsx
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { IconCheck, IconPalette, IconX } from '@tabler/icons-react';

import { cn } from '@/lib/cn';

type ThemeId = 'default' | 'amber' | 'cold' | 'bronze';

interface ThemeOption {
  id: ThemeId;
  name: string;
  desc: string;
  /** canvas, elevated surface, accent, text — reflects the palette's real colours */
  swatches: [string, string, string, string];
}

const THEMES: ThemeOption[] = [
  {
    id: 'default',
    name: 'Obsidian',
    desc: 'Current — neutral grey',
    swatches: ['#0A0A0A', '#2A2A2A', '#F07010', '#F0F0F0'],
  },
  {
    id: 'amber',
    name: 'Amber Obsidian',
    desc: 'Warm-tinted surfaces',
    swatches: ['#0C0908', '#2C2218', '#F56E0F', '#F5EFE8'],
  },
  {
    id: 'cold',
    name: 'Cold Obsidian',
    desc: 'Cool blue-black + amber',
    swatches: ['#08090B', '#1E222B', '#F56E0F', '#EDF0F5'],
  },
  {
    id: 'bronze',
    name: 'Bronze & Amber',
    desc: 'Bronze borders, luxury',
    swatches: ['#0A0807', '#241F1A', '#F56E0F', '#F2EBE3'],
  },
];

const STORAGE_KEY = 'theme-preview';
const VALID_IDS: ThemeId[] = ['default', 'amber', 'cold', 'bronze'];

/** Read the currently-applied theme from the DOM (set by the inline script). */
function readAppliedTheme(): ThemeId {
  if (typeof document === 'undefined') return 'default';
  const attr = document.documentElement.getAttribute('data-theme');
  if (attr && VALID_IDS.includes(attr as ThemeId)) return attr as ThemeId;
  return 'default';
}

export function ThemePreview() {
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState<ThemeId>('default');
  const containerRef = useRef<HTMLDivElement>(null);
  const toggleRef = useRef<HTMLButtonElement>(null);

  // Sync component state with whatever the inline script applied.
  useEffect(() => {
    setActive(readAppliedTheme());
  }, []);

  // Escape closes the panel and returns focus to the toggle.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setOpen(false);
        toggleRef.current?.focus();
      }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open]);

  // Click-outside closes the panel (deferred one tick so the opening click
  // doesn't immediately trip the listener).
  useEffect(() => {
    if (!open) return;
    const onPointerDown = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    const id = setTimeout(() => document.addEventListener('mousedown', onPointerDown), 0);
    return () => {
      clearTimeout(id);
      document.removeEventListener('mousedown', onPointerDown);
    };
  }, [open]);

  const applyTheme = useCallback((id: ThemeId) => {
    const root = document.documentElement;
    if (id === 'default') {
      root.removeAttribute('data-theme');
    } else {
      root.setAttribute('data-theme', id);
    }
    try {
      localStorage.setItem(STORAGE_KEY, id);
    } catch {
      // localStorage may be blocked (private mode) — attribute is still set.
    }
    setActive(id);
  }, []);

  return (
    <div
      ref={containerRef}
      className="fixed bottom-[max(env(safe-area-inset-bottom),16px)] left-4 z-[9999] flex flex-col items-start gap-2 print:hidden"
    >
      {/* ── Panel (expands upward from the toggle) ── */}
      {open ? (
        <div
          role="dialog"
          aria-label="Theme palette preview"
          className="border-border bg-bg-elev-1 flex w-[280px] flex-col rounded-sm shadow-xl"
        >
          {/* Header */}
          <div className="border-divider flex items-center justify-between border-b px-3 py-2">
            <div className="flex items-center gap-1.5">
              <IconPalette className="text-brand size-3.5" aria-hidden="true" />
              <span className="text-fg text-caption font-semibold uppercase tracking-wider">
                Theme Preview
              </span>
            </div>
            <button
              type="button"
              onClick={() => {
                setOpen(false);
                toggleRef.current?.focus();
              }}
              aria-label="Close theme preview"
              className="text-fg-muted hover:text-fg inline-flex size-6 items-center justify-center rounded-sm transition-colors"
            >
              <IconX className="size-3.5" aria-hidden="true" />
            </button>
          </div>

          {/* Theme options */}
          <div className="flex flex-col gap-0.5 p-1.5">
            {THEMES.map((t) => {
              const isActive = active === t.id;
              return (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => applyTheme(t.id)}
                  aria-pressed={isActive}
                  className={cn(
                    'flex items-center gap-3 rounded-sm px-2 py-2 text-left transition-colors',
                    isActive ? 'bg-bg-elev-3' : 'hover:bg-bg-elev-2',
                  )}
                >
                  {/* Swatches — hardcoded hex so each row shows its real colours */}
                  <div className="flex shrink-0 gap-0.5">
                    {t.swatches.map((c, i) => (
                      <span
                        key={i}
                        aria-hidden="true"
                        className="size-3.5 rounded-sm border border-black/30"
                        style={{ backgroundColor: c }}
                      />
                    ))}
                  </div>
                  {/* Labels */}
                  <div className="flex min-w-0 flex-1 flex-col">
                    <span className="text-fg text-caption font-medium truncate">{t.name}</span>
                    <span className="text-fg-subtle text-[10px] truncate">{t.desc}</span>
                  </div>
                  {/* Active indicator */}
                  {isActive ? (
                    <IconCheck className="text-brand size-4 shrink-0" aria-hidden="true" />
                  ) : null}
                </button>
              );
            })}
          </div>

          {/* Footer */}
          <div className="border-divider border-t px-3 py-1.5">
            <p className="text-fg-subtle text-[10px]">
              Preview only — changes are local to this browser.
            </p>
          </div>
        </div>
      ) : null}

      {/* ── Toggle button (always visible) ── */}
      <button
        ref={toggleRef}
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-label={open ? 'Close theme preview' : 'Open theme preview'}
        aria-expanded={open}
        aria-haspopup="dialog"
        className="border-border bg-bg-elev-1 hover:bg-bg-elev-2 text-fg-muted hover:text-fg inline-flex size-10 items-center justify-center rounded-sm shadow-md transition-colors"
      >
        <IconPalette className="size-5" aria-hidden="true" />
      </button>
    </div>
  );
}

