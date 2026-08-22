// SPDX-License-Identifier: Apache-2.0

'use client';

import {
  IconBell,
  IconBook,
  IconCalendar,
  IconChartLine,
  IconChevronLeft,
  IconChevronRight,
  IconLayoutDashboard,
  IconLogout,
  IconMessageCircle,
  IconNews,
  IconSettings,
  IconShield,
} from '@tabler/icons-react';
import { Link } from 'next-view-transitions';
import { usePathname } from 'next/navigation';
import { signOut } from 'next-auth/react';
import { toast } from 'sonner';

import { KestrelBrand } from '@/components/brand/kestrel-brand';
import { cn } from '@/lib/cn';

import { useSidebarState } from './sidebar-state-context';

interface NavItem {
  href: string;
  label: string;
  icon: typeof IconMessageCircle;
  match?: readonly string[];
}

const PRIMARY_ITEMS: readonly NavItem[] = [
  { href: '/dashboard', label: 'Dashboard', icon: IconLayoutDashboard },
  { href: '/chat', label: 'Chat', icon: IconMessageCircle },
  { href: '/chart/XAUUSD', label: 'Chart', icon: IconChartLine, match: ['/chart'] },
  { href: '/news', label: 'News', icon: IconNews },
  { href: '/calendar', label: 'Calendar', icon: IconCalendar },
  { href: '/alerts', label: 'Alerts', icon: IconBell },
  { href: '/journal', label: 'Journal', icon: IconBook },
];

export function DesktopSidebar({
  userName,
  userEmail,
  isAdmin,
}: {
  userName?: string;
  userEmail?: string;
  isAdmin?: boolean;
}) {
  const { collapsed, toggle: toggleCollapsed } = useSidebarState();
  const pathname = usePathname() ?? '';

  function isActive(item: NavItem): boolean {
    const candidates = item.match ?? [item.href];
    return candidates.some((p) => pathname === p || pathname.startsWith(`${p}/`));
  }

  async function handleLogout() {
    try {
      await signOut({ callbackUrl: '/login', redirect: true });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Logout failed');
    }
  }

  const initial = userName?.charAt(0)?.toUpperCase() || userEmail?.charAt(0)?.toUpperCase() || 'K';

  return (
    <aside
      aria-label="Desktop navigation sidebar"
      className={cn(
        'hidden lg:flex fixed top-0 bottom-0 left-0 z-40 flex-col justify-between',
        'border-r border-border bg-bg-elev-1 transition-all duration-200 select-none',
        collapsed ? 'w-16' : 'w-56',
      )}
      style={{
        paddingTop: 'max(env(safe-area-inset-top), 12px)',
        paddingBottom: 'max(env(safe-area-inset-bottom), 12px)',
      }}
    >
      {/* Top Header / Brand */}
      <div className="flex flex-col gap-4 px-2">
        <div className="flex items-center justify-between px-2 pt-1 h-10">
          <KestrelBrand
            variant={collapsed ? 'mark' : 'lockup'}
            markSize="sm"
            href="/chat"
            className="overflow-hidden"
          />
          <button
            type="button"
            onClick={toggleCollapsed}
            className="text-fg-subtle hover:text-fg hover:bg-bg-elev-2 rounded-sm p-1 transition-colors"
            aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
            title={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          >
            {collapsed ? <IconChevronRight className="size-4" /> : <IconChevronLeft className="size-4" />}
          </button>
        </div>

        {/* Primary Nav List */}
        <nav className="flex flex-col gap-1">
          {PRIMARY_ITEMS.map((item) => {
            const active = isActive(item);
            const Icon = item.icon;
            return (
              <Link
                key={item.href}
                href={item.href}
                prefetch={true}
                className={cn(
                  'flex items-center gap-3 rounded-sm px-2.5 py-2 text-sm font-medium transition-colors relative group',
                  active
                    ? 'bg-bg-elev-2 text-fg border-l-2 border-brand'
                    : 'text-fg-muted hover:text-fg hover:bg-bg-elev-2/60 border-l-2 border-transparent',
                )}
                title={collapsed ? item.label : undefined}
              >
                <Icon className={cn('size-5 shrink-0', active ? 'text-brand' : 'text-fg-subtle group-hover:text-fg')} />
                {!collapsed && <span className="truncate">{item.label}</span>}
              </Link>
            );
          })}
        </nav>
      </div>

      {/* Bottom Footer Items */}
      <div className="flex flex-col gap-1 px-2 border-t border-border/60 pt-3">
        {isAdmin && (
          <Link
            href="/admin"
            prefetch={true}
            className={cn(
              'flex items-center gap-3 rounded-sm px-2.5 py-2 text-sm font-medium transition-colors relative group',
              pathname.startsWith('/admin')
                ? 'bg-bg-elev-2 text-fg border-l-2 border-brand'
                : 'text-fg-muted hover:text-fg hover:bg-bg-elev-2/60 border-l-2 border-transparent',
            )}
            title={collapsed ? 'Admin' : undefined}
          >
            <IconShield className={cn('size-5 shrink-0', pathname.startsWith('/admin') ? 'text-brand' : 'text-fg-subtle group-hover:text-fg')} />
            {!collapsed && <span className="truncate">Admin</span>}
          </Link>
        )}

        <Link
          href="/settings"
          prefetch={true}
          className={cn(
            'flex items-center gap-3 rounded-sm px-2.5 py-2 text-sm font-medium transition-colors relative group',
            pathname.startsWith('/settings')
              ? 'bg-bg-elev-2 text-fg border-l-2 border-brand'
              : 'text-fg-muted hover:text-fg hover:bg-bg-elev-2/60 border-l-2 border-transparent',
          )}
          title={collapsed ? 'Settings' : undefined}
        >
          <IconSettings className={cn('size-5 shrink-0', pathname.startsWith('/settings') ? 'text-brand' : 'text-fg-subtle group-hover:text-fg')} />
          {!collapsed && <span className="truncate">Settings</span>}
        </Link>

        {/* User profile & Logout */}
        <div className="flex items-center justify-between gap-2 px-2 py-2 mt-1">
          <div className="flex items-center gap-2 min-w-0">
            <div className="size-7 rounded-sm bg-bg-elev-3 text-fg font-mono text-xs font-bold flex items-center justify-center border border-border shrink-0">
              {initial}
            </div>
            {!collapsed && (
              <div className="flex flex-col min-w-0">
                <span className="text-fg text-xs font-semibold truncate">{userName || 'Trader'}</span>
                <span className="text-fg-subtle text-[10px] truncate">{userEmail || ''}</span>
              </div>
            )}
          </div>

          <button
            type="button"
            onClick={handleLogout}
            className="text-fg-subtle hover:text-danger rounded-sm p-1 transition-colors"
            title="Sign out"
            aria-label="Sign out"
          >
            <IconLogout className="size-4" />
          </button>
        </div>
      </div>
    </aside>
  );
}
