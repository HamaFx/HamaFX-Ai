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

export { sma, ema } from './moving-averages';
export { rsi } from './rsi';
export { macd, type MacdPoint } from './macd';
export { atr } from './atr';
export { bollinger, type BollingerPoint } from './bollinger';
export { classicPivots, pivotsAligned, type ClassicPivots } from './pivots';
export { computeIndicator, parseIndicatorParams, type ComputeArgs } from './registry';

// P0-3 — Plugin-based indicator registry (replaces switch dispatch)
export { indicatorRegistry, type IndicatorRegistry, type IndicatorPlugin } from './indicator-registry';

// Smart Money Concepts (Phase 2)
export {
  computeStructure,
  findSwings,
  detectStructure,
  detectFvgs,
  detectOrderBlocks,
  detectLiquiditySweeps,
  defaultSwingLookback,
  type ComputeStructureArgs,
} from './smc';
export { computePdhPdl, type PdhPdl } from './smc/pdh-pdl';
export { computeAsianRange, type AsianRange } from './smc/asian-range';
