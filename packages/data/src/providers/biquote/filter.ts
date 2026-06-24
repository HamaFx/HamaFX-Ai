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

// Symbol whitelist for the BiQuote provider. BiQuote covers thousands of
// instruments (BIST stocks, crypto, indices, commodities, FX); we
// deliberately constrain ourselves to the three internal symbols and
// refuse to issue requests for anything else.
//
// This protects us from accidental subscription drift if a future PR
// reaches into the BiQuote adapter from a code path that hasn't been
// reviewed against the SUPPORTED_SYMBOLS contract.

import { isSymbol, SYMBOLS, type Symbol } from '@hamafx/shared';

import { ProviderError } from '../../errors';

const PROVIDER = 'biquote';

export function assertSupportedSymbol(symbol: string): Symbol {
  const isUnlimited = process.env.UNLIMITED_SYMBOLS === 'true' || process.env.UNLIMITED_SYMBOLS === '1';
  if (!isSymbol(symbol) || (!isUnlimited && !SYMBOLS.includes(symbol as typeof SYMBOLS[number]))) {
    throw new ProviderError(
      'PROVIDER_HTTP_ERROR',
      PROVIDER,
      `unsupported symbol "${symbol}" — biquote adapter is restricted to ${SYMBOLS.join(', ')}`,
    );
  }
  return symbol;
}

