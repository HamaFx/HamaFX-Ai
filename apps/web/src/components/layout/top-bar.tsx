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

import { usePathname } from 'next/navigation';
import { cn } from '@/lib/cn';

interface TopBarProps {
  title?: string;
  right?: React.ReactNode;
}

export function TopBar({ title, right }: TopBarProps) {
  const pathname = usePathname() ?? '';

  // Use a map for automatic titles based on routes if none provided
  const routeTitle = title || (() => {
    if (pathname.startsWith('/chat')) return 'Chat Analysis';
    if (pathname.startsWith('/chart')) return 'Market Chart';
    if (pathname.startsWith('/news')) return 'News Feed';
    if (pathname.startsWith('/calendar')) return 'Economic Calendar';
    if (pathname.startsWith('/alerts')) return 'Active Alerts';
    if (pathname.startsWith('/journal')) return 'Trading Journal';
    if (pathname.startsWith('/settings')) return 'Settings';
    return 'Dashboard';
  })();

  return (
    <header
      className={cn(
        'sticky top-0 z-30 flex items-center justify-between',
        'h-14 px-4 md:px-6 w-full',
        'bg-bg/80 backdrop-blur-md border-b border-divider',
        'paint-isolated'
      )}
    >
      <div className="flex items-center gap-2">
        <h1 className="text-sm font-semibold tracking-tight text-fg">
          {routeTitle}
        </h1>
      </div>
      
      <div className="flex items-center gap-3">
        {right}
      </div>
    </header>
  );
}
