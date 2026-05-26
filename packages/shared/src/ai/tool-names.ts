// Single source of truth for AI tool identifiers. Each value here:
//   1. has an implementation in `packages/ai/src/tools/<name>.ts`
//   2. has a UI part in `apps/web/src/components/chat/parts/<name>.tsx`
//   3. is referenced by docs/07-ai-agent.md § Tools
// Adding a new entry without all three is a steering violation.

export const TOOL_NAMES = [
  'get_price',
  'get_candles',
  'get_indicators',
  'get_news',
  'get_calendar',
  'analyze_technical',
  'analyze_fundamental',
  'search_knowledge',
  'annotate_chart',
  'set_alert',
  'log_journal',
  'get_journal_stats',
] as const;

export type ToolName = (typeof TOOL_NAMES)[number];
