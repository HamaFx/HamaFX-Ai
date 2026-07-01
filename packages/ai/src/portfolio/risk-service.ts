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

// F2 — Portfolio P&L Engine & Risk Analysis
//
// Computes unrealized P&L for open positions and generates a risk report
// covering concentration, correlation, and stop-loss proximity.
//
// See DSA_FEATURE_EXPANSION_PLAN.md §F2 for the full design.

import { getPrice } from '@hamafx/data';
import type {
  PortfolioPosition,
  PortfolioRiskReport,
  PositionWithPnL,
  ConcentrationItem,
  CorrelationRiskItem,
  PositionNearStop,
  RiskAlert,
} from '@hamafx/shared';
import { getContractSize } from '@hamafx/shared';

import { listOpenPositions, getPortfolioSettings } from './position-service';

// ---------------------------------------------------------------------------
// P&L computation
// ---------------------------------------------------------------------------

/**
 * Compute P&L for a single position given a current price.
 */
export function computePnL(
  position: PortfolioPosition,
  currentPrice: number,
): PositionWithPnL {
  const contractSize = getContractSize(position.symbol);
  const priceDiff =
    position.direction === 'long'
      ? currentPrice - position.entryPrice
      : position.entryPrice - currentPrice;

  const unrealizedPnlUsd = priceDiff * contractSize * position.lotSize;
  const unrealizedPnlPct =
    position.entryPrice > 0 ? (priceDiff / position.entryPrice) * 100 : 0;

  // Risk/reward calculations
  let riskUsd: number | null = null;
  let rewardUsd: number | null = null;
  let riskRewardRatio: number | null = null;
  let distanceToStopPct: number | null = null;

  if (position.stopLoss !== null) {
    const stopDistance =
      position.direction === 'long'
        ? position.entryPrice - position.stopLoss
        : position.stopLoss - position.entryPrice;
    riskUsd = Math.abs(stopDistance) * contractSize * position.lotSize;
    distanceToStopPct =
      position.direction === 'long'
        ? ((currentPrice - position.stopLoss) / position.entryPrice) * 100
        : ((position.stopLoss - currentPrice) / position.entryPrice) * 100;
  }

  if (position.takeProfit !== null) {
    const targetDistance =
      position.direction === 'long'
        ? position.takeProfit - position.entryPrice
        : position.entryPrice - position.takeProfit;
    rewardUsd = Math.abs(targetDistance) * contractSize * position.lotSize;
  }

  if (riskUsd !== null && rewardUsd !== null && riskUsd > 0) {
    riskRewardRatio = rewardUsd / riskUsd;
  }

  return {
    ...position,
    currentPrice,
    unrealizedPnlUsd,
    unrealizedPnlPct,
    riskUsd,
    rewardUsd,
    riskRewardRatio,
    distanceToStopPct,
    stale: false,
  };
}

/**
 * Get all open positions with live P&L. Batch-fetches prices.
 * If a price fetch fails, the position is marked stale with null P&L.
 */
export async function getOpenPositionsWithPnL(
  userId: string,
): Promise<PositionWithPnL[]> {
  const positions = await listOpenPositions(userId);
  if (positions.length === 0) return [];

  // Batch fetch prices — deduplicate symbols
  const symbols = [...new Set(positions.map((p) => p.symbol))];
  const priceMap = new Map<string, number>();

  await Promise.all(
    symbols.map(async (sym) => {
      try {
        const tick = await getPrice(sym);
        priceMap.set(sym, tick.mid);
      } catch {
        // Price fetch failed — positions with this symbol will be stale
      }
    }),
  );

  return positions.map((p) => {
    const price = priceMap.get(p.symbol);
    if (price === undefined) {
      return {
        ...p,
        currentPrice: null,
        unrealizedPnlUsd: null,
        unrealizedPnlPct: null,
        riskUsd: null,
        rewardUsd: null,
        riskRewardRatio: null,
        distanceToStopPct: null,
        stale: true,
      };
    }
    return computePnL(p, price);
  });
}

// ---------------------------------------------------------------------------
// Risk Analysis
// ---------------------------------------------------------------------------

/**
 * Generate a comprehensive risk report for the user's open positions.
 */
export async function getPortfolioRiskReport(userId: string): Promise<PortfolioRiskReport> {
  const positions = await getOpenPositionsWithPnL(userId);
  const settings = await getPortfolioSettings(userId);
  const accountBalance = settings.accountBalance ?? 0;

  // Total exposure
  const totalExposureUsd = positions.reduce((sum, p) => {
    const contractSize = getContractSize(p.symbol);
    return sum + p.entryPrice * contractSize * p.lotSize;
  }, 0);

  const totalExposurePct =
    accountBalance > 0 ? (totalExposureUsd / accountBalance) * 100 : 0;

  // Total risk (distance to stop × contract size × lot)
  const totalRiskUsd = positions.reduce((sum, p) => sum + (p.riskUsd ?? 0), 0);
  const totalRiskPct = accountBalance > 0 ? (totalRiskUsd / accountBalance) * 100 : 0;

  // Concentration analysis
  const concentration: ConcentrationItem[] = [];
  const exposureBySymbol = new Map<string, number>();
  for (const p of positions) {
    const contractSize = getContractSize(p.symbol);
    const exposure = p.entryPrice * contractSize * p.lotSize;
    exposureBySymbol.set(p.symbol, (exposureBySymbol.get(p.symbol) ?? 0) + exposure);
  }
  for (const [symbol, exposure] of exposureBySymbol) {
    const pct = totalExposureUsd > 0 ? (exposure / totalExposureUsd) * 100 : 0;
    concentration.push({
      symbol,
      pct,
      alert: pct > 35, // Concentration alert threshold
    });
  }
  concentration.sort((a, b) => b.pct - a.pct);

  // Correlation risk — simplified: flag same-direction positions on
  // highly correlated pairs (e.g. EURUSD + GBPUSD both long)
  const correlationRisk: CorrelationRiskItem[] = [];
  const knownCorrelations: Record<string, number> = {
    'EURUSD-GBPUSD': 0.85,
    'EURUSD-XAUUSD': 0.3,
    'GBPUSD-XAUUSD': 0.25,
  };

  for (let i = 0; i < positions.length; i++) {
    for (let j = i + 1; j < positions.length; j++) {
      const a = positions[i]!;
      const b = positions[j]!;
      if (a.symbol === b.symbol) continue;

      const pairKey = [a.symbol, b.symbol].sort().join('-');
      const correlation = knownCorrelations[pairKey];
      if (correlation === undefined) continue;

      // Alert if same direction and high correlation
      const sameDirection = a.direction === b.direction;
      const alert = sameDirection && Math.abs(correlation) > 0.7;

      correlationRisk.push({
        pair: `${a.symbol}/${b.symbol}`,
        correlation: sameDirection ? correlation : -correlation,
        alert,
      });
    }
  }

  // Positions near stop (within 20% of stop distance)
  const positionsNearStop: PositionNearStop[] = [];
  for (const p of positions) {
    if (p.distanceToStopPct !== null && p.stopLoss !== null) {
      // Calculate total stop distance as % of entry
      const totalStopDistancePct =
        p.direction === 'long'
          ? ((p.entryPrice - p.stopLoss) / p.entryPrice) * 100
          : ((p.stopLoss - p.entryPrice) / p.entryPrice) * 100;

      if (totalStopDistancePct > 0) {
        const pctOfStopDistance = (p.distanceToStopPct / totalStopDistancePct) * 100;
        if (pctOfStopDistance < 20) {
          positionsNearStop.push({
            symbol: p.symbol,
            direction: p.direction,
            distancePct: pctOfStopDistance,
          });
        }
      }
    }
  }

  // Build alerts
  const alerts: RiskAlert[] = [];

  // Exposure alerts
  if (accountBalance > 0 && totalExposurePct > settings.maxTotalExposurePct) {
    alerts.push({
      level: 'danger',
      message: `Total exposure (${totalExposurePct.toFixed(1)}%) exceeds your max (${settings.maxTotalExposurePct}%).`,
    });
  }

  // Concentration alerts
  for (const c of concentration) {
    if (c.alert) {
      alerts.push({
        level: 'warning',
        message: `${c.symbol} concentration at ${c.pct.toFixed(1)}% (limit: 35%).`,
        symbol: c.symbol,
      });
    }
  }

  // Correlation alerts
  for (const cr of correlationRisk) {
    if (cr.alert) {
      alerts.push({
        level: 'warning',
        message: `${cr.pair} same-direction correlation risk (r=${cr.correlation.toFixed(2)}).`,
      });
    }
  }

  // Stop proximity alerts
  for (const pns of positionsNearStop) {
    alerts.push({
      level: 'danger',
      message: `${pns.symbol} ${pns.direction} position within ${pns.distancePct.toFixed(0)}% of stop loss.`,
      symbol: pns.symbol,
    });
  }

  return {
    totalExposureUsd,
    totalExposurePct,
    totalRiskUsd,
    totalRiskPct,
    concentration,
    correlationRisk,
    positionsNearStop,
    alerts,
    openPositionCount: positions.length,
  };
}