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

// F2 — Portfolio P&L Engine Tests
//
// Tests the pure P&L computation logic without DB or price fetches.

import { describe, expect, it } from 'vitest';

import { computePnL } from './risk-service';
import type { PortfolioPosition } from '@hamafx/shared';

function makePosition(overrides: Partial<PortfolioPosition> = {}): PortfolioPosition {
  return {
    id: '00000000-0000-0000-0000-000000000001',
    userId: 'test-user',
    symbol: 'XAUUSD',
    direction: 'long',
    lotSize: 1.0,
    entryPrice: 2650,
    stopLoss: 2600,
    takeProfit: 2750,
    openedAt: Date.now() - 86400000,
    closedAt: null,
    closePrice: null,
    status: 'open',
    notes: null,
    linkedSignalId: null,
    createdAt: Date.now() - 86400000,
    updatedAt: Date.now() - 86400000,
    ...overrides,
  };
}

describe('computePnL', () => {
  it('computes positive P&L for a winning long position', () => {
    const pos = makePosition({ direction: 'long', entryPrice: 2650, lotSize: 1.0 });
    const result = computePnL(pos, 2700);

    // XAUUSD: contract size = 100 oz, lot = 1.0
    // P&L = (2700 - 2650) * 100 * 1.0 = 5000
    expect(result.unrealizedPnlUsd).toBe(5000);
    expect(result.unrealizedPnlPct).toBeCloseTo((50 / 2650) * 100, 2);
    expect(result.stale).toBe(false);
    expect(result.currentPrice).toBe(2700);
  });

  it('computes negative P&L for a losing long position', () => {
    const pos = makePosition({ direction: 'long', entryPrice: 2650, lotSize: 1.0 });
    const result = computePnL(pos, 2600);

    // P&L = (2600 - 2650) * 100 * 1.0 = -5000
    expect(result.unrealizedPnlUsd).toBe(-5000);
    expect(result.unrealizedPnlPct).toBeCloseTo((-50 / 2650) * 100, 2);
  });

  it('computes P&L for a short position correctly', () => {
    const pos = makePosition({ direction: 'short', entryPrice: 2650, lotSize: 1.0 });
    const result = computePnL(pos, 2600);

    // Short: P&L = (2650 - 2600) * 100 * 1.0 = 5000 (profit when price drops)
    expect(result.unrealizedPnlUsd).toBe(5000);
  });

  it('computes P&L for EURUSD with correct contract size', () => {
    const pos = makePosition({
      symbol: 'EURUSD',
      direction: 'long',
      entryPrice: 1.1000,
      lotSize: 1.0,
      stopLoss: 1.0900,
      takeProfit: 1.1200,
    });
    const result = computePnL(pos, 1.1100);

    // EURUSD: contract size = 100,000, lot = 1.0
    // P&L = (1.1100 - 1.1000) * 100000 * 1.0 = 1000
    expect(result.unrealizedPnlUsd).toBeCloseTo(1000, 2);
  });

  it('computes risk and reward correctly for a long position', () => {
    const pos = makePosition({
      direction: 'long',
      entryPrice: 2650,
      stopLoss: 2600,
      takeProfit: 2750,
      lotSize: 2.0,
    });
    const result = computePnL(pos, 2680);

    // Risk = |2650 - 2600| * 100 * 2 = 10000
    expect(result.riskUsd).toBe(10000);
    // Reward = |2750 - 2650| * 100 * 2 = 20000
    expect(result.rewardUsd).toBe(20000);
    // R:R = 20000 / 10000 = 2.0
    expect(result.riskRewardRatio).toBe(2.0);
  });

  it('computes risk and reward correctly for a short position', () => {
    const pos = makePosition({
      direction: 'short',
      entryPrice: 2650,
      stopLoss: 2700,
      takeProfit: 2550,
      lotSize: 1.0,
    });
    const result = computePnL(pos, 2620);

    // Risk = |2700 - 2650| * 100 * 1 = 5000
    expect(result.riskUsd).toBe(5000);
    // Reward = |2650 - 2550| * 100 * 1 = 10000
    expect(result.rewardUsd).toBe(10000);
    expect(result.riskRewardRatio).toBe(2.0);
  });

  it('handles position with no stop loss', () => {
    const pos = makePosition({ stopLoss: null, takeProfit: null });
    const result = computePnL(pos, 2700);

    expect(result.riskUsd).toBeNull();
    expect(result.rewardUsd).toBeNull();
    expect(result.riskRewardRatio).toBeNull();
    expect(result.distanceToStopPct).toBeNull();
  });

  it('computes distance to stop for a long position', () => {
    const pos = makePosition({
      direction: 'long',
      entryPrice: 2650,
      stopLoss: 2600,
      lotSize: 1.0,
    });
    const result = computePnL(pos, 2620);

    // Distance to stop = (2620 - 2600) / 2650 * 100 = 0.7547%
    expect(result.distanceToStopPct).toBeCloseTo((20 / 2650) * 100, 2);
  });

  it('computes distance to stop for a short position', () => {
    const pos = makePosition({
      direction: 'short',
      entryPrice: 2650,
      stopLoss: 2700,
      lotSize: 1.0,
    });
    const result = computePnL(pos, 2680);

    // Distance to stop = (2700 - 2680) / 2650 * 100 = 0.7547%
    expect(result.distanceToStopPct).toBeCloseTo((20 / 2650) * 100, 2);
  });
});