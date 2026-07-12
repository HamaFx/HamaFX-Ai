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

/**
 * Static command registry for the cmd-K palette.
 *
 * Phase B — UX_UPGRADE_PLAN.md item 11.
 *
 * Pure data — no JSX, no React imports. The palette component
 * imports this list and renders rows. Adding a command is one
 * entry here; no UI changes required.
 */

import { IconBell,  IconBook,  IconCalendar,  IconSettings,  IconKey,  IconChartLine,  type Icon,  IconMessagePlus,  IconNews,  IconPlus } from '@tabler/icons-react';

export type CommandGroup = 'navigation' | 'create' | 'settings';

export interface CommandItem {
  id: string;
  group: CommandGroup;
  label: string;
  /** Search aliases — extra terms the user can type to surface this command. */
  keywords?: string[];
  icon: Icon;
  /**
   * Where to navigate. When `kind === 'navigate'`, the palette
   * pushes the path with router.push(). The component handles this.
   */
  href?: string;
  /**
   * Custom handler. When set, the palette calls this instead of
   * navigating. Use for actions like "create new chat" that need
   * imperative behavior.
   */
  action?: () => void;
  /**
   * Optional keyboard hint shown on the right side of the row
   * (e.g. "Enter" or "G S"). Strings only — we render them as
   * <kbd> chips via the existing kbd styles in the codebase.
   */
  shortcut?: string;
}

/**
 * The full registry. Order within a group is the order shown when
 * the palette opens with no query. Keep under ~30 entries — the
 * palette is for power-user navigation, not a settings catalogue.
 */
export const COMMANDS: readonly CommandItem[] = [
  // ── Navigation ───────────────────────────────────────────
  { id: 'nav-chat',  group: 'navigation', label: 'Chat',         icon: IconMessagePlus, href: '/chat' },
  { id: 'nav-chart-xau', group: 'navigation', label: 'Chart — Gold',   icon: IconChartLine, href: '/chart/XAUUSD', keywords: ['xau', 'gold', 'xauusd'] },
  { id: 'nav-chart-eur', group: 'navigation', label: 'Chart — Euro',   icon: IconChartLine, href: '/chart/EURUSD', keywords: ['eur', 'euro', 'eurusd'] },
  { id: 'nav-chart-gbp', group: 'navigation', label: 'Chart — Pound',  icon: IconChartLine, href: '/chart/GBPUSD', keywords: ['gbp', 'pound', 'cable'] },
  { id: 'nav-news',     group: 'navigation', label: 'News',         icon: IconNews, href: '/news' },
  { id: 'nav-calendar', group: 'navigation', label: 'Calendar',     icon: IconCalendar,  href: '/calendar' },
  { id: 'nav-alerts',   group: 'navigation', label: 'Alerts',       icon: IconBell,      href: '/alerts' },
  { id: 'nav-journal',  group: 'navigation', label: 'Journal',      icon: IconBook,  href: '/journal' },
  { id: 'nav-settings', group: 'navigation', label: 'Settings',     icon: IconSettings, href: '/settings' },

  // ── Create ────────────────────────────────────────────────
  // The "new chat" command is imperative; we wire it to a callback
  // when the palette mounts. We can't statically describe that here,
  // so we expose an id and let the component provide the handler.
  { id: 'create-chat',   group: 'create', label: 'New chat',     icon: IconPlus,  shortcut: 'C' },

  // ── Settings deep links ───────────────────────────────────
  { id: 'set-api-keys',  group: 'settings', label: 'API Keys',         icon: IconKey, href: '/settings/api-keys', keywords: ['byok', 'provider'] },
  { id: 'set-agent',     group: 'settings', label: 'Agent settings',   icon: IconSettings, href: '/settings/agent' },
  { id: 'set-usage',     group: 'settings', label: 'Usage & budget',   icon: IconSettings, href: '/settings/usage', keywords: ['cost', 'spend'] },
  { id: 'set-profile',   group: 'settings', label: 'Profile',          icon: IconSettings, href: '/settings/profile' },
  { id: 'set-models',    group: 'settings', label: 'Models',           icon: IconSettings, href: '/settings/models',   keywords: ['model', 'ai', 'provider'] },
  { id: 'set-appearance', group: 'settings', label: 'Appearance',      icon: IconSettings, href: '/settings',          keywords: ['theme', 'dark', 'light'] },
  { id: 'set-notifications', group: 'settings', label: 'Notifications', icon: IconSettings, href: '/settings/notifications', keywords: ['alert', 'push', 'email'] },
  { id: 'set-symbols',      group: 'settings', label: 'Symbols',         icon: IconSettings, href: '/settings/symbols',      keywords: ['watchlist', 'forex'] },
];

/**
 * Find a command by id. Returns null when not found.
 */
export function findCommand(id: string): CommandItem | null {
  return COMMANDS.find((c) => c.id === id) ?? null;
}
