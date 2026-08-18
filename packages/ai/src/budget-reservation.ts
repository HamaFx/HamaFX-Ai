/**
 * Copyright 2026 Kestrel
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

// SRP-1 — Budget reservation + reconciliation, extracted from agent.ts.
//
// Wraps `tryReserveBudget` + STAB-02 "already released" bookkeeping and
// the final `applyBudgetDelta` reconciliation that previously lived inline
// in runChatInner's retry loop. The BudgetHandle encapsulates the reserved
// amount and whether the reservation has been released, preventing
// double-count underflows.

import { createCategorizedLogger } from '@kestrel/shared/logger';
import { metrics } from '@kestrel/shared';
import {
  applyBudgetDelta,
  BudgetExceededError,
  DEFAULT_TURN_ESTIMATE_USD,
  reconcileBudgetReservation,
  releaseBudgetReservation,
  tryReserveBudget,
} from './cost';

const alog = createCategorizedLogger('ai', { component: 'budget' });

export interface BudgetHandle {
  /** The dollar amount that was reserved at the start of the turn. */
  reservedUsd: number;
  /** The running total after the reservation (from daily_ai_spend). */
  spent: number;
  /** The daily cap used for this reservation. */
  max: number;
  /** Whether release() or reconcile() has already been called. */
  released: boolean;
  /**
   * Reconcile the reservation against observed cost (delta true-up).
   * Called once after a successful stream turn.
   */
  reconcile(observedUsd: number): Promise<void>;
  /**
   * Release the full reservation. Called on non-retryable errors, client
   * disconnect, or after all retry attempts are exhausted.
   * Idempotent — safe to call multiple times.
   */
  release(): Promise<void>;
}

/**
 * Atomically reserve `estimateUsd` against today's running counter for
 * `userId`. Throws `BudgetExceededError` when the reservation would
 * exceed the cap.
 */
export async function reserveTurnBudget(args: {
  userId: string;
  estimateUsd?: number;
  maxDailyUsd: number;
}): Promise<BudgetHandle> {
  const estimateUsd = args.estimateUsd ?? DEFAULT_TURN_ESTIMATE_USD;
  const reservation = await tryReserveBudget(args.userId, estimateUsd, args.maxDailyUsd);
  if (!reservation.ok) {
    throw new BudgetExceededError(reservation.spent, reservation.max);
  }

  // Phase D SLI — successful reservations. The denominator for the
  // budget-release-failure rate signal.
  metrics.increment('budget_reserved_total');

  const state = { released: false };

  return {
    reservedUsd: estimateUsd,
    spent: reservation.spent,
    max: reservation.max,
    get released() {
      return state.released;
    },
    async reconcile(observedUsd: number) {
      if (state.released) return;
      const delta = observedUsd - estimateUsd;
      try {
        if (reservation.reservationId) {
          await reconcileBudgetReservation(reservation.reservationId, observedUsd);
        } else {
          // Compatibility fallback for callers/tests using a legacy cost
          // implementation that does not return a ledger reservation ID.
          await applyBudgetDelta(args.userId, delta);
        }
        state.released = true;
      } catch (err) {
        // Keep the handle open when the sink fails so a later terminal
        // callback or outer error path can retry the correction. Marking it
        // released before the write made a failed reconciliation permanent.
        alog.error('applyBudgetDelta failed in reconcile; reservation remains open', {
          userId: args.userId,
          delta,
          err: String(err),
        });
      }
    },
    async release() {
      if (state.released) return;
      try {
        if (reservation.reservationId) {
          await releaseBudgetReservation(reservation.reservationId);
        } else {
          // Compatibility fallback for callers/tests using a legacy cost
          // implementation that does not return a ledger reservation ID.
          await applyBudgetDelta(args.userId, -estimateUsd);
        }
        state.released = true;
      } catch (err) {
        // Do not claim success when the reservation release did not reach the
        // database. The caller may invoke release again after the transient
        // database failure clears.
        // Phase D SLI — stranded spend is the budget-release-failure signal.
        metrics.increment('budget_release_failed_total');
        alog.error('applyBudgetDelta failed in release; reservation remains open', {
          userId: args.userId,
          reservedUsd: estimateUsd,
          err: String(err),
        });
      }
    },
  };
}
