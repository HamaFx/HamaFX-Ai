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
//   - Escape key to close + return focus to trigger
//   - Optional focus-first-item on open
//   - Roving keyboard navigation (ArrowUp/Down, Home, End, Tab wrap)
//   - Focus stays inside the menu while it is open
//   - ARIA attributes for trigger and menu

import { useEffect, useRef, useState, useCallback, useId } from 'react';

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
  /** HTML id generated for the menu; useful for aria-controls. */
  menuId: string;
  /** ARIA props to spread onto the trigger button. */
  triggerProps: {
    'aria-haspopup': 'menu';
    'aria-expanded': boolean;
    'aria-controls': string;
  };
  /** ARIA + keyboard props to spread onto the menu container. */
  menuProps: {
    id: string;
    role: 'menu';
    'aria-orientation': 'vertical';
    onKeyDown: React.KeyboardEventHandler<HTMLDivElement>;
  };
}

export function usePopupMenu(opts: UsePopupMenuOptions = {}): UsePopupMenuResult {
  const { focusFirstOnOpen = true } = opts;
  const [open, setOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuId = useId();
  const activeIndexRef = useRef<number>(-1);

  const close = useCallback(() => setOpen(false), []);
  const toggle = useCallback(() => setOpen((v) => !v), []);

  const getFocusable = useCallback((): HTMLButtonElement[] => {
    if (!menuRef.current) return [];
    return Array.from(menuRef.current.querySelectorAll<HTMLButtonElement>('[role="menuitem"]'));
  }, []);

  const focusItem = useCallback(
    (index: number, focusable: HTMLButtonElement[]) => {
      if (focusable.length === 0) return;
      const clamped = Math.max(0, Math.min(index, focusable.length - 1));
      activeIndexRef.current = clamped;
      focusable[clamped]?.focus();
    },
    [],
  );

  // Focus first item on open (if requested). Return focus to trigger on close.
  useEffect(() => {
    if (!open) {
      activeIndexRef.current = -1;
      return;
    }

    const focusable = getFocusable();
    if (focusFirstOnOpen && focusable.length > 0) {
      focusItem(0, focusable);
    }
  }, [open, focusFirstOnOpen, focusItem, getFocusable]);

  // Click-outside + Escape + focus trap.
  useEffect(() => {
    if (!open) return;

    function onPointerDown(e: PointerEvent) {
      const target = e.target as Node;
      if (!menuRef.current || !triggerRef.current) return;
      if (!menuRef.current.contains(target) && !triggerRef.current.contains(target)) {
        setOpen(false);
      }
    }

    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        e.preventDefault();
        setOpen(false);
        triggerRef.current?.focus();
        return;
      }

      // Keep focus inside the menu while it is open.
      if (e.key === 'Tab' && menuRef.current) {
        const focusable = getFocusable();
        if (focusable.length === 0) return;
        const active = document.activeElement as HTMLElement | null;
        const activeIndex = focusable.indexOf(active as HTMLButtonElement);
        const isShift = e.shiftKey;
        if (activeIndex === -1) {
          e.preventDefault();
          focusItem(0, focusable);
          return;
        }
        if (isShift && activeIndex === 0) {
          e.preventDefault();
          focusItem(focusable.length - 1, focusable);
          return;
        }
        if (!isShift && activeIndex === focusable.length - 1) {
          e.preventDefault();
          focusItem(0, focusable);
          return;
        }
        // Otherwise let the default Tab behavior happen.
      }
    }

    window.addEventListener('pointerdown', onPointerDown);
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('pointerdown', onPointerDown);
      window.removeEventListener('keydown', onKey);
    };
  }, [open, focusItem, getFocusable]);

  const onMenuKeyDown = useCallback<React.KeyboardEventHandler<HTMLDivElement>>(
    (e) => {
      const focusable = getFocusable();
      if (focusable.length === 0) return;

      const active = document.activeElement as HTMLElement | null;
      activeIndexRef.current = focusable.indexOf(active as HTMLButtonElement);

      switch (e.key) {
        case 'ArrowDown': {
          e.preventDefault();
          const next = (activeIndexRef.current + 1) % focusable.length;
          focusItem(next, focusable);
          break;
        }
        case 'ArrowUp': {
          e.preventDefault();
          const prev = (activeIndexRef.current - 1 + focusable.length) % focusable.length;
          focusItem(prev, focusable);
          break;
        }
        case 'Home': {
          e.preventDefault();
          focusItem(0, focusable);
          break;
        }
        case 'End': {
          e.preventDefault();
          focusItem(focusable.length - 1, focusable);
          break;
        }
      }
    },
    [focusItem, getFocusable],
  );

  return {
    open,
    setOpen,
    menuRef,
    triggerRef,
    close,
    toggle,
    menuId,
    triggerProps: {
      'aria-haspopup': 'menu',
      'aria-expanded': open,
      'aria-controls': menuId,
    },
    menuProps: {
      id: menuId,
      role: 'menu',
      'aria-orientation': 'vertical',
      onKeyDown: onMenuKeyDown,
    },
  };
}
