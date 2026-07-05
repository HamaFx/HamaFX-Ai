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

// <NavDrawer> — left-side slide-in nav. Single global instance, controlled
// via <NavDrawerProvider> context. See nav-drawer-context.tsx for the
// rationale.
//
// vaul gives us focus trap, swipe-to-dismiss, and Escape-to-close out of
// the box. We add:
//   - Auto-close on route change (so tapping a destination closes the
//     drawer without each consumer needing to call setOpen(false)).
//   - Reduced-motion friendly transitions (vaul respects the OS pref).
//   - Sectioned destinations (Markets / Personal) + identity strip and
//     a footer "Sign out" action.
//   - User identity display + nav item badges.

import { IconBell,  IconBook,  IconCalendar,  IconSettings,  IconLayoutDashboard,  IconChartLine,  IconLogout,  IconMessageCircle,  IconNews,  IconTarget } from '@tabler/icons-react';
import { Link } from 'next-view-transitions';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect, useMemo } from 'react';
import { Drawer as DrawerPrimitive } from 'vaul';
import { useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';

import { cn } from '@/lib/cn';
import { withCsrf } from '@/lib/csrf';

import { useNavDrawer } from './nav-drawer-context';

interface NavItem {
  href: string;
  label: string;
  icon: typeof IconMessageCircle;
  description?: string;
  match?: readonly string[];
}

const PRIMARY: readonly NavItem[] = [
  {
    href: '/dashboard',
    label: 'Dashboard',
    icon: IconLayoutDashboard,
    description: 'Briefing & performance overview',
  },
  {
    href: '/chat',
    label: 'Chat',
    icon: IconMessageCircle,
    description: 'Ask anything about your symbols',
  },
  {
    href: '/chart/XAUUSD',
    label: 'Chart',
    icon: IconChartLine,
    match: ['/chart'],
    description: 'Live candles + structure',
  },
  {
    href: '/news',
    label: 'News',
    icon: IconNews,
    description: 'Tagged headlines',
  },
  {
    href: '/calendar',
    label: 'Calendar',
    icon: IconCalendar,
    description: 'Macro events',
  },
];

const SECONDARY: readonly NavItem[] = [
  { href: '/signals', label: 'Signals', icon: IconTarget, description: 'AI track record' },
  { href: '/alerts', label: 'Alerts', icon: IconBell, description: 'Price triggers' },
  { href: '/journal', label: 'Journal', icon: IconBook, description: 'Trades & R-multiples' },
  { href: '/settings', label: 'Settings',    icon: IconSettings, description: 'Notifications, usage' },
];

export function NavDrawer({ userName, userEmail, userId: _userId }: { userName?: string; userEmail?: string; userId?: string }) {
  const { open, setOpen } = useNavDrawer();
  const pathname = usePathname();
  const router = useRouter();

  // D3 — Removed dead localStorage last-path tracking (never read back).

  // Auto-close on route change.
  useEffect(() => {
    setOpen(false);
  }, [pathname, setOpen]);

  function isActive(item: NavItem): boolean {
    const candidates = item.match ?? [item.href];
    return candidates.some((p) => pathname === p || pathname.startsWith(`${p}/`));
  }

  const queryClient = useQueryClient();

  async function logout() {
    try {
      const res = await fetch('/api/auth/signout', { method: 'POST', ...withCsrf() });
      if (!res.ok) {
        toast.error('Failed to log out. Please try again.');
        return;
      }
      queryClient.clear();
      setOpen(false);
      router.push('/login');
      router.refresh();
    } catch {
      toast.error('Failed to log out. Please check your network connection.');
    }
  }

  const initial = useMemo(() => (userName?.charAt(0)?.toUpperCase() ?? 'H'), [userName]);

  return (
    <DrawerPrimitive.Root open={open} onOpenChange={setOpen} direction="left">
      <DrawerPrimitive.Portal>
        <DrawerPrimitive.Overlay className="bg-overlay fixed inset-0 z-[60] " />
        <DrawerPrimitive.Content
          aria-label="Primary navigation"
          className={cn(
            'surface-elevated fixed inset-y-0 left-0 z-[60] flex w-[88vw] max-w-[340px] flex-col',
            'border-r border-border rounded-sm',
            'paint-isolated',
            'focus-visible:outline-none',
          )}
          style={{
            paddingTop: 'env(safe-area-inset-top)',
            paddingBottom: 'env(safe-area-inset-bottom)',
          }}
        >
          {/* Vaul drag handle (vertical edge). */}
          <div
            aria-hidden="true"
            className="absolute right-2 top-1/2 h-12 w-1 -translate-y-1/2 rounded-sm bg-fg-subtle/30"
          />

          {/* Identity strip */}
          <DrawerPrimitive.Title asChild>
            <div className="flex items-center gap-3 px-5 pt-6 pb-5">
              <div className="size-11 rounded-sm bg-bg-elev-2 text-fg flex items-center justify-center text-sm font-bold ">
                <span className="text-lg font-bold">{initial}</span>
              </div>
              <div className="flex flex-col gap-0.5 min-w-0">
                <span className="text-fg text-base font-bold tracking-tight truncate">
                  {userName ?? 'HamaFX User'}
                </span>
                <span className="text-fg-subtle text-xs truncate">
                  {userEmail ?? 'Personal trading copilot'}
                </span>
              </div>
            </div>
          </DrawerPrimitive.Title>

          <DrawerPrimitive.Description className="sr-only">
            Navigate between chat, chart, news, calendar, alerts, journal, and settings.
          </DrawerPrimitive.Description>

          <nav
            aria-label="Primary"
            className="scrollbar-hide flex-1 overflow-y-auto px-3 pb-4"
          >
            <Section label="Markets">
              {PRIMARY.map((item) => (
                <NavLink key={item.href} item={item} active={isActive(item)} />
              ))}
            </Section>

            <Section label="Personal">
              {SECONDARY.map((item) => (
                <NavLink key={item.href} item={item} active={isActive(item)} />
              ))}
            </Section>
          </nav>

          {/* Footer */}
          <div className="border-border mt-auto border-t px-3 py-3">
            <button
              type="button"
              onClick={() => void logout()}
              className="text-fg-muted hover:text-fg hover:bg-bg-elev-2 flex min-h-[48px] w-full items-center gap-3 rounded-sm px-3 text-left text-sm font-medium transition-colors"
            >
            <span
              aria-hidden="true"
              className="text-fg-muted bg-bg-elev-3 inline-flex size-9 items-center justify-center rounded-sm"
            >
              <IconLogout className="size-4" strokeWidth={2} />
            </span>
            Sign out
            </button>
          </div>
        </DrawerPrimitive.Content>
      </DrawerPrimitive.Portal>
    </DrawerPrimitive.Root>
  );
}



// ---------------------------------------------------------------------------

function Section({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1 pt-3 first:pt-0">
      <p className="text-fg-subtle px-3 pb-1 text-xs font-semibold uppercase tracking-wider">
        {label}
      </p>
      <ul className="flex flex-col gap-0.5">{children}</ul>
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
          'group/nav relative flex min-h-[56px] items-center gap-3 rounded-sm px-3 transition-all',
          active ? 'bg-bg-elev-2 ring-1 ring-border text-fg' : 'text-fg-muted hover:bg-bg-elev-2 hover:text-fg',
        )}
      >
        <span
          aria-hidden="true"
          className={cn(
            'inline-flex size-9 items-center justify-center rounded-sm transition-colors',
            active ? 'bg-bg-elev-3 text-fg' : 'bg-bg-elev-2 text-fg-muted group-hover/nav:text-fg',
          )}
        >
          <Icon className="size-5" strokeWidth={active ? 2 : 1.75} />
        </span>
        <div className="flex min-w-0 flex-1 flex-col">
          <span className="text-sm font-semibold leading-tight">{item.label}</span>
          {item.description ? (
            <span className="text-fg-subtle truncate text-xs leading-tight">
              {item.description}
            </span>
          ) : null}
        </div>

      </Link>
    </li>
  );
}
