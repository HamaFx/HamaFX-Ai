import type { XauusdResearchPacket } from './research-types';

export function blockedXauusdResearchText(packet: XauusdResearchPacket): string {
  const missing =
    packet.missingData.length > 0
      ? packet.missingData.join(' ')
      : 'Required XAUUSD market data was unavailable.';
  return [
    'I stopped the XAUUSD analysis because required market evidence was unavailable.',
    missing,
    'I did not fill the missing information from memory. Please retry when the market-data providers are available.',
  ].join('\n\n');
}
