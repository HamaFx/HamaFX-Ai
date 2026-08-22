// SPDX-License-Identifier: Apache-2.0

'use client';

import { createContext, useContext, useState, type ReactNode } from 'react';

interface SidebarStateContextValue {
  collapsed: boolean;
  setCollapsed: (collapsed: boolean | ((prev: boolean) => boolean)) => void;
  toggle: () => void;
}

const SidebarStateContext = createContext<SidebarStateContextValue | null>(null);

export function SidebarStateProvider({ children }: { children: ReactNode }) {
  const [collapsed, setCollapsed] = useState(true);

  const toggle = () => setCollapsed((v) => !v);

  return (
    <SidebarStateContext.Provider value={{ collapsed, setCollapsed, toggle }}>
      {children}
    </SidebarStateContext.Provider>
  );
}

export function useSidebarState() {
  const ctx = useContext(SidebarStateContext);
  if (!ctx) {
    throw new Error('useSidebarState must be used within SidebarStateProvider');
  }
  return ctx;
}
