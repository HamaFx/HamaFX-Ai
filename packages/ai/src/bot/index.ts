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

// F7 — Bot Platform with Commands.
// Barrel for the bot subsystem.

export { BotDispatcher, getBotDispatcher } from './dispatcher';
export { parseCommand } from './types';
export type { BotCommand, BotContext, BotResponse, BotPlatform, ParsedCommand } from './types';
export {
  createLinkCode,
  resolveLinkCode,
  resolveBotUser,
  unlinkBot,
  getBotLink,
} from './linking';
