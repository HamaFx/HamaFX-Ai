import { TimeframeSchema } from '@kestrel/shared';
import { z } from 'zod';

import {
  EvidenceQualitySchema,
  XAUUSD,
  XauusdCandlesEvidenceSchema,
  XauusdIndicatorsEvidenceSchema,
  XauusdMacroEvidenceSchema,
  XauusdPriceEvidenceSchema,
} from './types';

export const XauusdResearchPacketSchema = z.object({
  packetId: z.string().min(1),
  kind: z.literal('research_packet'),
  symbol: z.literal(XAUUSD),
  generatedAt: z.string().datetime(),
  status: z.enum(['ready', 'blocked']),
  dataQuality: EvidenceQualitySchema,
  timeframes: z.array(TimeframeSchema),
  price: XauusdPriceEvidenceSchema.nullable(),
  candles: z.array(XauusdCandlesEvidenceSchema),
  indicators: z.array(XauusdIndicatorsEvidenceSchema),
  macro: XauusdMacroEvidenceSchema.nullable(),
  missingData: z.array(z.string()),
  warnings: z.array(z.string()),
});

export type XauusdResearchPacket = z.infer<typeof XauusdResearchPacketSchema>;
