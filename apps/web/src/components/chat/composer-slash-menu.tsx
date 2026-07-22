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

import { cn } from '@/lib/cn';
import type { ReactNode } from 'react';

export interface SlashMenuCommand {
  command: string;
  description: string;
  placeholder: string;
  action?: 'navigate';
  href?: string;
}

interface ComposerSlashMenuProps {
  /** Whether the menu should render at all. */
  active: boolean;
  /** Filtered command list (e.g. from useSlashCommands). */
  commands: readonly SlashMenuCommand[];
  /** Full command list used to render icons. */
  allCommands: readonly { command: string; icon: ReactNode }[];
  activeIndex: number;
  onSelect: (cmd: SlashMenuCommand) => void;
  onHover: (index: number) => void;
}

export function ComposerSlashMenu({
  active,
  commands,
  allCommands,
  activeIndex,
  onSelect,
  onHover,
}: ComposerSlashMenuProps) {
  if (!active || commands.length === 0) return null;

  return (
    <div
      id="slash-command-listbox"
      role="listbox"
      aria-label="Slash commands"
      className="border-t border-border bg-bg-elev-2 px-2 py-1.5"
    >
      <p className="text-caption text-fg-subtle px-2 pb-1 font-mono uppercase tracking-wider">
        Commands
      </p>
      {commands.map((cmd, i) => {
        const orig = allCommands.find((c) => c.command === cmd.command);
        const isActive = activeIndex === i;
        return (
          <button
            key={cmd.command}
            id={`slash-cmd-${cmd.command}`}
            type="button"
            role="option"
            aria-selected={isActive}
            onMouseDown={(e) => {
              e.preventDefault();
              onSelect(cmd);
            }}
            onMouseEnter={() => onHover(i)}
            className={cn(
              'flex w-full items-center gap-3 rounded-sm px-2 py-2 text-left text-sm transition-colors',
              isActive
                ? 'bg-brand text-brand-fg'
                : 'text-fg-muted hover:bg-bg-elev-3 hover:text-fg',
            )}
          >
            <span
              className={cn(
                'flex size-7 items-center justify-center rounded-sm',
                isActive ? 'text-brand-fg' : 'text-fg-subtle',
              )}
            >
              {orig?.icon}
            </span>
            <div className="flex min-w-0 flex-1 flex-col">
              <span className="font-mono text-xs font-semibold">{cmd.command}</span>
              <span className="text-caption truncate opacity-70">{cmd.description}</span>
            </div>
            <kbd
              className={cn(
                'hidden rounded-sm border px-1.5 font-mono text-caption sm:inline',
                isActive ? 'border-brand-fg/30' : 'border-border',
              )}
            >
              ⏎
            </kbd>
          </button>
        );
      })}
    </div>
  );
}
