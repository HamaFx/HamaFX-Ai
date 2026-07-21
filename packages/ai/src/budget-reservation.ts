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

// SRP-1 — Budget reservation + reconciliation, extracted from agent.ts.
//
// Wraps `tryReserveBudget` + STAB-02 "already released" bookkeeping and
// the final `applyBudgetDelta` reconciliation that previously lived inline
// in runChatInner's retry loop. The BudgetHandle encapsulates the reserved
// amount and whether the reservation has been released, preventing
// double-count underflows.

import { createCategorizedLogger } from '@hamafx/shared/logger';
import {
  applyBudgetDelta,
  BudgetExceededError,
  DEFAULT_TURN_ESTIMATE_USD,
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

  const state = { released: false };

  return {
    reservedUsd: estimateUsd,
    spent: reservation.spent,
    max: reservation.max,
    get released() {
      return state.released;
    },
    async reconcile(observedUsd: number) {
      state.released = true;
      const delta = observedUsd - estimateUsd;
      await applyBudgetDelta(args.userId, delta).catch((err) =>
        alog.warn('applyBudgetDelta failed in reconcile', { err: String(err) }),
      );
    },
    async release() {
      if (state.released) return;
      state.released = true;
      await applyBudgetDelta(args.userId, -estimateUsd).catch((err) =>
        alog.warn('applyBudgetDelta failed in release', { err: String(err) }),
      );
    },
  };
}
