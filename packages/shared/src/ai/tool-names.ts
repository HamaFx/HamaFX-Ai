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

// Single source of truth for AI tool identifiers. Each value here:
//   1. has an implementation in `packages/ai/src/tools/<name>.ts`
//   2. is exported from the registry in `packages/ai/src/tools/index.ts`
//   3. is referenced by docs/03-ai-agent.md § "Tool Catalogue"
// Adding a new entry without all three is a steering violation.
//
export const TOOL_NAMES = [
  'get_price',
  'get_candles',
  'get_indicators',
  'get_market_structure',
  'get_news',
  'get_calendar',
  'set_alert',
  'log_journal',
  // Phase 2 tools
  'search_knowledge',
  'analyze_technical',
  'analyze_fundamental',
  'get_journal_stats',
  'annotate_chart',
  // Phase 3 tools
  'analyze_chart_image',
  'get_correlation',
  'get_cot',
  'share_snapshot',
  // Phase 7b tools
  'compute_risk',
  'get_session_levels',
  'get_intermarket',
  'forecast_volatility',
  'get_seasonality',
  'compute_position_health',
  'replay_setup',
  'summarize_thread',
  // Phase 7c tools
  'verify_call',
  'convene_committee',
  'get_intermarket_resonance',
  'get_system_diagnostics',
  'run_system_action',
  // F2 — Portfolio Management
  'get_portfolio_snapshot',
  // F3 — Social Sentiment
  'get_social_sentiment',
] as const;

export type ToolName = (typeof TOOL_NAMES)[number];
