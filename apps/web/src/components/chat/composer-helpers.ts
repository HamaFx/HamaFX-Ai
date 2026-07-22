// SPDX-License-Identifier: Apache-2.0

/**
 * Composer helpers — extracted pure functions for the chat composer
 * so they can be unit-tested without rendering React. The component
 * imports these and applies the tone via Tailwind class maps.
 *
 * Why pure functions in their own file:
 *   - The existing vitest config only matches .ts test files in
 *     the Node environment and does not run .tsx component tests.
 *     Keeping the logic in a .ts module lets us test thresholds
 *     cleanly without adding a new test infrastructure.
 *   - The constants MAX_TEXT_CHARS / SOFT_LIMIT_CHARS were inlined
 *     in composer.tsx; centralising them here means a future
 *     "lower the cap" change touches one file.
 */

/** Hard cap on message length. */
export const MAX_TEXT_CHARS = 8000;

/**
 * Threshold at which the char count switches from "normal" to
 * "warn" tone. Soft — the user can still type up to MAX_TEXT_CHARS.
 */
export const SOFT_LIMIT_CHARS = 7500;

export type CharCountTone = 'normal' | 'warn' | 'danger';

/**
 * Pick the visual tone for the char-count indicator based on how
 * many chars the user has typed.
 *
 *   count <= SOFT_LIMIT_CHARS  -> 'normal'  (default fg-subtle)
 *   count in (SOFT_LIMIT, MAX]  -> 'warn'    (amber, font-medium)
 *   count >  MAX_TEXT_CHARS     -> 'danger'  (bear, font-semibold)
 *
 * Note: `> MAX_TEXT_CHARS` is effectively unreachable because the
 * textarea has `maxLength={MAX_TEXT_CHARS}` and the paste handler
 * also clamps. It is kept as a safety net for IME edge cases.
 */
export function getCharCountTone(count: number): CharCountTone {
  if (count > MAX_TEXT_CHARS) return 'danger';
  if (count >= SOFT_LIMIT_CHARS) return 'warn';
  return 'normal';
}

/**
 * Format the char count for display: "{count} / {max}" with the
 * count localised via toLocaleString so 5,000+ messages get
 * thousands separators (matches existing code on line 382).
 *
 * The max is not localised — it is a constant identifier.
 */
export function formatCharCount(count: number): string {
  return `${count.toLocaleString('en-US')} / ${MAX_TEXT_CHARS}`;
}
