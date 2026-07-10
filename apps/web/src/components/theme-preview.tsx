'use client';

/**
 * TEMPORARY — Accent intensity preview switcher.
 *
 * Two live controls:
 *   1. Accent intensity — Obsidian (none) / Signal (hero spots) / Pulse (hero + interactive)
 *   2. Orange primary CTA — toggle the main action button to brand orange
 *
 * The base black/grey palette NEVER changes. Only scoped orange highlights
 * are added/removed via [data-theme] and [data-cta] attributes on <html>.
 * Both settings persist to localStorage and apply before paint (inline script
 * in layout.tsx) — no FOUC.
 *
 * Removal: delete this file, the scoped CSS in globals.css, the <script> +
 * <ThemePreview /> in layout.tsx, and the data-variant attr on Button.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { IconCheck, IconPalette, IconX } from '@tabler/icons-react';

import { cn } from '@/lib/cn';

type Intensity = 'default' | 'signal' | 'pulse';

interface IntensityOption {
  id: Intensity;
  name: string;
  desc: string;
  swatch: string;
}

const INTENSITIES: IntensityOption[] = [
  { id: 'default', name: 'Obsidian', desc: 'No accent — pure black/grey', swatch: '#262626' },
  { id: 'signal', name: 'Signal', desc: 'Orange on hero spots', swatch: '#F56E0F' },
  { id: 'pulse', name: 'Pulse', desc: 'Signal + interactive highlights', swatch: '#F56E0F' },
];

const THEME_KEY = 'theme-preview';
const CTA_KEY = 'theme-cta';
const VALID_INTENSITIES: Intensity[] = ['default', 'signal', 'pulse'];

function readAttr(name: string, valid: string[]): string | null {
  if (typeof document === 'undefined') return null;
  const attr = document.documentElement.getAttribute(name);
  return attr && valid.includes(attr) ? attr : null;
}

export function ThemePreview() {
  const [open, setOpen] = useState(false);
  const [intensity, setIntensity] = useState<Intensity>('default');
  const [ctaOrange, setCtaOrange] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const toggleRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    const t = readAttr('data-theme', VALID_INTENSITIES);
    setIntensity((t as Intensity) ?? 'default');
    setCtaOrange(readAttr('data-cta', ['orange']) === 'orange');
  }, []);

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

  const applyIntensity = useCallback((id: Intensity) => {
    const root = document.documentElement;
    if (id === 'default') root.removeAttribute('data-theme');
    else root.setAttribute('data-theme', id);
    try {
      localStorage.setItem(THEME_KEY, id);
    } catch {
      /* localStorage blocked — attribute still set */
    }
    setIntensity(id);
  }, []);

  const applyCta = useCallback((orange: boolean) => {
    const root = document.documentElement;
    if (orange) root.setAttribute('data-cta', 'orange');
    else root.removeAttribute('data-cta');
    try {
      localStorage.setItem(CTA_KEY, orange ? 'orange' : 'default');
    } catch {
      /* localStorage blocked — attribute still set */
    }
    setCtaOrange(orange);
  }, []);

  return (
    <div
      ref={containerRef}
      className="fixed bottom-[max(env(safe-area-inset-bottom),16px)] left-4 z-[9999] flex flex-col items-start gap-2 print:hidden"
    >
      {open ? (
        <div
          role="dialog"
          aria-label="Accent preview"
          className="border-border bg-bg-elev-1 flex w-[280px] flex-col rounded-sm shadow-xl"
        >
          <div className="border-divider flex items-center justify-between border-b px-3 py-2">
            <div className="flex items-center gap-1.5">
              <IconPalette className="text-brand size-3.5" aria-hidden="true" />
              <span className="text-fg text-caption font-semibold uppercase tracking-wider">
                Accent Preview
              </span>
            </div>
            <button
              type="button"
              onClick={() => {
                setOpen(false);
                toggleRef.current?.focus();
              }}
              aria-label="Close accent preview"
              className="text-fg-muted hover:text-fg inline-flex size-6 items-center justify-center rounded-sm transition-colors"
            >
              <IconX className="size-3.5" aria-hidden="true" />
            </button>
          </div>

          <div className="flex flex-col gap-0.5 p-1.5">
            <span className="text-fg-subtle px-2 py-1 text-[10px] font-semibold uppercase tracking-wider">
              Intensity
            </span>
            {INTENSITIES.map((opt) => {
              const isActive = intensity === opt.id;
              return (
                <button
                  key={opt.id}
                  type="button"
                  onClick={() => applyIntensity(opt.id)}
                  aria-pressed={isActive}
                  className={cn(
                    'flex items-center gap-3 rounded-sm px-2 py-2 text-left transition-colors',
                    isActive ? 'bg-bg-elev-3' : 'hover:bg-bg-elev-2',
                  )}
                >
                  <span
                    aria-hidden="true"
                    className={cn(
                      'size-3.5 shrink-0 rounded-sm border border-black/30',
                      opt.id === 'default' && 'border-border',
                    )}
                    style={{ backgroundColor: opt.swatch }}
                  />
                  <div className="flex min-w-0 flex-1 flex-col">
                    <span className="text-fg text-caption font-medium truncate">{opt.name}</span>
                    <span className="text-fg-subtle text-[10px] truncate">{opt.desc}</span>
                  </div>
                  {isActive ? (
                    <IconCheck className="text-brand size-4 shrink-0" aria-hidden="true" />
                  ) : null}
                </button>
              );
            })}
          </div>

          <div className="border-divider border-t p-1.5">
            <span className="text-fg-subtle px-2 py-1 text-[10px] font-semibold uppercase tracking-wider">
              Primary button
            </span>
            <button
              type="button"
              onClick={() => applyCta(!ctaOrange)}
              aria-pressed={ctaOrange}
              className={cn(
                'flex w-full items-center gap-3 rounded-sm px-2 py-2 text-left transition-colors',
                ctaOrange ? 'bg-bg-elev-3' : 'hover:bg-bg-elev-2',
              )}
            >
              <span
                aria-hidden="true"
                className={cn(
                  'flex h-5 w-9 shrink-0 items-center rounded-sm border transition-colors',
                  ctaOrange
                    ? 'border-brand bg-brand justify-end'
                    : 'border-border bg-bg-elev-2 justify-start',
                )}
              >
                <span
                  className={cn(
                    'size-3.5 rounded-sm transition-colors',
                    ctaOrange ? 'bg-brand-fg' : 'bg-fg-muted',
                  )}
                />
              </span>
              <div className="flex min-w-0 flex-1 flex-col">
                <span className="text-fg text-caption font-medium truncate">Orange CTA</span>
                <span className="text-fg-subtle text-[10px] truncate">
                  {ctaOrange ? 'Primary buttons are orange' : 'Primary buttons are white'}
                </span>
              </div>
            </button>
          </div>

          <div className="border-divider border-t px-3 py-1.5">
            <p className="text-fg-subtle text-[10px]">
              Preview only — changes are local to this browser.
            </p>
          </div>
        </div>
      ) : null}

      <button
        ref={toggleRef}
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-label={open ? 'Close accent preview' : 'Open accent preview'}
        aria-expanded={open}
        aria-haspopup="dialog"
        className="border-border bg-bg-elev-1 hover:bg-bg-elev-2 text-fg-muted hover:text-fg inline-flex size-10 items-center justify-center rounded-sm shadow-md transition-colors"
      >
        <IconPalette className="size-5" aria-hidden="true" />
      </button>
    </div>
  );
}
