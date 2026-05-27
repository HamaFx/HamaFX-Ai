// Single source of truth for AI tool identifiers. Each value here:
//   1. has an implementation in `packages/ai/src/tools/<name>.ts`
//   2. is exported from the registry in `packages/ai/src/tools/index.ts`
//   3. is referenced by docs/07-ai-agent.md § Tools
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
] as const;

export type ToolName = (typeof TOOL_NAMES)[number];
