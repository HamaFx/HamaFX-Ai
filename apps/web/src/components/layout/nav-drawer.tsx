'use client';

// <NavDrawer> — left-side bottom-sheet style nav. vaul's `direction="left"`
// gives us a panel that slides in from the leading edge with focus trap +
// swipe-to-dismiss + Escape-to-close out of the box. Idiomatic mobile
// pattern: hamburger in the top bar opens this drawer, taps a destination,
// drawer auto-closes.
//
// Contents:
//   - Identity strip (brand mark + tagline)
//   - Primary destinations (Chat, Chart, News, Calendar)
//   - Secondary destinations (Alerts, Journal, Settings)
//   - Footer (logout)

import {
  Activity,
  BarChart3,
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
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { Drawer as DrawerPrimitive } from 'vaul';

import { cn } from '@/lib/cn';

interface NavItem {
  href: string;
  label: string;
  icon: typeof MessageCircle;
  /** Optional caption rendered under the label. */
  description?: string;
  /** Path prefixes that should mark this item as active. Default: [href]. */
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

interface NavDrawerProps {
  trigger: React.ReactNode;
}

export function NavDrawer({ trigger }: NavDrawerProps) {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();
  const router = useRouter();

  // Auto-close on route change (after the user taps a destination).
  useEffect(() => {
    setOpen(false);
  }, [pathname]);

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
    setOpen(false);
    router.push('/login');
    router.refresh();
  }

  return (
    <DrawerPrimitive.Root open={open} onOpenChange={setOpen} direction="left">
      <DrawerPrimitive.Trigger asChild>{trigger}</DrawerPrimitive.Trigger>
      <DrawerPrimitive.Portal>
        <DrawerPrimitive.Overlay className="bg-overlay fixed inset-0 z-50 backdrop-blur-sm" />
        <DrawerPrimitive.Content
          // The role + aria-label give SR users a navigation landmark even
          // though vaul renders the panel as a plain div.
          aria-label="Primary navigation"
          className={cn(
            'glass-strong fixed inset-y-0 left-0 z-50 flex w-[88vw] max-w-[340px] flex-col',
            'border-r border-divider rounded-r-3xl',
            'focus-visible:outline-none',
          )}
          style={{
            paddingTop: 'env(safe-area-inset-top)',
            paddingBottom: 'env(safe-area-inset-bottom)',
          }}
        >
          {/* Vaul drag handle (vertical edge for left drawer). */}
          <div
            aria-hidden="true"
            className="absolute right-2 top-1/2 h-12 w-1 -translate-y-1/2 rounded-full bg-fg-subtle/30"
          />

          {/* Identity strip */}
          <DrawerPrimitive.Title asChild>
            <div className="flex items-center gap-3 px-5 pt-6 pb-5">
              <span
                aria-hidden="true"
                className="inline-flex size-11 items-center justify-center rounded-2xl"
                style={{
                  backgroundImage: 'var(--gradient-brand)',
                  boxShadow: 'var(--shadow-brand-press-strong)',
                }}
              >
                <Sparkles className="text-bg size-5" strokeWidth={2.25} />
              </span>
              <div className="flex flex-col gap-0.5">
                <span className="text-fg text-base font-bold tracking-tight">
                  Hama<span className="text-brand">FX</span>
                  <span className="text-fg-subtle font-normal">·Ai</span>
                </span>
                <span className="text-fg-muted text-xs">Personal trading copilot</span>
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
          <div className="border-divider mt-auto border-t px-3 py-3">
            <button
              type="button"
              onClick={() => void logout()}
              className="text-fg-muted hover:text-fg hover:bg-bg-elev-2 flex min-h-[48px] w-full items-center gap-3 rounded-xl px-3 text-left text-sm font-medium transition-colors"
            >
              <span
                aria-hidden="true"
                className="text-fg-muted inline-flex size-9 items-center justify-center rounded-lg"
                style={{ background: 'oklch(70% 0.02 265 / 0.1)' }}
              >
                <LogOut className="size-4" strokeWidth={2} />
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
      <p className="text-fg-subtle px-3 pb-1 text-[10px] font-semibold uppercase tracking-wider">
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
          'group/nav relative flex min-h-[56px] items-center gap-3 rounded-xl px-3 transition-colors',
          active ? 'bg-bg-elev-3 text-fg' : 'text-fg-muted hover:bg-bg-elev-2 hover:text-fg',
        )}
      >
        <span
          aria-hidden="true"
          className={cn(
            'inline-flex size-9 items-center justify-center rounded-lg transition-colors',
            active ? 'text-brand' : 'text-fg-muted group-hover/nav:text-fg',
          )}
          style={{
            background: active
              ? 'oklch(78% 0.16 78 / 0.18)'
              : 'oklch(70% 0.02 265 / 0.1)',
            boxShadow: 'var(--shadow-inset-edge-soft)',
          }}
        >
          <Icon className="size-5" strokeWidth={active ? 2 : 1.75} />
        </span>
        <div className="flex min-w-0 flex-1 flex-col">
          <span className="text-sm font-semibold leading-tight">{item.label}</span>
          {item.description ? (
            <span className="text-fg-subtle truncate text-[11px] leading-tight">
              {item.description}
            </span>
          ) : null}
        </div>
        {active ? (
          <span
            aria-hidden="true"
            className="bg-brand absolute right-3 top-1/2 size-1.5 -translate-y-1/2 rounded-full"
            style={{ boxShadow: '0 0 8px var(--color-brand)' }}
          />
        ) : null}
      </Link>
    </li>
  );
}

// Re-export icons for the trigger button if needed.
export { Activity, BarChart3 };
