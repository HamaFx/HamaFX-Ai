// Tool: get_price.
//
// Fetches the latest mid price for one or more supported symbols.
// Calls into `packages/data` so the cache + provider failover apply
// transparently — the AI never talks to a provider directly.

import { getPrice, ProviderError } from '@hamafx/data';
import { SymbolSchema, type GetPriceOutput } from '@hamafx/shared';
import { tool } from 'ai';
import { z } from 'zod';

const InputSchema = z.object({
  symbols: z.array(SymbolSchema).min(1).max(3),
});

// Module-augment the shared ToolIOMap so consumers get strongly-typed inputs
// by tool name. Outputs are sourced centrally from `ToolOutputMap` in
// `@shared/ai/tool-io` (driven by the per-tool zod schemas in
// `@shared/schemas/tool-outputs/`), so we don't redeclare them here.
declare module '@hamafx/shared' {
  interface ToolIOMap {
    get_price: { input: z.infer<typeof InputSchema> };
  }
}

export const getPriceTool = tool({
  description:
    'Fetch the most recent mid price for one or more supported symbols (XAUUSD, EURUSD, GBPUSD). Use only when the LIVE_SNAPSHOT in the system prompt is missing the symbol or older than 10 seconds.',
  inputSchema: InputSchema,
  execute: async ({ symbols }): Promise<GetPriceOutput> => {
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
