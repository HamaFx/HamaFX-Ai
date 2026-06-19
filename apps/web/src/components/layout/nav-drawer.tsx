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

import { Menu } from 'lucide-react'; // re-exported for triggers
import {
  Bell,
  BookOpen,
  Calendar,
  Cog,
  LineChart,
  LogOut,
  MessageCircle,
  Newspaper,
  Sparkles,
} from 'lucide-react';
import { Link } from 'next-view-transitions';
import { usePathname, useRouter } from 'next/navigation';

import { cn } from '@/lib/cn';

interface NavItem {
  href: string;
  label: string;
  icon: typeof MessageCircle;
  description?: string;
  match?: readonly string[];
}

const PRIMARY: readonly NavItem[] = [
  {
    href: '/chat',
    label: 'Chat',
    icon: MessageCircle,
    description: 'Ask anything about your symbols',
  },
  {
    href: '/chart/XAUUSD',
    label: 'Chart',
    icon: LineChart,
    match: ['/chart'],
    description: 'Live candles + structure',
  },
  {
    href: '/news',
    label: 'News',
    icon: Newspaper,
    description: 'Tagged headlines',
  },
  {
    href: '/calendar',
    label: 'Calendar',
    icon: Calendar,
    description: 'Macro events',
  },
];

const SECONDARY: readonly NavItem[] = [
  { href: '/alerts', label: 'Alerts', icon: Bell, description: 'Price triggers' },
  { href: '/journal', label: 'Journal', icon: BookOpen, description: 'Trades & R-multiples' },
  { href: '/settings', label: 'Settings', icon: Cog, description: 'Notifications, usage' },
];

export function NavDrawer({ isMobile, isDesktop }: { isMobile?: boolean; isDesktop?: boolean }) {
  const pathname = usePathname();
  const router = useRouter();

  function isActive(item: NavItem): boolean {
    const candidates = item.match ?? [item.href];
    return candidates.some((p) => pathname === p || pathname.startsWith(`${p}/`));
  }

  async function logout() {
    try {
      await fetch('/api/auth/logout', { method: 'POST' });
    } catch {
      /* best effort */
    }
    router.push('/login');
    router.refresh();
  }

  if (isMobile) {
    return (
      <nav className="fixed bottom-0 left-0 right-0 z-50 glass-strong border-t border-divider pb-safe">
        <ul className="flex items-center justify-around px-2 py-2">
          {PRIMARY.map((item) => {
            const active = isActive(item);
            const Icon = item.icon;
            return (
              <li key={item.href}>
                <Link
                  href={item.href}
                  aria-current={active ? 'page' : undefined}
                  className={cn(
                    'flex flex-col items-center justify-center min-w-[64px] min-h-[44px] gap-1 px-1 py-1 rounded-xl transition-all',
                    active ? 'text-brand' : 'text-fg-muted hover:text-fg hover:bg-bg-elev-2'
                  )}
                >
                  <Icon className="size-5" strokeWidth={active ? 2.5 : 2} />
                  <span className="text-[10px] font-medium tracking-wide">{item.label}</span>
                </Link>
              </li>
            );
          })}
          {/* Settings / More on mobile */}
          <li>
            <Link
              href="/settings"
              className={cn(
                'flex flex-col items-center justify-center min-w-[64px] min-h-[44px] gap-1 px-1 py-1 rounded-xl transition-all text-fg-muted hover:text-fg hover:bg-bg-elev-2',
                pathname?.startsWith('/settings') && 'text-brand'
              )}
            >
              <Cog className="size-5" strokeWidth={2} />
              <span className="text-[10px] font-medium tracking-wide">More</span>
            </Link>
          </li>
        </ul>
      </nav>
    );
  }

  return (
    <aside className="sticky top-0 h-svh w-[260px] flex-col border-r border-divider bg-bg-elev-1/30 flex pt-safe">
      <div className="flex items-center gap-3 px-5 pt-6 pb-5">
        <span
          aria-hidden="true"
          className="inline-flex size-8 items-center justify-center rounded-lg"
          style={{
            backgroundImage: 'var(--gradient-brand)',
            boxShadow: 'var(--shadow-brand-press)',
          }}
        >
          <Sparkles className="text-bg size-4" strokeWidth={2.5} />
        </span>
        <div className="flex flex-col gap-0.5">
          <span className="text-fg text-[15px] font-bold tracking-tight leading-none">
            Hama<span className="text-brand">FX</span>
            <span className="text-fg-subtle font-normal">·Ai</span>
          </span>
          <span className="text-fg-muted text-[11px] leading-none">Personal Terminal</span>
        </div>
      </div>

      <nav aria-label="Primary" className="scrollbar-hide flex-1 overflow-y-auto px-3 pb-4">
        <Section label="Workspace">
          {PRIMARY.map((item) => (
            <NavLink key={item.href} item={item} active={isActive(item)} />
          ))}
        </Section>

        <Section label="System">
          {SECONDARY.map((item) => (
            <NavLink key={item.href} item={item} active={isActive(item)} />
          ))}
        </Section>
      </nav>

      {/* Footer */}
      <div className="border-divider mt-auto border-t px-3 py-3">
        <button
          type="button"
          onClick={() => void logout()}
          className="text-fg-muted hover:text-fg hover:bg-bg-elev-2 flex min-h-[40px] w-full items-center gap-3 rounded-lg px-3 text-left text-sm font-medium transition-colors"
        >
          <LogOut className="size-4" strokeWidth={2} />
          Sign out
        </button>
      </div>
    </aside>
  );
}

export { Menu };

function Section({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1 pt-4 first:pt-0">
      <p className="text-fg-subtle px-3 pb-2 text-[11px] font-semibold tracking-widest uppercase">
        {label}
      </p>
      <ul className="flex flex-col gap-1">{children}</ul>
    </div>
  );
}

function NavLink({ item, active }: { item: NavItem; active: boolean }) {
  const Icon = item.icon;
  return (
    <li>
      <Link
        href={item.href}
        aria-current={active ? 'page' : undefined}
        className={cn(
          'group/nav relative flex min-h-[36px] items-center gap-3 rounded-md px-3 transition-all',
          active
            ? 'bg-bg-elev-3 text-fg font-medium shadow-sm border border-divider/50'
            : 'text-fg-muted hover:bg-bg-elev-2 hover:text-fg border border-transparent font-medium'
        )}
      >
        <Icon className={cn("size-4", active ? "text-brand" : "text-fg-muted group-hover/nav:text-fg")} strokeWidth={active ? 2.5 : 2} />
        <span className="text-[13px] leading-tight flex-1">{item.label}</span>
      </Link>
    </li>
  );
}
