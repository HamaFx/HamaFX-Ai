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
