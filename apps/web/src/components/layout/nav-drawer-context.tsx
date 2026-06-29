'use client';

import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react';

interface NavDrawerState {
  open: boolean;
}

interface NavDrawerActions {
  setOpen: (v: boolean) => void;
  toggle: () => void;
}

const STATE_FALLBACK: NavDrawerState = {
  open: false,
};

const ACTIONS_FALLBACK: NavDrawerActions = {
  setOpen: () => undefined,
  toggle: () => undefined,
};

const StateCtx = createContext<NavDrawerState>(STATE_FALLBACK);
const ActionsCtx = createContext<NavDrawerActions>(ACTIONS_FALLBACK);

export function NavDrawerProvider({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false);
  const toggle = useCallback(() => {
    setOpen((v) => !v);
  }, []);

  const state = useMemo(() => ({ open }), [open]);
  const actions = useMemo(() => ({ setOpen, toggle }), [toggle]);

  return (
    <StateCtx.Provider value={state}>
      <ActionsCtx.Provider value={actions}>
        {children}
      </ActionsCtx.Provider>
    </StateCtx.Provider>
  );
}

export function useNavDrawerState(): NavDrawerState {
  return useContext(StateCtx);
}

export function useNavDrawerActions(): NavDrawerActions {
  return useContext(ActionsCtx);
}

export function useNavDrawer(): NavDrawerState & NavDrawerActions {
  return { ...useContext(StateCtx), ...useContext(ActionsCtx) };
}
