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

// Slash command hook extracted from composer.tsx (M3 audit fix).
//
// Handles:
//   - Slash command detection & filtering
//   - Keyboard navigation (ArrowUp/Down, Escape, Tab, Enter)
//   - Command selection with cursor placement

import { useMemo, useState, type RefObject } from 'react';

interface SlashCommand {
  command: string;
  description: string;
  placeholder: string;
  action?: 'navigate';
  href?: string;
}

interface UseSlashCommandsOptions {
  value: string;
  setValue: React.Dispatch<React.SetStateAction<string>>;
  textareaRef: RefObject<HTMLTextAreaElement | null>;
  commands: readonly SlashCommand[];
}

interface UseSlashCommandsResult {
  slashActive: boolean;
  slashQuery: string;
  filteredCommands: SlashCommand[];
  slashIndex: number;
  setSlashIndex: React.Dispatch<React.SetStateAction<number>>;
  selectSlashCommand: (cmd: SlashCommand) => void;
  handleSlashKeyDown: (e: React.KeyboardEvent<HTMLTextAreaElement>) => boolean;
  handleSlashChange: (newValue: string) => void;
}

export function useSlashCommands({
  value,
  setValue,
  textareaRef,
  commands,
}: UseSlashCommandsOptions): UseSlashCommandsResult {
  const [slashIndex, setSlashIndex] = useState(-1);

  const slashActive = value.startsWith('/') && value.length < 40;
  const slashQuery = slashActive ? value.slice(1).toLowerCase() : '';

  const filteredCommands = useMemo(() => {
    if (!slashActive) return [];
    if (!slashQuery) return [...commands];
    return commands.filter((c) =>
      c.command.toLowerCase().includes(slashQuery),
    );
  }, [slashActive, slashQuery, commands]);

  function selectSlashCommand(cmd: SlashCommand) {
    if (cmd.action === 'navigate' && cmd.href) {
      window.location.href = cmd.href;
      return;
    }
    setValue(cmd.placeholder);
    setSlashIndex(-1);
    requestAnimationFrame(() => {
      const el = textareaRef.current;
      if (el) {
        const len = cmd.placeholder.length;
        el.setSelectionRange(len, len);
      }
    });
  }

  function handleSlashChange(newValue: string) {
    setValue(newValue);
    if (!newValue.startsWith('/')) {
      setSlashIndex(-1);
    } else if (slashIndex >= filteredCommands.length) {
      setSlashIndex(-1);
    }
  }

  /** Returns true if the event was handled (caller should return early). */
  function handleSlashKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>): boolean {
    if (!slashActive || filteredCommands.length === 0) return false;

    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setSlashIndex((prev) =>
        prev < filteredCommands.length - 1 ? prev + 1 : 0,
      );
      return true;
    }
    if (e.key === 'ArrowUp') {
      e.preventDefault();
      setSlashIndex((prev) =>
        prev > 0 ? prev - 1 : filteredCommands.length - 1,
      );
      return true;
    }
    if (e.key === 'Escape') {
      e.preventDefault();
      setSlashIndex(-1);
      return true;
    }
    if (e.key === 'Tab') {
      e.preventDefault();
      const idx = slashIndex >= 0 ? slashIndex : 0;
      const cmd = filteredCommands[idx];
      if (cmd) selectSlashCommand(cmd);
      return true;
    }
    if (e.key === 'Enter' && !e.shiftKey) {
      // Let the caller handle Enter + slash command selection.
      if (slashIndex >= 0 && slashIndex < filteredCommands.length) {
        const cmd = filteredCommands[slashIndex];
        if (cmd) {
          e.preventDefault();
          selectSlashCommand(cmd);
          return true;
        }
      }
    }
    return false;
  }

  return {
    slashActive,
    slashQuery,
    filteredCommands,
    slashIndex,
    setSlashIndex,
    selectSlashCommand,
    handleSlashKeyDown,
    handleSlashChange,
  };
}
