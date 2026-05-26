// Output envelope returned by the `log_journal` AI tool. This is the
// acknowledgement payload (not the persisted entry row — that's
// `JournalEntrySchema`).
//
// Source of truth: packages/ai/src/tools/log-journal.ts execute() return type.

import { z } from 'zod';

export const LogJournalOutputSchema = z.object({
  entryId: z.string(),
  /** Echoes the canonical summary line for the assistant to confirm. */
  summary: z.string(),
});

export type LogJournalOutput = z.infer<typeof LogJournalOutputSchema>;
