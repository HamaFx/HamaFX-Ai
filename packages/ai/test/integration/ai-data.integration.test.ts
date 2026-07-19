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

// Integration test: AI → Data pipeline.
//
// Validates that the AI tools layer correctly imports from and interacts
// with the data layer. Tests that cross-package function signatures match,
// that shared types are compatible, and that the full tool→data→response
// chain works with the network layer mocked.
//
// Catches:
//   - Mismatched function signatures between @hamafx/ai and @hamafx/data
//   - Shared type compatibility regressions
//   - Import resolution errors at package boundaries

import { describe, expect, it, vi, beforeEach } from 'vitest';

// Import shared types to verify cross-package type compatibility
import type { GetPriceOutput } from '@hamafx/shared';
import type { GetCandlesOutput } from '@hamafx/shared';
import { SymbolSchema, TimeframeSchema } from '@hamafx/shared';

// Import tools from the AI package — paths are relative to test/integration/
// so we need ../../src/ to reach packages/ai/src/
import { getPriceTool } from '../../src/tools/get-price';
import { getCandlesTool } from '../../src/tools/get-candles';
import { computeRiskTool } from '../../src/tools/compute-risk';
import { verifyCallTool } from '../../src/tools/verify-call';

// Mock external service boundaries — the tools' real logic runs, only
// the network/DB calls are intercepted.
const mockGetPrice = vi.fn();
const mockGetCandles = vi.fn();
const mockComputeStructure = vi.fn();

vi.mock('@hamafx/data', () => ({
  getPrice: (...args: unknown[]) => mockGetPrice(...args),
  getCandles: (...args: unknown[]) => mockGetCandles(...args),
  ProviderError: class ProviderError extends Error {
    constructor(_code: string, _provider: string, message: string) {
      super(message);
    }
  },
}));

vi.mock('@hamafx/indicators', () => ({
  computeIndicator: vi.fn(),
  computeStructure: (...args: unknown[]) => mockComputeStructure(...args),
}));

vi.mock('@hamafx/shared/logger', () => ({
  createCategorizedLogger: () => ({
    warn: vi.fn(), info: vi.fn(), error: vi.fn(), debug: vi.fn(),
  }),
  logErrorContext: vi.fn(),
}));

describe('AI → Data integration', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('get_price → @hamafx/data', () => {
    it('returns properly shaped output through the full tool chain', async () => {
      mockGetPrice.mockResolvedValue({
        bid: 1.0801, ask: 1.0803, mid: 1.0802, timestamp: Date.now(),
      });

      const exec = getPriceTool.execute as unknown as (input: { symbols: string[] }) => Promise<GetPriceOutput>;
      const result = await exec({ symbols: ['EURUSD'] });

      // Verify the output conforms to the shared GetPriceOutput type
      expect(Array.isArray(result.ticks)).toBe(true);
      expect(result.ticks.length).toBe(1);
      expect(typeof result.asOf).toBe('string');
    });

    it('uses shared SymbolSchema to validate forex symbols', () => {
      const valid = ['EURUSD', 'XAUUSD', 'GBPUSD'] as const;
      for (const sym of valid) {
        expect(SymbolSchema.safeParse(sym).success).toBe(true);
      }
      expect(SymbolSchema.safeParse('BTCUSD').success).toBe(false);
    });
  });

  describe('get_candles → @hamafx/data', () => {
    it('calls the data layer with correct symbol and timeframe', async () => {
      mockGetCandles.mockResolvedValue([]);

      const exec = getCandlesTool.execute as unknown as (
        input: { symbol: string; tf: string; count?: number },
      ) => Promise<GetCandlesOutput>;
      const result = await exec({ symbol: 'EURUSD', tf: '1h', count: 200 });

      expect(result.symbol).toBe('EURUSD');
      expect(result.tf).toBe('1h');
      expect(mockGetCandles).toHaveBeenCalledWith('EURUSD', '1h', { count: 200 });
    });

    it('validates all standard TimeframeSchema values', () => {
      const valid = ['1m', '5m', '15m', '30m', '1h', '4h', '1d', '1w'] as const;
      for (const tf of valid) {
        expect(TimeframeSchema.safeParse(tf).success).toBe(true);
      }
      expect(TimeframeSchema.safeParse('2h').success).toBe(false);
    });
  });

  describe('compute_risk — numeric pipeline', () => {
    it('calculates position sizing using shared forex metadata', async () => {
      const exec = computeRiskTool.execute as unknown as (input: {
        symbol: string; side: string; entry: number; stop: number;
        target?: number; accountUsd: number; riskPct: number;
      }) => Promise<{ riskUsd: number; pipsToStop: number; positionSizeLots: number }>;

      const result = await exec({
        symbol: 'EURUSD', side: 'long', entry: 1.085, stop: 1.082,
        target: 1.092, accountUsd: 10_000, riskPct: 1,
      });

      expect(result.riskUsd).toBeCloseTo(100, 2);
      expect(result.pipsToStop).toBeCloseTo(30, 2);
      expect(result.positionSizeLots).toBeGreaterThan(0);
    });
  });

  describe('verify_call → data + indicators', () => {
    it('validates a trade setup through data and indicator layers', async () => {
      mockGetPrice.mockResolvedValue({
        symbol: 'EURUSD', bid: 1.0799, ask: 1.0801, mid: 1.08,
        ts: Date.now(), source: 'test',
      });
      mockGetCandles.mockResolvedValue([{
        t: Date.now(), o: 1.079, h: 1.09, l: 1.07, c: 1.085,
        symbol: 'EURUSD', tf: '1h', v: null, source: 'test', fetchedAt: Date.now(),
      }]);
      mockComputeStructure.mockReturnValue({
        symbol: 'EURUSD', tf: '1h', bars: 1, fetchedAt: Date.now(),
        swings: [{ type: 'high', price: 1.095, index: 0 }],
        events: [], fvgs: [], orderBlocks: [],
      });

      const exec = verifyCallTool.execute as unknown as (input: {
        symbol: string; side: string; entry: number; stop: number; target?: number | null;
      }) => Promise<{ agree: boolean; caveats: Array<{ code: string }> }>;

      const result = await exec({
        symbol: 'EURUSD', side: 'long', entry: 1.08, stop: 1.075, target: 1.09,
      });

      expect(result.agree).toBe(true);
      expect(result.caveats).toHaveLength(0);
      // Verify both data and indicator mocks were called (proves full chain ran)
      expect(mockGetCandles).toHaveBeenCalled();
      expect(mockComputeStructure).toHaveBeenCalled();
    });
  });
});
