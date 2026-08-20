import type { XauusdResearchPacket } from './research-types';
import type {
  XauusdCandlesEvidence,
  XauusdIndicatorsEvidence,
  XauusdMacroEvidence,
  XauusdPriceEvidence,
} from './types';

/** Keep the synthesis prompt bounded while retaining the latest market context. */
export const MODEL_CONTEXT_CANDLE_LIMIT = 12;
export const MODEL_CONTEXT_INDICATOR_LIMIT = 3;

type CompactCandlesEvidence = Omit<XauusdCandlesEvidence, 'data'> & {
  data: Omit<XauusdCandlesEvidence['data'], 'candles'> & {
    candles: XauusdCandlesEvidence['data']['candles'];
  };
};

type CompactIndicatorsEvidence = Omit<XauusdIndicatorsEvidence, 'data'> & {
  data: Omit<XauusdIndicatorsEvidence['data'], 'results'> & {
    results: XauusdIndicatorsEvidence['data']['results'];
  };
};

export interface XauusdModelEvidenceContext {
  packetId: string;
  kind: 'model_evidence_context';
  symbol: 'XAUUSD';
  generatedAt: string;
  status: XauusdResearchPacket['status'];
  dataQuality: XauusdResearchPacket['dataQuality'];
  price: XauusdPriceEvidence | null;
  candles: CompactCandlesEvidence[];
  indicators: CompactIndicatorsEvidence[];
  macro: XauusdMacroEvidence | null;
  missingData: string[];
  warnings: string[];
}

/**
 * Reduce the server-side packet before placing it in the model instructions.
 * The full packet remains available to deterministic verification; the model
 * only needs recent candles, latest indicator values, and provenance.
 */
export function buildXauusdModelEvidenceContext(
  packet: XauusdResearchPacket,
): XauusdModelEvidenceContext {
  return {
    packetId: packet.packetId,
    kind: 'model_evidence_context',
    symbol: packet.symbol,
    generatedAt: packet.generatedAt,
    status: packet.status,
    dataQuality: packet.dataQuality,
    price: packet.price,
    candles: packet.candles.map(({ data, ...evidence }) => ({
      ...evidence,
      data: {
        ...data,
        candles: data.candles.slice(-MODEL_CONTEXT_CANDLE_LIMIT),
      },
    })),
    indicators: packet.indicators.map(({ data, ...evidence }) => ({
      ...evidence,
      data: {
        ...data,
        results: data.results.map((result) => ({
          ...result,
          values: result.values.slice(-MODEL_CONTEXT_INDICATOR_LIMIT),
        })),
      },
    })),
    macro: packet.macro,
    missingData: [...packet.missingData],
    warnings: [...packet.warnings],
  };
}

export function serializeXauusdModelEvidenceContext(packet: XauusdResearchPacket): string {
  return JSON.stringify(buildXauusdModelEvidenceContext(packet));
}
