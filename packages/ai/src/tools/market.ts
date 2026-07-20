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

// PF-13 — Market data tool category.
// Imported by tools/index.ts for self-registration and also exposed
// as a sub-path export: @hamafx/ai/tools/market

import { getPriceTool } from './get-price';
import { getCandlesTool } from './get-candles';
import { getIndicatorsTool } from './get-indicators';
import { getMarketStructureTool } from './get-market-structure';
import { getCorrelationTool } from './get-correlation';
import { getCoTTool } from './get-cot';
import { getIntermarketTool } from './get-intermarket';
import { getIntermarketResonanceTool } from './get-intermarket-resonance';
import { getSessionLevelsTool } from './get-session-levels';
import { getSeasonalityTool } from './get-seasonality';
import { toolRegistry } from './registry';

const marketTools = [
  ['get_price', getPriceTool],
  ['get_candles', getCandlesTool],
  ['get_indicators', getIndicatorsTool],
  ['get_market_structure', getMarketStructureTool],
  ['get_correlation', getCorrelationTool],
  ['get_cot', getCoTTool],
  ['get_intermarket', getIntermarketTool],
  ['get_intermarket_resonance', getIntermarketResonanceTool],
  ['get_session_levels', getSessionLevelsTool],
  ['get_seasonality', getSeasonalityTool],
] as const;

for (const [name, tool] of marketTools) {
  toolRegistry.register(name, tool);
}

export { toolRegistry };
export type { ToolRegistry } from './registry';
