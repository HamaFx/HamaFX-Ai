// Tool registry. Adding a new tool: implement it in a sibling file then
// export it from here. Keep names in sync with `@hamafx/shared` TOOL_NAMES.
//
// Tools NOT yet implemented in Phase 1b are intentionally absent — adding
// them prematurely with stub `execute()` would make the model believe they
// can do work they can't.

import { getCalendarTool } from './get-calendar';
import { getCandlesTool } from './get-candles';
import { getIndicatorsTool } from './get-indicators';
import { getNewsTool } from './get-news';
import { getPriceTool } from './get-price';

export const tools = {
  get_price: getPriceTool,
  get_candles: getCandlesTool,
  get_indicators: getIndicatorsTool,
  get_news: getNewsTool,
  get_calendar: getCalendarTool,
};

export type ToolRegistry = typeof tools;
