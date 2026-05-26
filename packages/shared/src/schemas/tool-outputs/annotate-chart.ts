// Output envelope returned by the `annotate_chart` AI tool. The output type
// is the `OverlaySet` shape consumed by lightweight-charts in
// apps/web/src/components/chart/overlays.ts; we declare the primitive marker
// and price-line schemas here so both the tool and the chart consume them
// from a single source.
//
// Source of truth: packages/ai/src/tools/annotate-chart.ts execute() return type.

import { z } from 'zod';

import { SymbolSchema } from '../../symbols';
import { TimeframeSchema } from '../../timeframes';

/** Categories the model can request from `annotate_chart`. */
export const AnnotateChartKindSchema = z.union([
  z.literal('swings'),
  z.literal('bos_choch'),
  z.literal('fvg'),
  z.literal('order_blocks'),
  z.literal('liquidity'),
  z.literal('pdh_pdl'),
  z.literal('asian_range'),
]);
export type AnnotateChartKind = z.infer<typeof AnnotateChartKindSchema>;

export const AnnotateChartInputSchema = z.object({
  symbol: SymbolSchema,
  tf: TimeframeSchema,
  kinds: z.array(AnnotateChartKindSchema).min(1),
  /** Swing detection lookback bars. Defaults to 3. */
  lookback: z.number().int().min(1).max(20).default(3),
  /** Number of recent candles to scan. Defaults to 300. */
  count: z.number().int().min(50).max(1000).default(300),
});
export type AnnotateChartInput = z.infer<typeof AnnotateChartInputSchema>;

/**
 * Marker primitive matching the lightweight-charts SeriesMarker shape. `time`
 * is a UTC timestamp in seconds since epoch (lightweight-charts convention),
 * not ms — matches `MarkerPrimitive` in apps/web/src/components/chart/overlays.ts.
 */
export const ChartMarkerSchema = z.object({
  time: z.number().int(),
  position: z.union([z.literal('aboveBar'), z.literal('belowBar'), z.literal('inBar')]),
  color: z.string(),
  shape: z.union([
    z.literal('arrowUp'),
    z.literal('arrowDown'),
    z.literal('circle'),
    z.literal('square'),
  ]),
  text: z.string(),
  size: z.number().int().min(0).max(4),
});
export type ChartMarker = z.infer<typeof ChartMarkerSchema>;

/**
 * Price-line primitive matching lightweight-charts CreatePriceLineOptions.
 * `lineStyle` is the LineStyle enum value (0 Solid … 4 SparseDotted).
 */
export const ChartPriceLineSchema = z.object({
  price: z.number(),
  color: z.string(),
  lineWidth: z.union([z.literal(1), z.literal(2), z.literal(3), z.literal(4)]),
  lineStyle: z.union([
    z.literal(0),
    z.literal(1),
    z.literal(2),
    z.literal(3),
    z.literal(4),
  ]),
  axisLabelVisible: z.boolean(),
  title: z.string(),
});
export type ChartPriceLine = z.infer<typeof ChartPriceLineSchema>;

export const AnnotateChartOutputSchema = z.object({
  symbol: SymbolSchema,
  tf: TimeframeSchema,
  asOf: z.number().int(),
  markers: z.array(ChartMarkerSchema),
  priceLines: z.array(ChartPriceLineSchema),
  /** Counts per requested kind so the chat part can show a one-line header. */
  countsByKind: z.record(AnnotateChartKindSchema, z.number().int()),
});
export type AnnotateChartOutput = z.infer<typeof AnnotateChartOutputSchema>;
