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

// Top app bar — sticky surface with three slots:
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
  if (pathname === '/chat' || pathname.startsWith('/chat/')) return null;

  return (
    <header
      className={cn(
        'sticky top-0 z-30 flex h-12 w-full items-center justify-between',
        'border-b border-border bg-black px-3 pt-safe',
      )}
    >
      <NavTrigger />

      <Link
        href="/chat"
        aria-label="HamaFX-Ai home"
        className="group flex flex-1 items-center gap-2 px-1 text-sm font-semibold tracking-tight text-fg transition-opacity hover:opacity-80"
      >
        <span
          aria-hidden="true"
          data-accent="logo"
          className="relative inline-flex size-6 items-center justify-center rounded-sm bg-fg text-black"
        >
          <span className="text-xs font-bold">H</span>
        </span>
        <span className="text-fg">
          {title ?? 'HamaFX'}
          <span className="text-fg-subtle font-normal" aria-hidden>·Ai</span>
        </span>
      </Link>

      <div className="flex min-w-[44px] items-center justify-end gap-2">{right}</div>
    </header>
  );
}
