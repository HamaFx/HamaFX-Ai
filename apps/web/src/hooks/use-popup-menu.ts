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

// Reusable popup menu hook extracted from chat-top-bar.tsx (M4 audit fix).
//
// Handles:
//   - Click-outside to close
//   - Escape key to close
//   - Optional focus-first-item on open
//   - Optional trigger ref for focus return

import { useEffect, useRef, useState, useCallback } from 'react';

interface UsePopupMenuOptions {
  /** Whether to auto-focus the first menuitem on open. */
  focusFirstOnOpen?: boolean;
}

interface UsePopupMenuResult {
  open: boolean;
  setOpen: React.Dispatch<React.SetStateAction<boolean>>;
  menuRef: React.RefObject<HTMLDivElement | null>;
  triggerRef: React.RefObject<HTMLButtonElement | null>;
  close: () => void;
  toggle: () => void;
}

export function usePopupMenu(opts: UsePopupMenuOptions = {}): UsePopupMenuResult {
  const { focusFirstOnOpen = true } = opts;
  const [open, setOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);

  // Click-outside + Escape to close.
  useEffect(() => {
    if (!open) return;

    // Focus first element on open.
    if (focusFirstOnOpen) {
      const focusable = menuRef.current?.querySelectorAll<HTMLButtonElement>(
        '[role="menuitem"]',
      );
      focusable?.[0]?.focus();
    }

    function onPointerDown(e: PointerEvent) {
      if (!menuRef.current) return;
      if (!menuRef.current.contains(e.target as Node)) setOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        setOpen(false);
        triggerRef.current?.focus();
      }
    }
    window.addEventListener('pointerdown', onPointerDown);
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('pointerdown', onPointerDown);
      window.removeEventListener('keydown', onKey);
    };
  }, [open, focusFirstOnOpen]);

  const close = useCallback(() => setOpen(false), []);
  const toggle = useCallback(() => setOpen((v) => !v), []);

  return { open, setOpen, menuRef, triggerRef, close, toggle };
}
