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

import type { ReactNode } from 'react';
import { usePathname } from 'next/navigation';
import { Link } from 'next-view-transitions';
import { User, Key, List, Activity, Settings, Brain, Bot } from 'lucide-react';
import { PageHeader } from '@/components/layout/page-header';
import { cn } from '@/lib/cn';

const NAV_ITEMS = [
  { href: '/settings', label: 'General', icon: Settings, exact: true },
  { href: '/settings/profile', label: 'Profile', icon: User },
  { href: '/settings/api-keys', label: 'API Keys', icon: Key },
  { href: '/settings/models', label: 'Models', icon: Brain },
  { href: '/settings/agent', label: 'Agent', icon: Bot },
  { href: '/settings/symbols', label: 'Symbols', icon: List },
  { href: '/settings/usage', label: 'Usage', icon: Activity },
];

export default function SettingsLayout({ children }: { children: ReactNode }) {
  const pathname = usePathname();

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Settings"
        description="Manage your account, preferences, and workspace."
      />
      
      <div className="flex flex-col md:flex-row gap-8">
        <aside className="md:w-56 shrink-0">
          <nav className="flex flex-row md:flex-col gap-1 overflow-x-auto scrollbar-hide pb-2 md:pb-0">
            {NAV_ITEMS.map((item) => {
              const active = item.exact 
                ? pathname === item.href 
                : pathname?.startsWith(item.href);
                
              const Icon = item.icon;
              
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={cn(
                    'flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors whitespace-nowrap',
                    active
                      ? 'bg-brand/10 text-brand'
                      : 'text-fg-subtle hover:bg-surface-elevated hover:text-fg'
                  )}
                >
                  <Icon className="size-4" />
                  {item.label}
                </Link>
              );
            })}
          </nav>
        </aside>
        
        <div className="flex-1 min-w-0">
          {children}
        </div>
      </div>
    </div>
  );
}
