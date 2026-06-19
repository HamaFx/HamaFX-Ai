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

import { describe, expect, it } from 'vitest';

import { computeRiskTool } from '../src/tools/compute-risk';

// The tool is registered via `tool({ ..., execute })`; we get at the
// underlying implementation via `.execute` for direct testing.
const exec = computeRiskTool.execute as unknown as (input: unknown) => Promise<{
  symbol: string;
  side: string;
  riskUsd: number;
  rewardUsd: number | null;
  rrRatio: number | null;
  pipsToStop: number;
  pipsToTarget: number | null;
  positionSizeLots: number;
  positionSizeUnits: number;
  invalidDirection: boolean;
  summary: string;
}>;

describe('compute_risk — Phase 7b', () => {
  it('sizes a 1 % EURUSD long correctly', async () => {
    const r = await exec({
      symbol: 'EURUSD',
      side: 'long',
      entry: 1.085,
      stop: 1.082,
      target: 1.092,
      accountUsd: 10_000,
      riskPct: 1,
    });
    // 1 % of 10k = $100 risk; pipsToStop = 30; pip value $10/lot
    // → size = 100 / (30 * 10) = 0.333… lots
    expect(r.riskUsd).toBeCloseTo(100, 6);
    expect(r.pipsToStop).toBeCloseTo(30, 6);
    expect(r.positionSizeLots).toBeCloseTo(100 / (30 * 10), 6);
    expect(r.positionSizeUnits).toBeCloseTo(((100 / (30 * 10)) * 100_000), 0);
    expect(r.rrRatio).toBeCloseTo(70 / 30, 6);
    expect(r.invalidDirection).toBe(false);
  });

  it('sizes XAUUSD with the gold pip schedule', async () => {
    const r = await exec({
      symbol: 'XAUUSD',
      side: 'short',
      entry: 2400,
      stop: 2410,
      target: 2380,
      accountUsd: 10_000,
      riskPct: 1,
    });
    // pipsToStop on gold = 10 / 0.1 = 100 pips
    expect(r.pipsToStop).toBeCloseTo(100, 6);
    expect(r.riskUsd).toBeCloseTo(100, 6);
    // 100 / (100 * 10) = 0.1 lot
    expect(r.positionSizeLots).toBeCloseTo(0.1, 6);
    expect(r.rrRatio).toBeCloseTo(20 / 10, 6); // RR 2 (target is 20$, stop is 10$)
    expect(r.invalidDirection).toBe(false);
  });

  it('returns null reward + RR when target is omitted', async () => {
    const r = await exec({
      symbol: 'GBPUSD',
      side: 'long',
      entry: 1.27,
      stop: 1.265,
      accountUsd: 5_000,
      riskPct: 0.5,
    });
    expect(r.rewardUsd).toBeNull();
    expect(r.rrRatio).toBeNull();
    expect(r.pipsToTarget).toBeNull();
    expect(r.invalidDirection).toBe(false);
  });

  it('flags invalidDirection when stop is on the wrong side of entry', async () => {
    const long = await exec({
      symbol: 'EURUSD',
      side: 'long',
      entry: 1.08,
      stop: 1.085, // above entry — wrong for a long
      target: 1.075,
      accountUsd: 10_000,
      riskPct: 1,
    });
    expect(long.invalidDirection).toBe(true);

    const short = await exec({
      symbol: 'EURUSD',
      side: 'short',
      entry: 1.08,
      stop: 1.075, // below entry — wrong for a short
      target: 1.085,
      accountUsd: 10_000,
      riskPct: 1,
    });
    expect(short.invalidDirection).toBe(true);
  });

  it('caps riskPct at 10 % via the input schema', async () => {
    // The AI SDK validates the input schema before invoking `execute()`,
    // so we exercise the schema directly here. `tool({})` exposes the
    // schema on `inputSchema`.
    const schema = computeRiskTool.inputSchema as { safeParse: (v: unknown) => { success: boolean } };
    expect(
      schema.safeParse({
        symbol: 'EURUSD',
        side: 'long',
        entry: 1.08,
        stop: 1.075,
        accountUsd: 10_000,
        riskPct: 11,
      }).success,
    ).toBe(false);
  });

  it('emits a useful summary string the agent can echo verbatim', async () => {
    const r = await exec({
      symbol: 'EURUSD',
      side: 'long',
      entry: 1.085,
      stop: 1.082,
      target: 1.092,
      accountUsd: 10_000,
      riskPct: 1,
    });
    expect(r.summary).toMatch(/Long EURUSD/);
    expect(r.summary).toMatch(/lots/);
    expect(r.summary).toMatch(/at risk/);
    expect(r.summary).toMatch(/RR/);
  });
});
