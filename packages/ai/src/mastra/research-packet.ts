import { randomUUID } from 'node:crypto';

import { metrics } from '@kestrel/shared';
import { createCategorizedLogger } from '@kestrel/shared/logger';

import { assembleXauusdResearchPacket } from './research-packet-assemble';
import { startResearchStage } from './research-packet-stages';
import { fetchXauusdResearchData } from './research-packet-fetch';
import { XAUUSD } from './types';
import type { XauusdResearchPacket } from './research-types';

const rlog = createCategorizedLogger('ai', {
  component: 'mastra-xauusd-research-packet',
});

/**
 * Fetches the fixed technical scope used by the first deep-research milestone.
 * The model receives this packet before explaining the market; it does not
 * decide which required timeframes to omit.
 */
export async function collectXauusdResearchPacket(
  signal?: AbortSignal,
): Promise<XauusdResearchPacket> {
  const packetId = `kestrel-research-${randomUUID()}`;
  const generatedAt = new Date().toISOString();
  startResearchStage('packet', { packetId, symbol: XAUUSD });
  const fetched = await fetchXauusdResearchData(signal);
  const packet = assembleXauusdResearchPacket(packetId, generatedAt, fetched);

  metrics.increment('mastra_research_packet_total', {
    tags: { status: packet.status, symbol: XAUUSD },
  });
  if (packet.status === 'blocked') {
    metrics.increment('mastra_research_packet_blocked_total', {
      tags: { symbol: XAUUSD },
    });
  }

  rlog.info('Mastra XAUUSD research packet collected', {
    packetId,
    status: packet.status,
    dataQuality: packet.dataQuality,
    candleTimeframes: packet.candles.map((evidence) => evidence.timeframe),
    indicatorTimeframes: packet.indicators.map((evidence) => evidence.timeframe),
    missingDataCount: packet.missingData.length,
  });
  return packet;
}
