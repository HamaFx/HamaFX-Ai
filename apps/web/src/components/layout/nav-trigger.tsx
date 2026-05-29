'use client';

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
  const { setOpen } = useNavDrawer();
  return (
    <button
      type="button"
      aria-label="Open menu"
      onClick={() => setOpen(true)}
      className="text-fg-muted hover:text-fg hover:bg-bg-elev-2 active:bg-bg-elev-3 inline-flex size-11 shrink-0 items-center justify-center rounded-full transition-colors"
    >
      <Menu className="size-5" />
    </button>
  );
}
