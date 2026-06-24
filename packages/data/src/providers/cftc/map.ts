/**
 * Copyright 2026 HamaFX
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

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
  return TO_CFTC_NAME[symbol] || '';
}
