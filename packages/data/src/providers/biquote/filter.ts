/**
 * Copyright 2026 Kestrel
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
// constrain ourselves to canonical catalog symbols with an explicit mapping.
//
// Provider calls are always restricted to the canonical catalog. The former
// UNLIMITED_SYMBOLS escape hatch is intentionally ignored so production and
// local behavior cannot diverge.

import { getSymbolDefinition, type Symbol } from '@kestrel/shared';

import { ProviderError } from '../../errors';

const PROVIDER = 'biquote';

export function assertSupportedSymbol(symbol: string): Symbol {
  const canonical = symbol.trim().toUpperCase();
  let definition;
  try {
    definition = getSymbolDefinition(canonical);
  } catch {
    definition = null;
  }

  if (!definition || definition.biquote === null) {
    throw new ProviderError(
      'PROVIDER_HTTP_ERROR',
      PROVIDER,
      `unsupported symbol "${symbol}" — biquote adapter is restricted to catalog symbols with a BiQuote mapping`,
    );
  }
  return canonical;
}
