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

// Top app bar — sticky glass surface with three slots:
//   [☰ menu] [brand mark + title] [right slot]
//
// The chat route renders its own <ChatTopBar>; we hide the global TopBar
// there so we don't have two stacked headers (and so the global TopBar
// doesn't catch focus or pointer events meant for the chat surface).
//
// usePathname makes this a client component, but the cost is one
// useState read per navigation — negligible, and well worth the
// simplicity vs. a route-group restructure.

import { Link } from 'next-view-transitions';
import { usePathname } from 'next/navigation';

import { cn } from '@/lib/cn';

import { NavTrigger } from './nav-trigger';

interface TopBarProps {
  title?: string;
  /**
   * Optional right-aligned slot — pass icons/buttons that vary per page.
   */
  right?: React.ReactNode;
}

export function TopBar({ title, right }: TopBarProps) {
  const pathname = usePathname() ?? '';

  // Chat brings its own top bar (ChatTopBar). Returning null here is the
  // simplest way to suppress the global one without restructuring routes.
  if (pathname.startsWith('/chat')) return null;

  return (
    <header
      className={cn(
        'sticky top-0 z-30 flex justify-center pointer-events-none',
        'pt-[calc(env(safe-area-inset-top)+12px)] px-3 pb-2',
      )}
    >
      <div
        className={cn(
          'glass-strong pointer-events-auto flex w-full max-w-[400px] items-center gap-2 rounded-full border border-divider/60 px-2 shadow-lg transition-all',
        )}
        style={{
          height: 'var(--topbar-h)',
          boxShadow: 'var(--shadow-inset-edge-soft), 0 8px 32px -8px oklch(78% 0.16 85 / 0.15)',
        }}
      >
        <NavTrigger />

        <Link
          href="/chat"
          aria-label="HamaFX-Ai home"
          className="group flex flex-1 items-center justify-center gap-2 px-1 text-sm font-semibold tracking-tight transition-opacity hover:opacity-80"
        >
          <span
            aria-hidden="true"
            className="relative inline-flex size-7 items-center justify-center rounded-md"
            style={{
              backgroundImage: 'var(--gradient-brand)',
              boxShadow: '0 0 12px -2px oklch(82% 0.14 85 / 0.4)',
            }}
          >
            <span className="text-bg text-xs font-bold">H</span>
          </span>
          <span className="text-fg">
            {title ?? 'HamaFX'}
            <span className="text-fg-subtle font-normal">·Ai</span>
          </span>
        </Link>

        <div className="flex min-w-[44px] items-center justify-end gap-2">{right}</div>
      </div>
    </header>
  );
}
