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
 * Trading-session helper — converts a wall-clock instant into a
 * session label that drives the empty-state quick prompts on
 * /chat.
 *
 * Phase A — UX_UPGRADE_PLAN.md item 3.
 *
 * Sessions (UTC-anchored; the cuts are global because the FX
 * market sessions are global, not local):
 *   00:00 – 07:00 UTC  Asian
 *   07:00 – 12:00 UTC  London
 *   12:00 – 17:00 UTC  NY
 *   17:00 – 24:00 UTC  Closed (after-hours)
 *
 * Weekend window: Friday 22:00 UTC (inclusive) – Sunday 22:00 UTC
 * (exclusive). During the weekend, market microstructure is
 * different — prompts lean toward "weekly review" framing.
 *
 * Why no timezone param: the session is a property of the
 * underlying market, not of the user. A trader in Tokyo and a
 * trader in New York both see "London open" at 09:00 UTC. We
 * expose the user's tz separately for display formatting
 * (e.g. "London open at 16:00 your time"), but that is the
 * job of a different helper.
 *
 * Pure function: no I/O. Tested in apps/web/test/session.test.ts.
 */

export type TradingSession = 'asian' | 'london' | 'ny' | 'closed' | 'weekend';

export interface SessionInfo {
  session: TradingSession;
  /** Short label suitable for UI display. */
  label: string;
  /** 0 = Sunday, 1 = Monday, ... 6 = Saturday. UTC weekday. */
  weekday: number;
}

/**
 * Determine the trading session for `d` (UTC-anchored).
 */
export function getSessionInfo(d: Date): SessionInfo {
  const weekday = d.getUTCDay();
  const hour = d.getUTCHours();

  // Weekend check first — applies regardless of weekday cut.
  // Friday 22:00 UTC (inclusive) – Sunday 22:00 UTC (exclusive).
  const isWeekend =
    (weekday === 5 && hour >= 22) ||
    weekday === 6 ||
    (weekday === 0 && hour < 22);

  if (isWeekend) {
    return { session: 'weekend', label: 'Weekend', weekday };
  }

  if (hour >= 0 && hour < 7) return { session: 'asian', label: 'Asian', weekday };
  if (hour >= 7 && hour < 12) return { session: 'london', label: 'London', weekday };
  if (hour >= 12 && hour < 17) return { session: 'ny', label: 'NY', weekday };
  return { session: 'closed', label: 'Closed', weekday };
}

export function isMarketOpen(now: Date = new Date()): boolean {
  const day = now.getUTCDay();
  const hour = now.getUTCHours();
  const month = now.getUTCMonth();
  const isUsDst = month >= 2 && month <= 10;
  const closeHour = isUsDst ? 21 : 22;
  const openHour = isUsDst ? 21 : 22;
  if (day === 5 && hour >= closeHour) return false;
  if (day === 6) return false;
  if (day === 0 && hour < openHour) return false;
  return true;
}
