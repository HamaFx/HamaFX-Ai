import { buildCandlesEvidence } from './evidence-builders';
import {
  RESEARCH_CANDLE_OUTPUT,
  XAUUSD_RESEARCH_WINDOWS,
  type ResearchWindow,
} from './research-config';
import type { XauusdResearchFetchResult } from './research-packet-fetch';
import {
  completeResearchStage,
  recordResearchStageFailure,
  startResearchStage,
  warningForResearchFailure,
} from './research-packet-stages';
import { XAUUSD } from './types';
import type { XauusdResearchPacket } from './research-types';

export interface CandleSuccess {
  window: ResearchWindow;
  result: XauusdResearchFetchResult['candles'][number] & { status: 'fulfilled' };
}

export function collectCandleEvidence(
  packetId: string,
  fetched: XauusdResearchFetchResult,
  warnings: string[],
  missingData: string[],
): { candles: XauusdResearchPacket['candles']; successes: CandleSuccess[] } {
  const candles: XauusdResearchPacket['candles'] = [];
  const successes: CandleSuccess[] = [];

  XAUUSD_RESEARCH_WINDOWS.forEach((window, index) => {
    const settled = fetched.candles[index];
    if (!settled) return;
    const stage = `candles.${window.timeframe}`;
    startResearchStage(stage, { packetId, symbol: XAUUSD, timeframe: window.timeframe });

    if (settled.status === 'rejected') {
      missingData.push(`${window.timeframe} candle data is unavailable.`);
      warnings.push(warningForResearchFailure(`${window.timeframe} candles`));
      recordResearchStageFailure(stage, settled.reason, { packetId, timeframe: window.timeframe });
      return;
    }

    try {
      const evidence = buildCandlesEvidence(
        window.timeframe,
        window.candleCount,
        settled.value,
        RESEARCH_CANDLE_OUTPUT,
      );
      candles.push(evidence);
      successes.push({ window, result: settled });
      warnings.push(...evidence.warnings);
      if (evidence.data.count === 0) {
        missingData.push(`${window.timeframe} candle data is empty.`);
      }
      completeResearchStage(stage, 'completed', {
        packetId,
        timeframe: window.timeframe,
        count: evidence.data.count,
        quality: evidence.quality,
      });
    } catch (error) {
      missingData.push(`${window.timeframe} candle evidence was invalid.`);
      warnings.push(warningForResearchFailure(`${window.timeframe} candles`));
      recordResearchStageFailure(stage, error, { packetId, timeframe: window.timeframe });
    }
  });

  return { candles, successes };
}
