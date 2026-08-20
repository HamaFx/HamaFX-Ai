import { createTool } from '@mastra/core/tools';

import { collectXauusdResearchPacket } from './research-packet';
import { XauusdResearchPacketSchema } from './research-types';
import { executeMastraTool } from './telemetry';
import { XauusdResearchPacketInputSchema } from './tool-schemas';

export const xauusdResearchPacketTool = createTool({
  id: 'get-xauusd-research-packet',
  description:
    'Collect the bounded deep-research evidence packet for XAUUSD: current price, daily/4h/1h/15m candles, and deterministic indicators. Use this first for broad gold analysis.',
  inputSchema: XauusdResearchPacketInputSchema,
  outputSchema: XauusdResearchPacketSchema,
  execute: async (_input, context) =>
    executeMastraTool('get-xauusd-research-packet', context, () =>
      collectXauusdResearchPacket(context.abortSignal),
    ),
});
