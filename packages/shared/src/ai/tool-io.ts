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

import type { GetCalendarOutputSchema } from '../schemas/tool-outputs/get-calendar';
import type { GetCandlesOutputSchema } from '../schemas/tool-outputs/get-candles';
import type { GetIndicatorsOutputSchema } from '../schemas/tool-outputs/get-indicators';
import type { GetMarketStructureOutputSchema } from '../schemas/tool-outputs/get-market-structure';
import type { GetNewsOutputSchema } from '../schemas/tool-outputs/get-news';
import type { GetPriceOutputSchema } from '../schemas/tool-outputs/get-price';
import type { LogJournalOutputSchema } from '../schemas/tool-outputs/log-journal';
import type { SetAlertOutputSchema } from '../schemas/tool-outputs/set-alert';
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
}

export type ToolInput<T extends ToolName> = T extends keyof ToolIOMap
  ? ToolIOMap[T] extends { input: infer I }
    ? I
    : never
  : never;

export type ToolOutput<T extends ToolName> = T extends keyof ToolOutputMap
  ? ToolOutputMap[T]
  : never;
