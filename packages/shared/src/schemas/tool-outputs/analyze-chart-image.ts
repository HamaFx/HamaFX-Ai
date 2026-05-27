// Output envelope returned by the `analyze_chart_image` AI tool.
//
// The tool runs a vision-capable model (defaulting to gemini-2.5-pro on
// Vertex) against an image part attached to the user's chat turn, then
// returns a structured technical readout: identified symbol/timeframe,
// trend, bias, labelled price levels, an English observation paragraph,
// and (when confident) a typed `OverlaySet` matching the existing
// `AnnotateChartOutputSchema` so the chart UI can re-render the levels
// via the existing overlay machinery.
//
// Source of truth: packages/ai/src/tools/analyze-chart-image.ts execute() return type.

import { z } from 'zod';

import { SymbolSchema } from '../../symbols';
import { TimeframeSchema } from '../../timeframes';
import { AnnotateChartOutputSchema } from './annotate-chart';

export const AnalyzeChartImageInputSchema = z.object({
  /** Optional symbol hint passed by the user or the agent. */
  symbolHint: SymbolSchema.optional(),
  /** Optional timeframe hint. */
  timeframeHint: TimeframeSchema.optional(),
});
export type AnalyzeChartImageInput = z.infer<typeof AnalyzeChartImageInputSchema>;

export const AnalyzedLevelSchema = z.object({
  /** Numeric price (decimals match the symbol's natural precision). */
  price: z.number(),
  /** Short label, e.g. "weekly high", "yesterday's low", "2400 round number". */
  label: z.string(),
});
export type AnalyzedLevel = z.infer<typeof AnalyzedLevelSchema>;

export const AnalyzeChartImageOutputSchema = z.object({
  symbol: SymbolSchema.nullable(),
  tf: TimeframeSchema.nullable(),
  trend: z.union([z.literal('up'), z.literal('down'), z.literal('range')]).nullable(),
  bias: z
    .union([z.literal('bullish'), z.literal('bearish'), z.literal('neutral')])
    .nullable(),
  levels: z.array(AnalyzedLevelSchema),
  /** One- to three-paragraph English observation. */
  observed: z.string(),
  /** Reusable in the chart UI via the existing OverlaySet pipeline. */
  overlay: AnnotateChartOutputSchema.nullable(),
  /** Stable identifier of the source image (sha256 of the bytes). */
  sourceImageRef: z.string(),
});
export type AnalyzeChartImageOutput = z.infer<typeof AnalyzeChartImageOutputSchema>;
