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

/**
 * Throw `ProviderError` if `symbol` is anything other than one of the
 * three supported instruments. Returns the symbol unchanged on success so
 * call sites can chain `assertSupportedSymbol(s)` directly.
 */
export function assertSupportedSymbol(symbol: string): Symbol {
  if (!isSymbol(symbol)) {
    throw new ProviderError(
      'PROVIDER_HTTP_ERROR',
      PROVIDER,
      `unsupported symbol "${symbol}" — biquote adapter is restricted to ${SYMBOLS.join(', ')}`,
    );
  }
  return symbol;
}
