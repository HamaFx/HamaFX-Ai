import { buildIndicatorsEvidence } from './evidence-builders';
import {
  RESEARCH_CANDLE_OUTPUT,
  RESEARCH_INDICATOR_OUTPUT,
  XAUUSD_RESEARCH_INDICATORS,
} from './research-config';
import type { CandleSuccess } from './research-packet-candles';
import {
  completeResearchStage,
  recordResearchStageFailure,
  startResearchStage,
  warningForResearchFailure,
} from './research-packet-stages';
import { XAUUSD } from './types';
import type { XauusdResearchPacket } from './research-types';

export function collectIndicatorEvidence(
  packetId: string,
  successes: readonly CandleSuccess[],
  warnings: string[],
  missingData: string[],
): XauusdResearchPacket['indicators'] {
  const indicators: XauusdResearchPacket['indicators'] = [];

  for (const { window, result } of successes) {
    const stage = `indicators.${window.timeframe}`;
    startResearchStage(stage, { packetId, symbol: XAUUSD, timeframe: window.timeframe });
    try {
      const evidence = buildIndicatorsEvidence(
        window.timeframe,
        window.candleCount,
        result.value,
        XAUUSD_RESEARCH_INDICATORS,
        RESEARCH_CANDLE_OUTPUT,
        RESEARCH_INDICATOR_OUTPUT,
      );
      indicators.push(evidence);
      warnings.push(...evidence.warnings);
      completeResearchStage(stage, 'completed', {
        packetId,
        timeframe: window.timeframe,
        indicatorCount: evidence.data.results.length,
      });
    } catch (error) {
      missingData.push(`${window.timeframe} indicator calculations are unavailable.`);
      warnings.push(warningForResearchFailure(`${window.timeframe} indicators`));
      recordResearchStageFailure(stage, error, { packetId, timeframe: window.timeframe });
    }
  }

  return indicators;
}
