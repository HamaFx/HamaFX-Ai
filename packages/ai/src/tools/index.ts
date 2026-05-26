// Tool registry. Adding a new tool: implement it in a sibling file then
// export it from here. Keep names in sync with `@hamafx/shared` TOOL_NAMES.

import { getCalendarTool } from './get-calendar';
import { getCandlesTool } from './get-candles';
import { getIndicatorsTool } from './get-indicators';
import { getNewsTool } from './get-news';
import { getPriceTool } from './get-price';
import { logJournalTool } from './log-journal';
import { setAlertTool } from './set-alert';

export const tools = {
  get_price: getPriceTool,
  get_candles: getCandlesTool,
  get_indicators: getIndicatorsTool,
  get_news: getNewsTool,
  get_calendar: getCalendarTool,
  set_alert: setAlertTool,
  log_journal: logJournalTool,
};

export type ToolRegistry = typeof tools;
