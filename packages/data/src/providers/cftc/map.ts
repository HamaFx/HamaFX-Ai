// CFTC Disaggregated Futures-Only ↔ internal mapping.
//
// The Socrata dataset uses commodity NAMES (uppercased). Their ids are
// stable, but the names are friendlier for the `where` clause filter.
//
// Reference: https://publicreporting.cftc.gov/resource/gpe5-46if.json

import type { Symbol } from '@hamafx/shared';

const TO_CFTC_NAME: Record<Symbol, string> = {
  XAUUSD: 'GOLD - COMMODITY EXCHANGE INC.',
  EURUSD: 'EURO FX - CHICAGO MERCANTILE EXCHANGE',
  GBPUSD: 'BRITISH POUND - CHICAGO MERCANTILE EXCHANGE',
};

export function toCftcName(symbol: Symbol): string {
  return TO_CFTC_NAME[symbol];
}
