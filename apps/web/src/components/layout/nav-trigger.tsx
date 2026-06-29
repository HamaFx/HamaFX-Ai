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

// <NavTrigger> — the hamburger button that opens the global nav drawer.
// Both <TopBar> and <ChatTopBar> render this component. Clicks call into
// the drawer's context state, so it doesn't matter which trigger fires —
// only one drawer instance lives in the DOM.
//
// No tooltip on the trigger. The hamburger glyph is universally
// understood and any tooltip wrapper would interpose a span between the
// click target and the visible icon, occasionally swallowing taps that
// land near the icon's edge on touch devices.

import { Menu } from 'lucide-react';

import { useNavDrawer } from './nav-drawer-context';

export function NavTrigger() {
  const { open, setOpen } = useNavDrawer();
  return (
    <button
      type="button"
      aria-label={open ? 'Close navigation' : 'Open navigation'}
      aria-expanded={open}
      aria-controls="sidebar-nav"
      onClick={() => setOpen(true)}
      className="text-fg-muted hover:text-fg hover:bg-bg-elev-2 active:bg-bg-elev-3 active:scale-95 inline-flex size-11 shrink-0 items-center justify-center rounded-full transition-all"
    >
      <Menu className="size-5" />
    </button>
  );
}
