// SPDX-License-Identifier: Apache-2.0

// Tool-part registry: dispatches a streamed `tool-<name>` chat part to the
// matching bespoke renderer (one per `ToolName`), or falls back to the
// generic `ToolCard` when:
//   1. the streamed name is not a known `ToolName` (defensive — the chat
//      route only emits tools we control today, but a future version
//      mismatch shouldn't crash the UI), or
//   2. the per-tool zod schema fails to parse the raw `output` payload (the
//      tool result was malformed — better to show the raw card than a
//      broken bespoke part).
//
// The compile-time guarantee from `partRegistry: { [K in ToolName]: ... }`
// is the whole point: adding a new entry to `TOOL_NAMES` without wiring a
// part here is a TypeScript error, so the chat surface can never silently
// drop a tool.
//
// Server component — no state, no events.

import {
  AnalyzeChartImageOutputSchema,
  AnalyzeFundamentalOutputSchema,
  AnalyzeTechnicalOutputSchema,
  AnnotateChartOutputSchema,
  ComputePositionHealthOutputSchema,
  ComputeRiskOutputSchema,
  ConveneCommitteeOutputSchema,
  ForecastVolatilityOutputSchema,
  GetCalendarOutputSchema,
  GetCandlesOutputSchema,
  GetCorrelationOutputSchema,
  GetCoTOutputSchema,
  GetIndicatorsOutputSchema,
  GetIntermarketOutputSchema,
  GetIntermarketResonanceOutputSchema,
  GetSystemDiagnosticsOutputSchema,
  RunSystemActionOutputSchema,
  GetJournalStatsOutputSchema,
  GetMarketStructureOutputSchema,
  GetNewsOutputSchema,
  GetPriceOutputSchema,
  GetSeasonalityOutputSchema,
  GetSessionLevelsOutputSchema,
  LogJournalOutputSchema,
  ReplaySetupOutputSchema,
  SearchKnowledgeOutputSchema,
  SetAlertOutputSchema,
  ShareSnapshotOutputSchema,
  SummarizeThreadOutputSchema,
  TOOL_NAMES,
  VerifyCallOutputSchema,
  GetPortfolioSnapshotOutputSchema,
  GetSocialSentimentOutputSchema,
  type ToolName,
  type ToolOutput,
} from '@hamafx/shared';
import type { ComponentType, ReactElement } from 'react';
import type { z } from 'zod';

import { AnalyzeChartImagePart } from './analyze-chart-image';
import { AnalyzeFundamentalPart } from './analyze-fundamental';
import { AnalyzeTechnicalPart } from './analyze-technical';
import { AnnotateChartPart } from './annotate-chart';
import { ComputePositionHealthPart } from './compute-position-health';
import { ComputeRiskPart } from './compute-risk';
import { ConveneCommitteePart } from './convene-committee';
import { ForecastVolatilityPart } from './forecast-volatility';
import { GetCalendarPart } from './get-calendar';
import { GetCandlesPart } from './get-candles';
import { GetCorrelationPart } from './get-correlation';
import { GetCoTPart } from './get-cot';
import { GetIndicatorsPart } from './get-indicators';
import { GetIntermarketPart } from './get-intermarket';
import { GetJournalStatsPart } from './get-journal-stats';
import { GetMarketStructurePart } from './get-market-structure';
import { GetNewsPart } from './get-news';
import { GetPricePart } from './get-price';
import { GetSeasonalityPart } from './get-seasonality';
import { GetSessionLevelsPart } from './get-session-levels';
import { LogJournalPart } from './log-journal';
import { ReplaySetupPart } from './replay-setup';
import { SearchKnowledgePart } from './search-knowledge';
import { SetAlertPart } from './set-alert';
import { ShareSnapshotPart } from './share-snapshot';
import { SummarizeThreadPart } from './summarize-thread';
import { ToolCard } from './tool-card';
import { VerifyCallPart } from './verify-call';
import { GetIntermarketResonancePart } from './get-intermarket-resonance';
import { GetSystemDiagnosticsPart } from './get-system-diagnostics';
import { RunSystemActionPart } from './run-system-action';
import { GetPortfolioSnapshotPart } from './get-portfolio-snapshot';
import { GetSocialSentimentPart } from './get-social-sentiment';

/** State a part is in for the duration of a streamed tool call. */
export type ToolPartState = 'loading' | 'done' | 'error';

/**
 * The prop contract every bespoke part conforms to. Generic in the tool
 * name so `partRegistry` can be a typed map: each entry's `output` is the
 * matching `ToolOutput<K>` (or `null` while loading / on error).
 */
export interface ToolPartProps<T extends ToolName> {
  /** Tool output, or `null` while streaming / before completion. */
  output: ToolOutput<T> | null;
  state: ToolPartState;
  errorMessage?: string;
}

/**
 * Typed component map, one entry per `ToolName`. The mapped type
 * `{ [K in ToolName]: ComponentType<ToolPartProps<K>> }` enforces totality
 * at compile time — extending `TOOL_NAMES` without adding the matching
 * part here is a TS error.
 */
export const partRegistry: { [K in ToolName]: ComponentType<ToolPartProps<K>> } = {
  get_price: GetPricePart,
  get_candles: GetCandlesPart,
  get_indicators: GetIndicatorsPart,
  get_market_structure: GetMarketStructurePart,
  get_news: GetNewsPart,
  get_calendar: GetCalendarPart,
  set_alert: SetAlertPart,
  log_journal: LogJournalPart,
  // Phase 2 tools
  search_knowledge: SearchKnowledgePart,
  analyze_technical: AnalyzeTechnicalPart,
  analyze_fundamental: AnalyzeFundamentalPart,
  get_journal_stats: GetJournalStatsPart,
  annotate_chart: AnnotateChartPart,
  // Phase 3 tools
  analyze_chart_image: AnalyzeChartImagePart,
  get_correlation: GetCorrelationPart,
  get_cot: GetCoTPart,
  share_snapshot: ShareSnapshotPart,
  // Phase 7b tools
  compute_risk: ComputeRiskPart,
  get_session_levels: GetSessionLevelsPart,
  get_intermarket: GetIntermarketPart,
  forecast_volatility: ForecastVolatilityPart,
  get_seasonality: GetSeasonalityPart,
  compute_position_health: ComputePositionHealthPart,
  replay_setup: ReplaySetupPart,
  summarize_thread: SummarizeThreadPart,
  // Phase 7c tools
  verify_call: VerifyCallPart,
  convene_committee: ConveneCommitteePart,
  get_intermarket_resonance: GetIntermarketResonancePart,
  get_system_diagnostics: GetSystemDiagnosticsPart,
  run_system_action: RunSystemActionPart,
  get_portfolio_snapshot: GetPortfolioSnapshotPart,
  get_social_sentiment: GetSocialSentimentPart,
};

/**
 * Per-tool zod schemas keyed by `ToolName`. Used to `safeParse` the raw
 * stream payload before handing it to a bespoke part — a malformed result
 * routes to the generic `ToolCard` fallback rather than crashing the part.
 *
 * The mapped type guarantees one schema per known tool, in lockstep with
 * `partRegistry`.
 */
const partSchemas: { [K in ToolName]: z.ZodType<ToolOutput<K>> } = {
  get_price: GetPriceOutputSchema,
  get_candles: GetCandlesOutputSchema,
  get_indicators: GetIndicatorsOutputSchema,
  get_market_structure: GetMarketStructureOutputSchema,
  get_news: GetNewsOutputSchema,
  get_calendar: GetCalendarOutputSchema,
  set_alert: SetAlertOutputSchema,
  log_journal: LogJournalOutputSchema,
  // Phase 2 tools
  search_knowledge: SearchKnowledgeOutputSchema,
  analyze_technical: AnalyzeTechnicalOutputSchema,
  analyze_fundamental: AnalyzeFundamentalOutputSchema,
  get_journal_stats: GetJournalStatsOutputSchema,
  annotate_chart: AnnotateChartOutputSchema,
  // Phase 3 tools
  analyze_chart_image: AnalyzeChartImageOutputSchema,
  get_correlation: GetCorrelationOutputSchema,
  get_cot: GetCoTOutputSchema,
  share_snapshot: ShareSnapshotOutputSchema,
  // Phase 7b tools
  compute_risk: ComputeRiskOutputSchema,
  get_session_levels: GetSessionLevelsOutputSchema,
  get_intermarket: GetIntermarketOutputSchema,
  forecast_volatility: ForecastVolatilityOutputSchema,
  get_seasonality: GetSeasonalityOutputSchema,
  compute_position_health: ComputePositionHealthOutputSchema,
  replay_setup: ReplaySetupOutputSchema,
  summarize_thread: SummarizeThreadOutputSchema,
  // Phase 7c tools
  verify_call: VerifyCallOutputSchema,
  convene_committee: ConveneCommitteeOutputSchema,
  get_intermarket_resonance: GetIntermarketResonanceOutputSchema,
  get_system_diagnostics: GetSystemDiagnosticsOutputSchema,
  run_system_action: RunSystemActionOutputSchema,
  get_portfolio_snapshot: GetPortfolioSnapshotOutputSchema,
  get_social_sentiment: GetSocialSentimentOutputSchema,
};

/** Type guard: is `s` a known `ToolName`? */
function isToolName(s: string): s is ToolName {
  return (TOOL_NAMES as readonly string[]).includes(s);
}

/**
 * Translate the registry's part-state vocabulary to the legacy `ToolCard`
 * vocabulary (which mirrors AI SDK v5 stream-part states verbatim). Used
 * only on the fallback path.
 */
function toCardState(
  state: ToolPartState,
): 'input-streaming' | 'output-available' | 'output-error' {
  if (state === 'loading') return 'input-streaming';
  if (state === 'error') return 'output-error';
  return 'output-available';
}

export interface ChatToolPartProps {
  /**
   * Raw tool name as emitted by the AI stream (without the `tool-` prefix).
   * Typed `string` rather than `ToolName` so the dispatch can defensively
   * fall back when an unknown tool somehow makes it into the stream.
   */
  name: string;
  /** Raw tool result. zod-parsed per-tool before reaching the bespoke part. */
  output: unknown;
  state: ToolPartState;
  errorMessage?: string;
}

/**
 * Dispatch a streamed `tool-<name>` part to the matching bespoke
 * renderer. Falls back to the generic `ToolCard` when the name is unknown
 * or the per-tool zod parse fails.
 */
export function ChatToolPart({
  name,
  output,
  state,
  errorMessage,
}: ChatToolPartProps): ReactElement {
  if (!isToolName(name)) {
    return renderFallback(name, output, state, errorMessage);
  }

  const rendered = renderBespoke(name, output, state, errorMessage);
  if (rendered !== null) return rendered;

  // zod parse failed — render the raw payload via the generic card so the
  // user can still see something useful (and see the malformed shape if
  // they expand it).
  return renderFallback(name, output, state, errorMessage);
}

/**
 * Render a bespoke part for a known tool name. Returns `null` to signal
 * the caller should fall back to the generic card (currently only on
 * zod-parse failure when `state === 'done'`).
 *
 * Generic in `K` so `partRegistry[name]` and `partSchemas[name]` retain
 * their per-tool typing — the component's `output` prop is exactly
 * `ToolOutput<K> | null`, no casts required.
 */
function renderBespoke<K extends ToolName>(
  name: K,
  output: unknown,
  state: ToolPartState,
  errorMessage: string | undefined,
): ReactElement | null {
  // The map's declared shape `{ [K in ToolName]: ComponentType<ToolPartProps<K>> }`
  // makes this index access soundly typed at the per-tool level, but TS
  // can't narrow `partRegistry[name]` past the union when `K` is generic
  // (well-known mapped-type index-access limitation). The cast restores
  // the per-K component type without weakening it to a union.
  const Part = partRegistry[name] as ComponentType<ToolPartProps<K>>;

  // Loading and error states never render the payload, so we don't parse.
  if (state !== 'done' || output === null || output === undefined) {
    return (
      <Part output={null} state={state} {...(errorMessage !== undefined ? { errorMessage } : {})} />
    );
  }

  const result = partSchemas[name].safeParse(output);
  if (!result.success) {
    console.warn(`[chat-part] ${name} schema parse failed`, result.error);
    return null;
  }

  return (
    <Part
      output={result.data}
      state={state}
      {...(errorMessage !== undefined ? { errorMessage } : {})}
    />
  );
}

/** Render the generic `ToolCard`, translating prop names to its contract. */
function renderFallback(
  name: string,
  output: unknown,
  state: ToolPartState,
  errorMessage: string | undefined,
): ReactElement {
  return (
    <ToolCard
      name={name}
      state={toCardState(state)}
      input={undefined}
      output={output}
      {...(errorMessage !== undefined ? { errorText: errorMessage } : {})}
    />
  );
}
