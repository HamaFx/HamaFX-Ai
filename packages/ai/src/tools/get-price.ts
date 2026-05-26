// Tool: get_price.
//
// Fetches the latest mid price for one or more supported symbols.
// Calls into `packages/data` so the cache + provider failover apply
// transparently — the AI never talks to a provider directly.

import { tool } from 'ai';
import { z } from 'zod';

import { getPrice, ProviderError } from '@hamafx/data';
import { SymbolSchema, type Tick } from '@hamafx/shared';

const InputSchema = z.object({
  symbols: z.array(SymbolSchema).min(1).max(3),
});

interface Output {
  ticks: Tick[];
  /** ISO timestamp the answer was assembled at (helps the model state freshness). */
  asOf: string;
}

export type { Output as GetPriceOutput };

// Module-augment the shared ToolIOMap so consumers (e.g. message-part
// renderers) get strongly-typed inputs/outputs by tool name.
declare module '@hamafx/shared' {
  interface ToolIOMap {
    get_price: { input: z.infer<typeof InputSchema>; output: Output };
  }
}

export const getPriceTool = tool({
  description:
    'Fetch the most recent mid price for one or more supported symbols (XAUUSD, EURUSD, GBPUSD). Use only when the LIVE_SNAPSHOT in the system prompt is missing the symbol or older than 10 seconds.',
  inputSchema: InputSchema,
  execute: async ({ symbols }): Promise<Output> => {
    const ticks = await Promise.all(
      symbols.map(async (s) => {
        try {
          return await getPrice(s);
        } catch (err) {
          if (err instanceof ProviderError) {
            throw new Error(`Couldn't price ${s}: ${err.message}`);
          }
          throw err;
        }
      }),
    );
    return { ticks, asOf: new Date().toISOString() };
  },
});
