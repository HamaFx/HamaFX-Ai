import { buildPriceEvidence } from './evidence-builders';
import { XAUUSD_RESEARCH_WINDOWS } from './research-config';
import { collectCandleEvidence } from './research-packet-candles';
import type { XauusdResearchFetchResult } from './research-packet-fetch';
import { collectIndicatorEvidence } from './research-packet-indicators';
import { assembleXauusdMacroEvidence } from './research-packet-macro';
import {
  completeResearchStage,
  recordResearchStageFailure,
  startResearchStage,
  uniqueResearchValues,
  warningForResearchFailure,
} from './research-packet-stages';
import { XauusdResearchPacketSchema, type XauusdResearchPacket } from './research-types';
import { XAUUSD } from './types';

export function assembleXauusdResearchPacket(
  packetId: string,
  generatedAt: string,
  fetched: XauusdResearchFetchResult,
): XauusdResearchPacket {
  const warnings: string[] = [];
  const missingData: string[] = [];
  let price: XauusdResearchPacket['price'] = null;

  startResearchStage('price', { packetId, symbol: XAUUSD });
  if (fetched.price.status === 'fulfilled') {
    try {
      price = buildPriceEvidence(fetched.price.value);
      warnings.push(...price.warnings);
      completeResearchStage('price', 'completed', {
        packetId,
        freshness: price.freshness,
        quality: price.quality,
      });
    } catch (error) {
      missingData.push('Current XAUUSD price evidence was invalid.');
      warnings.push(warningForResearchFailure('Current XAUUSD price'));
      recordResearchStageFailure('price', error, { packetId, symbol: XAUUSD });
    }
  } else {
    missingData.push('Current XAUUSD price is unavailable.');
    warnings.push(warningForResearchFailure('Current XAUUSD price'));
    recordResearchStageFailure('price', fetched.price.reason, { packetId, symbol: XAUUSD });
  }

  const macroResult = assembleXauusdMacroEvidence(packetId, generatedAt, fetched.macro);
  if (macroResult.evidence) warnings.push(...macroResult.evidence.warnings);
  missingData.push(...macroResult.missingData);
  warnings.push(...macroResult.warnings);

  const candleResult = collectCandleEvidence(packetId, fetched, warnings, missingData);
  const indicators = collectIndicatorEvidence(
    packetId,
    candleResult.successes,
    warnings,
    missingData,
  );
  const requiredTimeframes = XAUUSD_RESEARCH_WINDOWS.map(({ timeframe }) => timeframe);
  const missingRequiredTimeframe = requiredTimeframes.some(
    (timeframe) =>
      !candleResult.candles.some(
        (evidence) => evidence.timeframe === timeframe && evidence.data.count > 0,
      ) || !indicators.some((evidence) => evidence.timeframe === timeframe),
  );
  const status = price && !missingRequiredTimeframe ? 'ready' : 'blocked';
  const dataQuality =
    status === 'blocked'
      ? 'degraded'
      : missingData.length > 0
        ? 'partial'
        : warnings.length > 0
          ? 'degraded'
          : 'complete';

  completeResearchStage('packet', 'completed', {
    packetId,
    status,
    dataQuality,
  });

  return XauusdResearchPacketSchema.parse({
    packetId,
    kind: 'research_packet',
    symbol: XAUUSD,
    generatedAt,
    status,
    dataQuality,
    timeframes: requiredTimeframes,
    price,
    candles: candleResult.candles,
    indicators,
    macro: macroResult.evidence,
    missingData: uniqueResearchValues(missingData),
    warnings: uniqueResearchValues(warnings),
  });
}
