'use client';

// <NavDrawerProvider> + useNavDrawer() — single source of truth for the
// nav-drawer open state.
//
// Why a context, not per-trigger drawer instances?
//
// We render two top bars (TopBar for non-chat routes, ChatTopBar inside
// the chat surface). When the user navigates between them, vaul's drawer
// instances would mount/unmount with their own state and focus traps. If
// any state lingers across remounts the menu button can fire on a stale
// instance and "appear to do nothing". A single drawer mounted at the
// layout level, with both buttons calling `setOpen(true)`, eliminates
// the entire class of bug.
//
// The provider also defaults to a noop fallback when accessed outside
// (e.g. SSR) so trigger components don't have to guard every read.

import { createContext, useCallback, useContext, useState, type ReactNode } from 'react';

interface NavDrawerCtxShape {
  open: boolean;
  setOpen: (v: boolean) => void;
  toggle: () => void;
}

const FALLBACK: NavDrawerCtxShape = {
  open: false,
  setOpen: () => undefined,
  toggle: () => undefined,
};

const Ctx = createContext<NavDrawerCtxShape>(FALLBACK);

export function NavDrawerProvider({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false);
  const toggle = useCallback(() => {
    setOpen((v) => !v);
  }, []);
  return <Ctx.Provider value={{ open, setOpen, toggle }}>{children}</Ctx.Provider>;
}

export function useNavDrawer(): NavDrawerCtxShape {
  return useContext(Ctx);
}
