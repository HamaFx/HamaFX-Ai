// SPDX-License-Identifier: Apache-2.0

'use client';

import type { ReactNode } from 'react';
import { cn } from '@/lib/cn';
import { useSidebarState } from './sidebar-state-context';

export function AppShellContainer({ children }: { children: ReactNode }) {
  const { collapsed } = useSidebarState();
  return (
    <div
      className={cn(
        'transition-[padding] duration-200 ease-in-out',
        collapsed ? 'lg:pl-16' : 'lg:pl-56',
      )}
    >
      {children}
    </div>
  );
}
