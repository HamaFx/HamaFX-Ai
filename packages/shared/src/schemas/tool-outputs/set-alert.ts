// Output envelope returned by the `set_alert` AI tool. This is the
// acknowledgement payload (not the persisted alert row — that's
// `AlertSchema`).
//
// Source of truth: packages/ai/src/tools/set-alert.ts execute() return type.

import { z } from 'zod';

export const SetAlertOutputSchema = z.object({
  alertId: z.string(),
  /** Human-readable rule label, e.g. "XAUUSD 1h close above 2400". */
  describes: z.string(),
});

export type SetAlertOutput = z.infer<typeof SetAlertOutputSchema>;
