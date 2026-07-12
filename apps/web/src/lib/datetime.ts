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

// Shared date/time helpers extracted from duplicated definitions across
// the codebase (CC-7). Import from here instead of redefining per-module.

/**
 * Returns the local midnight (00:00:00.000) timestamp for a given epoch ms.
 */
export function startOfDay(ms: number): number {
  const d = new Date(ms);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

/**
 * Human-readable countdown: "5m 30s", "1h 2m", or "0s".
 */
export function formatCountdown(ms: number): string {
  if (ms <= 0) return 'Live now';
  const min = Math.floor(ms / 60_000);
  if (min < 60) return `in ${min}m`;
  const hr = Math.floor(min / 60);
  if (hr < 24) {
    const remMin = min % 60;
    return remMin > 0 ? `in ${hr}h ${remMin}m` : `in ${hr}h`;
  }
  const d = Math.floor(hr / 24);
  const remHr = hr % 24;
  return remHr > 0 ? `in ${d}d ${remHr}h` : `in ${d}d`;
}

/**
 * Compact timestamp display: "09:41" for today, "Mon 09:41" for this week,
 * "Jan 3" otherwise.
 */
export function formatStamp(iso: string): string {
  const d = new Date(iso);
  const now = new Date();
  const isToday =
    d.getFullYear() === now.getFullYear() &&
    d.getMonth() === now.getMonth() &&
    d.getDate() === now.getDate();
  const dayDiff = Math.floor((now.getTime() - d.getTime()) / 86_400_000);
  const hh = String(d.getHours()).padStart(2, '0');
  const mm = String(d.getMinutes()).padStart(2, '0');
  if (isToday) return `${hh}:${mm}`;
  if (dayDiff < 7) {
    return `${d.toLocaleDateString(undefined, { weekday: 'short' })} ${hh}:${mm}`;
  }
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

/**
 * Shared radio-group keyboard handler for arrow-key navigation.
 */
export function handleRadioKeyDown(e: React.KeyboardEvent): void {
  const target = e.currentTarget as HTMLElement;
  const group = target.closest('[role="radiogroup"]');
  if (!group) return;
  const items = Array.from(
    group.querySelectorAll<HTMLElement>('[role="radio"]'),
  ).filter((el) => !el.hasAttribute('disabled'));
  const idx = items.indexOf(target);
  if (idx === -1) return;
  let next: number;
  if (e.key === 'ArrowRight' || e.key === 'ArrowDown') {
    next = (idx + 1) % items.length;
  } else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') {
    next = (idx - 1 + items.length) % items.length;
  } else {
    return;
  }
  e.preventDefault();
  items[next]?.focus();
  items[next]?.click();
}

/**
 * Refresh interval per chart timeframe.
 *
 * Extracted from duplicated definitions in use-candles.ts,
 * use-chart-data.ts, and use-structure.ts.
 */

export function refetchIntervalFor(tf: '1m' | '5m' | '15m' | '30m' | '1h' | '4h' | '1d' | '1w'): number {
  switch (tf) {
    case '1m':
      return 5_000;
    case '5m':
    case '15m':
    case '30m':
    case '1h':
    case '4h':
      return 30_000;
    case '1d':
    case '1w':
      return 5 * 60_000;
  }
}
