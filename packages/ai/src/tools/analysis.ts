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

// PF-13 — Analysis tool category.
// Imported by tools/index.ts for self-registration and also exposed
// as a sub-path export: @hamafx/ai/tools/analysis

import { analyzeTechnicalTool } from './analyze-technical';
import { analyzeFundamentalTool } from './analyze-fundamental';
import { analyzeChartImageTool } from './analyze-chart-image';
import { annotateChartTool } from './annotate-chart';
import { forecastVolatilityTool } from './forecast-volatility';
import { computeRiskTool } from './compute-risk';
import { computePositionHealthTool } from './compute-position-health';
import { toolRegistry } from './registry';

const analysisTools = [
  ['analyze_technical', analyzeTechnicalTool],
  ['analyze_fundamental', analyzeFundamentalTool],
  ['analyze_chart_image', analyzeChartImageTool],
  ['annotate_chart', annotateChartTool],
  ['forecast_volatility', forecastVolatilityTool],
  ['compute_risk', computeRiskTool],
  ['compute_position_health', computePositionHealthTool],
] as const;

for (const [name, tool] of analysisTools) {
  toolRegistry.register(name, tool);
}

export { toolRegistry };
export type { ToolRegistry } from './registry';
