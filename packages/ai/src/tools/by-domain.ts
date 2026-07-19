/**
 * H3 — Domain-based tool subsetting.
 *
 * Maps each routing domain to the subset of tools relevant to that domain.
 * Reduces per-turn token overhead by 60-80% (from ~2000-4000 tokens of
 * tool descriptions down to ~400-800 for typical turns).
 *
 * Domains:
 *   - fundamental: news, calendar, CoT, fundamentals analysis, sentiment
 *   - technical: price, candles, indicators, structure, session levels
 *   - generic: keep all tools (fallback for unclassified messages)
 *
 * Tools listed as 'always' are included in every domain (e.g. set_alert,
 * log_journal, summarize_thread — user-facing actions).
 */

import type { Tool } from 'ai';
import { tools as allTools, type ToolRegistry } from './index';

export type RoutingDomain = 'fundamental' | 'technical' | 'generic';

/** Tools included in every domain (user-facing actions). */
const ALWAYS_TOOLS: ReadonlySet<string> = new Set([
  'get_price',
  'set_alert',
  'log_journal',
  'summarize_thread',
  'search_knowledge',
]);

const DOMAIN_TOOLS: Record<Exclude<RoutingDomain, 'generic'>, ReadonlySet<string>> = {
  fundamental: new Set([
    ...ALWAYS_TOOLS,
    'get_news',
    'get_calendar',
    'get_cot',
    'analyze_fundamental',
    'get_correlation',
    'get_intermarket',
    'get_intermarket_resonance',
    'get_seasonality',
    'get_social_sentiment',
    'compute_risk',
    'forecast_volatility',
    'verify_call',
  ]),
  technical: new Set([
    ...ALWAYS_TOOLS,
    'get_candles',
    'get_indicators',
    'get_market_structure',
    'get_session_levels',
    'analyze_technical',
    'analyze_chart_image',
    'annotate_chart',
    'compute_position_health',
    'get_journal_stats',
    'replay_setup',
    'get_portfolio_snapshot',
  ]),
};

/**
 * Return a filtered copy of the tool registry containing only tools
 * relevant to the given routing domain. 'generic' domains get all tools.
 */
export function domainToolFilter(
  domain: RoutingDomain,
): Partial<ToolRegistry> {
  if (domain === 'generic') return allTools;

  const allowed = DOMAIN_TOOLS[domain];
  const filtered: Partial<ToolRegistry> = {};
  for (const [name, tool] of Object.entries(allTools)) {
    if (allowed.has(name)) {
      (filtered as Record<string, Tool>)[name] = tool;
    }
  }
  return filtered;
}
