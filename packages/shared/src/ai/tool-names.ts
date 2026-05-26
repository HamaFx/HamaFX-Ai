// Single source of truth for AI tool identifiers. Each value here:
//   1. has an implementation in `packages/ai/src/tools/<name>.ts`
//   2. is exported from the registry in `packages/ai/src/tools/index.ts`
//   3. is referenced by docs/07-ai-agent.md § Tools
// Adding a new entry without all three is a steering violation.
//
// Phase-2 candidates (NOT in this list yet — implement first, then add):
//   analyze_technical, analyze_fundamental, search_knowledge,
//   annotate_chart, get_journal_stats.

export const TOOL_NAMES = [
  'get_price',
  'get_candles',
  'get_indicators',
  'get_market_structure',
  'get_news',
  'get_calendar',
  'set_alert',
  'log_journal',
] as const;

export type ToolName = (typeof TOOL_NAMES)[number];
