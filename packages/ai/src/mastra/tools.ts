export { xauusdResearchPacketTool } from './research-packet-tool';
export { xauusdPriceTool } from './price-tool';
export { xauusdCandlesTool } from './candles-tool';
export { xauusdIndicatorsTool } from './indicators-tool';

import { xauusdResearchPacketTool } from './research-packet-tool';
import { xauusdCandlesTool } from './candles-tool';
import { xauusdIndicatorsTool } from './indicators-tool';
import { xauusdPriceTool } from './price-tool';

export const xauusdMastraTools = {
  getXauusdResearchPacket: xauusdResearchPacketTool,
  getXauusdPrice: xauusdPriceTool,
  getXauusdCandles: xauusdCandlesTool,
  getXauusdIndicators: xauusdIndicatorsTool,
};
