import type { XauusdResearchPacket } from './research-types';
import type { XauusdResearchReport } from './report-types';

const MARKET_NUMBER_CLAIM = /\b(?:xauusd|gold|price|support|resistance|invalidation|trigger|target|level|rsi|ema|atr|yield|dollar)\b[^.!?\n]{0,100}\b\d{1,6}(?:\.\d+)?\b/gi;
const NUMBER = /\b\d{1,6}(?:\.\d+)?\b/;

/**
 * A follow-up is allowed to explain trusted context, but it must not invent a
 * new market number. Returning a deterministic fallback is safer than
 * allowing an unverified plain-text claim through the report verifier.
 */
export function guardXauusdFollowupText(
  text: string,
  report: XauusdResearchReport,
  packet: XauusdResearchPacket,
): string {
  const trustedContext = `${JSON.stringify(report)} ${JSON.stringify(packet)}`;
  const claims = text.match(MARKET_NUMBER_CLAIM) ?? [];
  const hasUntrustedClaim = claims.some((claim) => {
    const number = claim.match(NUMBER)?.[0];
    return number !== undefined && !trustedContext.includes(number);
  });

  if (!hasUntrustedClaim) return text;
  return [
    'I can explain the saved XAUUSD report, but this follow-up introduced a new market number that is not supported by the trusted evidence.',
    'I stopped rather than repeat an unverified figure. Ask for a fresh XAUUSD analysis to refresh the market data.',
  ].join('\n\n');
}
