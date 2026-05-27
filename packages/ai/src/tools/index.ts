// Tool registry. Adding a new tool: implement it in a sibling file then
// export it from here. Keep names in sync with `@hamafx/shared` TOOL_NAMES.

import { analyzeChartImageTool } from './analyze-chart-image';
import { analyzeFundamentalTool } from './analyze-fundamental';
import { analyzeTechnicalTool } from './analyze-technical';
import { annotateChartTool } from './annotate-chart';
import { computePositionHealthTool } from './compute-position-health';
import { computeRiskTool } from './compute-risk';
import { forecastVolatilityTool } from './forecast-volatility';
import { getCalendarTool } from './get-calendar';
import { getCandlesTool } from './get-candles';
import { getCorrelationTool } from './get-correlation';
import { getCoTTool } from './get-cot';
import { getIndicatorsTool } from './get-indicators';
import { getIntermarketTool } from './get-intermarket';
import { getJournalStatsTool } from './get-journal-stats';
import { getMarketStructureTool } from './get-market-structure';
import { getNewsTool } from './get-news';
import { getPriceTool } from './get-price';
import { getSeasonalityTool } from './get-seasonality';
import { getSessionLevelsTool } from './get-session-levels';
import { logJournalTool } from './log-journal';
import { replaySetupTool } from './replay-setup';
import { searchKnowledgeTool } from './search-knowledge';
import { setAlertTool } from './set-alert';
import { shareSnapshotTool } from './share-snapshot';
import { summarizeThreadTool } from './summarize-thread';
import { verifyCallTool } from './verify-call';

export const tools = {
  get_price: getPriceTool,
  get_candles: getCandlesTool,
  get_indicators: getIndicatorsTool,
  get_market_structure: getMarketStructureTool,
  get_news: getNewsTool,
  get_calendar: getCalendarTool,
  set_alert: setAlertTool,
  log_journal: logJournalTool,
  // Phase 2 tools
  search_knowledge: searchKnowledgeTool,
  analyze_technical: analyzeTechnicalTool,
  analyze_fundamental: analyzeFundamentalTool,
  get_journal_stats: getJournalStatsTool,
  annotate_chart: annotateChartTool,
  // Phase 3 tools
  analyze_chart_image: analyzeChartImageTool,
  get_correlation: getCorrelationTool,
  get_cot: getCoTTool,
  share_snapshot: shareSnapshotTool,
  // Phase 7b tools
  compute_risk: computeRiskTool,
  get_session_levels: getSessionLevelsTool,
  get_intermarket: getIntermarketTool,
  forecast_volatility: forecastVolatilityTool,
  get_seasonality: getSeasonalityTool,
  compute_position_health: computePositionHealthTool,
  replay_setup: replaySetupTool,
  summarize_thread: summarizeThreadTool,
  // Phase 7c tools
  verify_call: verifyCallTool,
};

export type ToolRegistry = typeof tools;
