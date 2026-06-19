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

// Per-tool input/output type plumbing.
//
// Outputs are sourced **centrally** from the per-tool zod schemas under
// `../schemas/tool-outputs/*` so that `ToolOutput<'get_price'>` always
// matches `GetPriceOutputSchema.parse(...).` That's the contract the chat
// parts (Requirement 2) rely on when they `safeParse` a tool result before
// rendering.
//
// Inputs continue to be declared via TS module augmentation in each
// `packages/ai/src/tools/<name>.ts` file, since the input zod schemas live
// next to the tool implementation (zod schemas in `@hamafx/shared` are
// reserved for cross-package data shapes).
//
// Adding a new tool: add the name to `tool-names.ts`, create a per-tool
// output schema under `../schemas/tool-outputs/<tool>.ts`, then wire it
// into `ToolOutputMap` below.

import type { z } from 'zod';

import type { AnalyzeChartImageOutputSchema } from '../schemas/tool-outputs/analyze-chart-image';
import type { AnalyzeFundamentalOutputSchema } from '../schemas/tool-outputs/analyze-fundamental';
import type { AnalyzeTechnicalOutputSchema } from '../schemas/tool-outputs/analyze-technical';
import type { AnnotateChartOutputSchema } from '../schemas/tool-outputs/annotate-chart';
import type { ComputePositionHealthOutputSchema } from '../schemas/tool-outputs/compute-position-health';
import type { ComputeRiskOutputSchema } from '../schemas/tool-outputs/compute-risk';
import type { ForecastVolatilityOutputSchema } from '../schemas/tool-outputs/forecast-volatility';
import type { GetCalendarOutputSchema } from '../schemas/tool-outputs/get-calendar';
import type { GetCandlesOutputSchema } from '../schemas/tool-outputs/get-candles';
import type { GetCorrelationOutputSchema } from '../schemas/tool-outputs/get-correlation';
import type { GetCoTOutputSchema } from '../schemas/tool-outputs/get-cot';
import type { GetIndicatorsOutputSchema } from '../schemas/tool-outputs/get-indicators';
import type { GetIntermarketOutputSchema } from '../schemas/tool-outputs/get-intermarket';
import type { GetJournalStatsOutputSchema } from '../schemas/tool-outputs/get-journal-stats';
import type { GetMarketStructureOutputSchema } from '../schemas/tool-outputs/get-market-structure';
import type { GetNewsOutputSchema } from '../schemas/tool-outputs/get-news';
import type { GetPriceOutputSchema } from '../schemas/tool-outputs/get-price';
import type { GetSeasonalityOutputSchema } from '../schemas/tool-outputs/get-seasonality';
import type { GetSessionLevelsOutputSchema } from '../schemas/tool-outputs/get-session-levels';
import type { LogJournalOutputSchema } from '../schemas/tool-outputs/log-journal';
import type { ReplaySetupOutputSchema } from '../schemas/tool-outputs/replay-setup';
import type { SearchKnowledgeOutputSchema } from '../schemas/tool-outputs/search-knowledge';
import type { SetAlertOutputSchema } from '../schemas/tool-outputs/set-alert';
import type { ShareSnapshotOutputSchema } from '../schemas/tool-outputs/share-snapshot';
import type { SummarizeThreadOutputSchema } from '../schemas/tool-outputs/summarize-thread';
import type { VerifyCallOutputSchema } from '../schemas/tool-outputs/verify-call';
import type { ConveneCommitteeOutputSchema } from '../schemas/tool-outputs/convene-committee';
import type { GetIntermarketResonanceOutputSchema } from '../schemas/tool-outputs/get-intermarket-resonance';
import type { GetSystemDiagnosticsOutputSchema } from '../schemas/tool-outputs/get-system-diagnostics';
import type { RunSystemActionOutputSchema } from '../schemas/tool-outputs/run-system-action';
import type { ToolName } from './tool-names';

/**
 * Per-tool input map. Augmented by each tool file:
 *
 *   declare module '@hamafx/shared' {
 *     interface ToolIOMap {
 *       get_price: { input: z.infer<typeof InputSchema> };
 *     }
 *   }
 */
// eslint-disable-next-line @typescript-eslint/no-empty-object-type
export interface ToolIOMap {}

/**
 * Per-tool output map sourced directly from the zod schemas in
 * `@shared/schemas/tool-outputs/`. This is the single source of truth for
 * the **shape** of any tool's result payload.
 */
export interface ToolOutputMap {
  get_price: z.infer<typeof GetPriceOutputSchema>;
  get_candles: z.infer<typeof GetCandlesOutputSchema>;
  get_indicators: z.infer<typeof GetIndicatorsOutputSchema>;
  get_market_structure: z.infer<typeof GetMarketStructureOutputSchema>;
  get_news: z.infer<typeof GetNewsOutputSchema>;
  get_calendar: z.infer<typeof GetCalendarOutputSchema>;
  set_alert: z.infer<typeof SetAlertOutputSchema>;
  log_journal: z.infer<typeof LogJournalOutputSchema>;
  // Phase 2 tools
  search_knowledge: z.infer<typeof SearchKnowledgeOutputSchema>;
  analyze_technical: z.infer<typeof AnalyzeTechnicalOutputSchema>;
  analyze_fundamental: z.infer<typeof AnalyzeFundamentalOutputSchema>;
  get_journal_stats: z.infer<typeof GetJournalStatsOutputSchema>;
  annotate_chart: z.infer<typeof AnnotateChartOutputSchema>;
  // Phase 3 tools
  analyze_chart_image: z.infer<typeof AnalyzeChartImageOutputSchema>;
  get_correlation: z.infer<typeof GetCorrelationOutputSchema>;
  get_cot: z.infer<typeof GetCoTOutputSchema>;
  share_snapshot: z.infer<typeof ShareSnapshotOutputSchema>;
  // Phase 7b tools
  compute_risk: z.infer<typeof ComputeRiskOutputSchema>;
  get_session_levels: z.infer<typeof GetSessionLevelsOutputSchema>;
  get_intermarket: z.infer<typeof GetIntermarketOutputSchema>;
  forecast_volatility: z.infer<typeof ForecastVolatilityOutputSchema>;
  get_seasonality: z.infer<typeof GetSeasonalityOutputSchema>;
  compute_position_health: z.infer<typeof ComputePositionHealthOutputSchema>;
  replay_setup: z.infer<typeof ReplaySetupOutputSchema>;
  summarize_thread: z.infer<typeof SummarizeThreadOutputSchema>;
  // Phase 7c tools
  verify_call: z.infer<typeof VerifyCallOutputSchema>;
  convene_committee: z.infer<typeof ConveneCommitteeOutputSchema>;
  get_intermarket_resonance: z.infer<typeof GetIntermarketResonanceOutputSchema>;
  get_system_diagnostics: z.infer<typeof GetSystemDiagnosticsOutputSchema>;
  run_system_action: z.infer<typeof RunSystemActionOutputSchema>;
}

export type ToolInput<T extends ToolName> = T extends keyof ToolIOMap
  ? ToolIOMap[T] extends { input: infer I }
    ? I
    : never
  : never;

export type ToolOutput<T extends ToolName> = T extends keyof ToolOutputMap
  ? ToolOutputMap[T]
  : never;
