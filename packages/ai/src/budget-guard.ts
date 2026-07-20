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

// PF-05 — Budget guard extracted from agent.ts.
//
// Encapsulates the daily-budget reservation + release cycle that
// every chat turn goes through. Previously inlined in agent.ts's
// runChatInner(), this module makes the budget contract explicit
// and independently testable.

import {
  applyBudgetDelta,
  BudgetExceededError,
  DEFAULT_MAX_DAILY_USD,
  DEFAULT_TURN_ESTIMATE_USD,
  tryReserveBudget,
} from './cost';

export { BudgetExceededError };

/** Result of reserving budget for a turn. */
export interface BudgetReservation {
  /** Whether the reservation was accepted. */
  ok: boolean;
  /** Current spend at reservation time. */
  spent: number;
  /** Daily cap at reservation time. */
  max: number;
  /** The estimated USD reserved for this turn. */
  reservedUsd: number;
  /** Whether the budget has been released (for idempotent release). */
  released: boolean;
}

/**
 * Reserve budget for a chat turn. Called at the start of every turn.
 * Throws BudgetExceededError if over cap.
 */
export async function reserveBudget(
  userId: string,
  maxDailyUsd: number,
): Promise<BudgetReservation> {
  const reservation = await tryReserveBudget(
    userId,
    DEFAULT_TURN_ESTIMATE_USD,
    maxDailyUsd ?? DEFAULT_MAX_DAILY_USD,
  );
  if (!reservation.ok) {
    throw new BudgetExceededError(reservation.spent, reservation.max);
  }
  return {
    ok: true,
    spent: reservation.spent,
    max: reservation.max,
    reservedUsd: DEFAULT_TURN_ESTIMATE_USD,
    released: false,
  };
}

/**
 * Reconcile the budget reservation with the actual cost after the turn
 * completes. Positive delta = we underestimated; negative = release excess.
 */
export async function reconcileBudget(
  userId: string,
  actualCostUsd: number,
  reservedUsd: number,
): Promise<void> {
  const delta = actualCostUsd - reservedUsd;
  if (Math.abs(delta) < 0.0001) return; // No meaningful difference
  await applyBudgetDelta(userId, delta).catch(() => {});
}

/**
 * Release an unused budget reservation (e.g., on non-retryable error or
 * client disconnect). Idempotent — safe to call multiple times.
 */
export async function releaseBudget(
  reservation: BudgetReservation,
  userId: string,
): Promise<void> {
  if (reservation.released) return;
  await applyBudgetDelta(userId, -(reservation.reservedUsd)).catch(() => {});
  (reservation as { released: boolean }).released = true;
}
