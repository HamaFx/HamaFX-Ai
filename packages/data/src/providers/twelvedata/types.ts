import { z } from 'zod';

export const TwelveDataBarSchema = z.object({
  datetime: z.string(),
  open: z.string(),
  high: z.string(),
  low: z.string(),
  close: z.string(),
  volume: z.string(),
});

export const TwelveDataTimeSeriesMetaSchema = z.object({
  symbol: z.string(),
  interval: z.string(),
  currency: z.string().optional(),
  exchange_timezone: z.string().optional(),
  exchange: z.string().optional(),
  mic_code: z.string().optional(),
  type: z.string().optional(),
});

export const TwelveDataSuccessSchema = z.object({
  status: z.literal('ok'),
  meta: TwelveDataTimeSeriesMetaSchema,
  values: z.array(TwelveDataBarSchema).optional(),
});

export const TwelveDataErrorSchema = z.object({
  code: z.number(),
  message: z.string(),
});

export const TwelveDataTimeSeriesResponseSchema = z.union([
  TwelveDataSuccessSchema,
  TwelveDataErrorSchema,
]);

export type TwelveDataSuccess = z.infer<typeof TwelveDataSuccessSchema>;
export type TwelveDataError = z.infer<typeof TwelveDataErrorSchema>;
export type TwelveDataBar = z.infer<typeof TwelveDataBarSchema>;

export interface NormalizedTwelveDataCandle {
  t: number;
  o: number;
  h: number;
  l: number;
  c: number;
  v: number | null;
}
