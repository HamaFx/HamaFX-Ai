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

// F7 — Bot Platform: Command Dispatcher.
//
// Registers all bot commands and dispatches incoming messages to the
// appropriate handler. Falls back to /help for unknown commands.
//
// See DSA_FEATURE_EXPANSION_PLAN.md §F7.3 for the architecture design.

import type { BotCommand, BotContext, BotResponse, ParsedCommand } from './types';
import { parseCommand } from './types';

import { helpCommand } from './commands/help';
import { priceCommand } from './commands/price';
import { analyzeCommand } from './commands/analyze';
import { askCommand } from './commands/ask';
import { statusCommand } from './commands/status';
import { chartCommand } from './commands/chart';
import { alertCommand } from './commands/alert';
import { positionsCommand } from './commands/positions';
import { linkCommand } from './commands/link';
import { newsCommand } from './commands/news';
import { calendarCommand } from './commands/calendar';
import { committeeCommand } from './commands/committee';
import { settingsCommand } from './commands/settings';
import { meCommand } from './commands/me';

export class BotDispatcher {
  private commands = new Map<string, BotCommand>();

  constructor() {
    // Register all built-in commands
    this.register(helpCommand);
    this.register(priceCommand);
    this.register(analyzeCommand);
    this.register(askCommand);
    this.register(statusCommand);
    this.register(chartCommand);
    this.register(alertCommand);
    this.register(positionsCommand);
    this.register(linkCommand);
    // New commands (F7+ upgrade)
    this.register(newsCommand);
    this.register(calendarCommand);
    this.register(committeeCommand);
    this.register(settingsCommand);
    this.register(meCommand);
  }

  /** Register a command and all its aliases. */
  register(cmd: BotCommand): void {
    this.commands.set(cmd.name, cmd);
    for (const alias of cmd.aliases) {
      this.commands.set(alias, cmd);
    }
  }

  /** Get all registered commands (for /help listing). */
  listCommands(): BotCommand[] {
    const seen = new Set<string>();
    const result: BotCommand[] = [];
    for (const cmd of this.commands.values()) {
      if (!seen.has(cmd.name)) {
        seen.add(cmd.name);
        result.push(cmd);
      }
    }
    return result;
  }

  /**
   * Dispatch a parsed command to the appropriate handler.
   * Falls back to /help for unknown commands.
   */
  async dispatch(text: string, ctx: BotContext): Promise<BotResponse> {
    const parsed: ParsedCommand = parseCommand(text);

    if (!parsed.command) {
      // Not a command — return help
      return this.commands.get('help')!.handler([], ctx);
    }

    const handler = this.commands.get(parsed.command);
    if (!handler) {
      return {
        text: `Unknown command: /${parsed.command}\n\nType /help to see available commands.`,
      };
    }

    return handler.handler(parsed.args, ctx);
  }
}

// Singleton dispatcher instance
let _dispatcher: BotDispatcher | null = null;

export function getBotDispatcher(): BotDispatcher {
  if (!_dispatcher) {
    _dispatcher = new BotDispatcher();
  }
  return _dispatcher;
}
