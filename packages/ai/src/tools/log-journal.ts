// Tool: log_journal.
//
// Lets the model record a trade entry from chat ("Journal: I shorted EURUSD
// at 1.0850, stop 1.0890, target 1.0780"). Auto-fill from chat is a Phase 2
// feature; this tool exposes the manual side of it now so the user can ask
// the agent to log something directly.

import { tool } from 'ai';
import { z } from 'zod';

import { SymbolSchema, TradeSideSchema } from '@hamafx/shared';

import { createEntry } from '../journal/persistence';

const InputSchema = z.object({
  symbol: SymbolSchema,
  side: TradeSideSchema,
  /** ms epoch UTC; defaults to "now" so the agent can omit it. */
  openedAtMs: z.number().int().optional(),
  entry: z.number(),
  stop: z.number().nullable().optional(),
  target: z.number().nullable().optional(),
  size: z.number().nullable().optional(),
  notes: z.string().max(2000).nullable().optional(),
  tags: z.array(z.string().max(40)).max(10).optional(),
});

interface Output {
  entryId: string;
  /** Echoes the canonical summary line for the assistant to confirm. */
  summary: string;
}

export type { Output as LogJournalOutput };

declare module '@hamafx/shared' {
  interface ToolIOMap {
    log_journal: { input: z.infer<typeof InputSchema>; output: Output };
  }
}

export const logJournalTool = tool({
  description:
    'Record a trade entry in the journal. Returns the new entry id + a summary line. Status is "open" until the user later marks it closed in /journal or via a follow-up tool call.',
  inputSchema: InputSchema,
  execute: async (input): Promise<Output> => {
    const entry = await createEntry({
      symbol: input.symbol,
      side: input.side,
      openedAt: input.openedAtMs ?? Date.now(),
      entry: input.entry,
      stop: input.stop ?? null,
      target: input.target ?? null,
      size: input.size ?? null,
      notes: input.notes ?? null,
      tags: input.tags ?? [],
    });
    const summary = `${input.side} ${input.symbol} @ ${input.entry}${
      input.stop !== null && input.stop !== undefined ? `, stop ${input.stop}` : ''
    }${
      input.target !== null && input.target !== undefined ? `, target ${input.target}` : ''
    }`;
    return { entryId: entry.id, summary };
  },
});
