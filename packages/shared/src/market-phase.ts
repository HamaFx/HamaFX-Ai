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

// F6 — Market Phase Detection
//
// Detects the current forex trading session (Sydney, Tokyo, London,
// New York, London/NY Overlap, or closed) and provides liquidity
// metadata that modulates AI behavior and signal TTLs.
//
// Forex trades 24/5 across sessions. All times are in UTC.
// Session boundaries (approximate, industry-standard):
//   Sydney:     22:00 – 07:00 UTC
//   Tokyo:      00:00 – 09:00 UTC
//   London:     08:00 – 17:00 UTC
//   New York:   13:00 – 22:00 UTC
//   Overlap:    13:00 – 17:00 UTC (London + NY simultaneously)
//
// Weekend: Friday 22:00 UTC → Sunday 22:00 UTC (market closed).

export type ForexSession =
  | 'sydney'
  | 'tokyo'
  | 'london'
  | 'newyork'
  | 'london_ny_overlap'
  | 'closed';

export type LiquidityLevel = 'high' | 'medium' | 'low';

export interface MarketPhaseContext {
  /** Current forex session. */
  session: ForexSession;
  /** Liquidity level for the current session. */
  liquidity: LiquidityLevel;
  /** Whether the market is currently open. */
  isOpen: boolean;
  /** The next session change and how many minutes until it happens. */
  nextSessionChange: {
    session: ForexSession;
    inMinutes: number;
  };
  /** Gold-specific: whether COMEX is open (relevant for XAUUSD). */
  goldSpecific?: {
    comexOpen: boolean;
  };
}

/**
 * Check if the given date falls within the forex weekend.
 * Forex closes Friday 22:00 UTC and reopens Sunday 22:00 UTC.
 */
export function isForexWeekend(now: Date = new Date()): boolean {
  const day = now.getUTCDay(); // 0 = Sunday, 6 = Saturday
  const hour = now.getUTCHours();

  // Saturday — always closed.
  if (day === 6) return true;

  // Sunday — closed until 22:00 UTC.
  if (day === 0 && hour < 22) return true;

  // Friday — closes at 22:00 UTC.
  if (day === 5 && hour >= 22) return true;

  return false;
}

/**
 * Check if COMEX is open for gold trading.
 * COMEX (Globex) hours for gold futures (approximate, CME schedule):
 *   Opens Sunday 18:00 UTC, closes Friday 17:00 UTC.
 *   Daily pause: 17:00 – 18:00 UTC (maintenance).
 *
 * Note: COMEX opens at 18:00 UTC on Sunday, which is BEFORE the
 * forex market reopens at 22:00 UTC. So we do NOT use isForexWeekend
 * for the Sunday check — COMEX has its own schedule.
 */
export function isComexOpen(now: Date = new Date()): boolean {
  const day = now.getUTCDay();
  const hour = now.getUTCHours();

  // Saturday — COMEX is closed.
  if (day === 6) return false;

  // Sunday — closed until 18:00 UTC.
  if (day === 0 && hour < 18) return false;

  // Friday — closes at 17:00 UTC (maintenance starts).
  if (day === 5 && hour >= 17) return false;

  // Daily maintenance pause 17:00 – 18:00 UTC.
  if (hour === 17) return false;

  return true;
}

/**
 * Get the next session change from the current time.
 * Returns the next session and how many minutes until it starts.
 */
function getNextSessionChange(now: Date): { session: ForexSession; inMinutes: number } {
  const utcHour = now.getUTCHours();
  const utcMin = now.getUTCMinutes();
  const currentMinutes = utcHour * 60 + utcMin;

  // Define session start times in minutes from midnight UTC, in chronological order.
  const orderedStarts = [
    { session: 'tokyo' as ForexSession, startMinutes: 0 },
    { session: 'london' as ForexSession, startMinutes: 8 * 60 },
    { session: 'london_ny_overlap' as ForexSession, startMinutes: 13 * 60 },
    { session: 'newyork' as ForexSession, startMinutes: 17 * 60 }, // overlap ends, NY continues
    { session: 'sydney' as ForexSession, startMinutes: 22 * 60 },
  ];

  for (const { session, startMinutes } of orderedStarts) {
    if (startMinutes > currentMinutes) {
      return { session, inMinutes: startMinutes - currentMinutes };
    }
  }

  // Wrap to next day — next session is Tokyo at 00:00 UTC.
  const minutesUntilMidnight = 24 * 60 - currentMinutes;
  return { session: 'tokyo', inMinutes: minutesUntilMidnight };
}

/**
 * On weekends, the next session change is Sydney open on Sunday 22:00 UTC.
 */
function getNextSessionChangeOnWeekend(now: Date): { session: ForexSession; inMinutes: number } {
  const day = now.getUTCDay();
  const hour = now.getUTCHours();
  const minute = now.getUTCMinutes();

  if (day === 0) {
    // Sunday — hours until 22:00.
    if (hour < 22) {
      const minutesUntilOpen = (22 - hour) * 60 - minute;
      return { session: 'sydney', inMinutes: minutesUntilOpen };
    }
  }

  if (day === 6) {
    // Saturday — rest of Sat + Sun until 22:00.
    const minutesUntilOpen = (24 - hour) * 60 - minute + 22 * 60;
    return { session: 'sydney', inMinutes: minutesUntilOpen };
  }

  if (day === 5) {
    // Friday after 22:00 — rest of Fri + Sat + Sun until 22:00.
    const minutesUntilOpen = (24 - hour) * 60 - minute + 24 * 60 + 22 * 60;
    return { session: 'sydney', inMinutes: minutesUntilOpen };
  }

  // Fallback — shouldn't reach here on weekends.
  return { session: 'sydney', inMinutes: 24 * 60 };
}

/**
 * Liquidity levels per session.
 * London/NY Overlap = highest liquidity (most active for XAUUSD).
 * London and NY standalone = high.
 * Tokyo = medium.
 * Sydney = low.
 */
const _SESSION_LIQUIDITY: Partial<Record<ForexSession, LiquidityLevel>> = {
  london_ny_overlap: 'high',
  london: 'high',
  newyork: 'high',
  tokyo: 'medium',
  sydney: 'low',
};

/**
 * Detect the current market phase from a Date.
 * Defaults to `new Date()` (current time) when no argument is passed.
 *
 * Returns a MarketPhaseContext with session, liquidity, open/closed status,
 * next session change, and gold-specific COMEX info.
 */
export function getMarketPhase(now: Date = new Date()): MarketPhaseContext {
  // Weekend check — market is closed.
  if (isForexWeekend(now)) {
    return {
      session: 'closed',
      liquidity: 'low',
      isOpen: false,
      nextSessionChange: getNextSessionChangeOnWeekend(now),
      goldSpecific: { comexOpen: false },
    };
  }

  const utcHour = now.getUTCHours();

  // London/NY Overlap (13:00 – 17:00 UTC) — highest liquidity.
  if (utcHour >= 13 && utcHour < 17) {
    return {
      session: 'london_ny_overlap',
      liquidity: 'high',
      isOpen: true,
      nextSessionChange: getNextSessionChange(now),
      goldSpecific: { comexOpen: isComexOpen(now) },
    };
  }

  // London session (08:00 – 13:00 UTC).
  if (utcHour >= 8 && utcHour < 13) {
    return {
      session: 'london',
      liquidity: 'high',
      isOpen: true,
      nextSessionChange: getNextSessionChange(now),
      goldSpecific: { comexOpen: isComexOpen(now) },
    };
  }

  // New York session (17:00 – 22:00 UTC).
  if (utcHour >= 17 && utcHour < 22) {
    return {
      session: 'newyork',
      liquidity: 'high',
      isOpen: true,
      nextSessionChange: getNextSessionChange(now),
      goldSpecific: { comexOpen: isComexOpen(now) },
    };
  }

  // Tokyo session (00:00 – 08:00 UTC).
  if (utcHour >= 0 && utcHour < 8) {
    return {
      session: 'tokyo',
      liquidity: 'medium',
      isOpen: true,
      nextSessionChange: getNextSessionChange(now),
      goldSpecific: { comexOpen: isComexOpen(now) },
    };
  }

  // Sydney session (22:00 – 00:00 UTC — the remaining hours).
  return {
    session: 'sydney',
    liquidity: 'low',
    isOpen: true,
    nextSessionChange: getNextSessionChange(now),
    goldSpecific: { comexOpen: isComexOpen(now) },
  };
}

/**
 * Human-readable description of a market phase, suitable for injection
 * into AI system prompts.
 */
export function describeMarketPhase(phase: MarketPhaseContext): string {
  if (!phase.isOpen) {
    return 'Market is CLOSED (weekend). No active forex trading.';
  }

  const sessionNames: Record<ForexSession, string> = {
    sydney: 'Sydney',
    tokyo: 'Tokyo (Asian)',
    london: 'London',
    newyork: 'New York',
    london_ny_overlap: 'London/NY Overlap',
    closed: 'Closed',
  };

  const liquidityDesc =
    phase.liquidity === 'high'
      ? 'high liquidity — the most active period for XAUUSD, moves are more reliable'
      : phase.liquidity === 'medium'
        ? 'medium liquidity — decent activity but less reliable for breakout setups'
        : 'low liquidity — thinner volumes, moves may be noisy and less reliable';

  const nextChange = `Next session change: ${sessionNames[phase.nextSessionChange.session]} in ${phase.nextSessionChange.inMinutes} min`;

  const goldNote = phase.goldSpecific
    ? phase.goldSpecific.comexOpen
      ? 'COMEX is open for gold futures trading.'
      : 'COMEX is closed (gold futures not trading).'
    : '';

  return `Current session: ${sessionNames[phase.session]} (${liquidityDesc}). ${nextChange}.${goldNote ? ' ' + goldNote : ''}`;
}

/**
 * Get the recommended signal TTL (time-to-live) in minutes for the
 * current session. Intraday signals during low-liquidity sessions get
 * shorter TTLs because moves are less reliable.
 */
export function getSignalTtlMinutes(phase: MarketPhaseContext): number {
  if (!phase.isOpen) return 0; // No signals when market is closed.

  switch (phase.session) {
    case 'london_ny_overlap':
      return 240; // 4 hours — high liquidity, signals hold longer
    case 'london':
      return 180; // 3 hours
    case 'newyork':
      return 180; // 3 hours
    case 'tokyo':
      return 90; // 1.5 hours — medium liquidity, shorter TTL
    case 'sydney':
      return 60; // 1 hour — low liquidity, shortest TTL
    case 'closed':
      return 0;
  }
}