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

import type { ComponentType } from 'react';
import {
  Bell,
  BookOpen,
  Calendar,
  Cog,
  KeyRound,
  LineChart,
  type LucideIcon,
  MessageCirclePlus,
  Newspaper,
  Plus,
  Settings as SettingsIcon,
} from 'lucide-react';

export type CommandGroup = 'navigation' | 'create' | 'settings';

export interface CommandItem {
  id: string;
  group: CommandGroup;
  label: string;
  /** Search aliases — extra terms the user can type to surface this command. */
  keywords?: string[];
  icon: LucideIcon;
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
  { id: 'nav-chat',  group: 'navigation', label: 'Chat',         icon: MessageCirclePlus, href: '/chat' },
  { id: 'nav-chart-xau', group: 'navigation', label: 'Chart — Gold',   icon: LineChart, href: '/chart/XAUUSD', keywords: ['xau', 'gold', 'xauusd'] },
  { id: 'nav-chart-eur', group: 'navigation', label: 'Chart — Euro',   icon: LineChart, href: '/chart/EURUSD', keywords: ['eur', 'euro', 'eurusd'] },
  { id: 'nav-chart-gbp', group: 'navigation', label: 'Chart — Pound',  icon: LineChart, href: '/chart/GBPUSD', keywords: ['gbp', 'pound', 'cable'] },
  { id: 'nav-news',     group: 'navigation', label: 'News',         icon: Newspaper, href: '/news' },
  { id: 'nav-calendar', group: 'navigation', label: 'Calendar',     icon: Calendar,  href: '/calendar' },
  { id: 'nav-alerts',   group: 'navigation', label: 'Alerts',       icon: Bell,      href: '/alerts' },
  { id: 'nav-journal',  group: 'navigation', label: 'Journal',      icon: BookOpen,  href: '/journal' },
  { id: 'nav-settings', group: 'navigation', label: 'Settings',     icon: SettingsIcon, href: '/settings' },

  // ── Create ────────────────────────────────────────────────
  // The "new chat" command is imperative; we wire it to a callback
  // when the palette mounts. We can't statically describe that here,
  // so we expose an id and let the component provide the handler.
  { id: 'create-chat',   group: 'create', label: 'New chat',     icon: Plus,  shortcut: 'C' },

  // ── Settings deep links ───────────────────────────────────
  { id: 'set-api-keys',  group: 'settings', label: 'API Keys',         icon: KeyRound, href: '/settings/api-keys', keywords: ['byok', 'provider'] },
  { id: 'set-agent',     group: 'settings', label: 'Agent settings',   icon: Cog,      href: '/settings/agent' },
  { id: 'set-usage',     group: 'settings', label: 'Usage & budget',   icon: Cog,      href: '/settings/usage', keywords: ['cost', 'spend'] },
  { id: 'set-profile',   group: 'settings', label: 'Profile',          icon: Cog,      href: '/settings/profile' },
];

/**
 * Find a command by id. Returns null when not found.
 */
export function findCommand(id: string): CommandItem | null {
  return COMMANDS.find((c) => c.id === id) ?? null;
}

import { z } from 'zod';

export const commandSchema = z.object({
  id: z.string().min(1, 'Command ID is required'),
  group: z.enum(['navigation', 'create', 'settings']),
  label: z.string().min(1, 'Label is required'),
  keywords: z.array(z.string()).optional(),
  icon: z.any(),
  href: z.string().optional(),
  action: z.function().optional(),
  shortcut: z.string().optional(),
});

export type Command = CommandItem;

export function validateCommand(command: unknown): Command {
  return commandSchema.parse(command) as Command;
}

export type { ComponentType };
