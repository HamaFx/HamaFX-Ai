// Tool: get_cot.
//
// Returns the last N weeks of CFTC Commitment-of-Traders rows for one
// symbol. Cron handler `/api/cron/cot` populates the table; the tool is
// a thin read with a templated summary string.

import {
  GetCoTInputSchema,
  type CoTSample,
  type GetCoTOutput,
  type Symbol,
} from '@hamafx/shared';
import { tool } from 'ai';
import type { z } from 'zod';

import { countCoTRows, listCoTSamples } from '../cot/persistence';

const InputSchema = GetCoTInputSchema;

declare module '@hamafx/shared' {
  interface ToolIOMap {
    get_cot: { input: z.infer<typeof InputSchema> };
  }
}

export const getCoTTool = tool({
  description:
    "Last N weeks of CFTC Commitment-of-Traders rows for one symbol (default XAUUSD). Use to answer 'how is leveraged-fund net positioning changing on gold' or 'are dealers net long the dollar'. Returns 4-bucket long/short positions per week (dealer / asset / leveraged / other). Computes net = long - short on the agent side.",
  inputSchema: InputSchema,
  execute: async ({ symbol, weeks }): Promise<GetCoTOutput> => {
    const populated = await countCoTRows();
    const requestedSymbol: Symbol = symbol ?? 'XAUUSD';
    if (populated === 0) {
      return {
        symbol: requestedSymbol,
        samples: [],
        summary: 'CoT pipeline pending — no rows in the table yet.',
        pipelinePending: true,
      };
    }

    const samples = await listCoTSamples({ symbol: requestedSymbol, weeks });
    return {
      symbol: requestedSymbol,
      samples,
      summary: deterministicSummary(requestedSymbol, samples),
      pipelinePending: false,
    };
  },
});

function deterministicSummary(symbol: Symbol, samples: CoTSample[]): string {
  if (samples.length === 0) return `${symbol}: no CoT rows in window.`;
  const latest = samples[samples.length - 1]!;
  const lev = netOf(latest.leveragedLong, latest.leveragedShort);
  const dealer = netOf(latest.dealerLong, latest.dealerShort);
  const asset = netOf(latest.assetLong, latest.assetShort);
  const dateIso = new Date(latest.reportDate).toISOString().slice(0, 10);
  const parts = [
    `${symbol} CoT (${dateIso}):`,
    lev !== null ? `leveraged net ${formatSigned(lev)}` : null,
    dealer !== null ? `dealer net ${formatSigned(dealer)}` : null,
    asset !== null ? `asset-mgr net ${formatSigned(asset)}` : null,
  ].filter((x): x is string => x !== null);
  return parts.join(' · ');
}

function netOf(long: number | null, short: number | null): number | null {
  if (long === null || short === null) return null;
  return long - short;
}

function formatSigned(n: number): string {
  return n >= 0 ? `+${n.toLocaleString()}` : `${n.toLocaleString()}`;
}
