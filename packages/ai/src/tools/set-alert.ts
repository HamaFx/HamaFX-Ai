// Tool: set_alert.
//
// Lets the model create a one-shot alert. Mirrors the AlertRule schema
// directly so the tool input is the same shape the DB row stores.

import { tool } from 'ai';
import { z } from 'zod';

import { AlertChannelSchema, AlertRuleSchema } from '@hamafx/shared';

import { createAlert } from '../alerts/persistence';

const InputSchema = z.object({
  rule: AlertRuleSchema,
  channels: z.array(AlertChannelSchema).default(['email']),
  note: z.string().max(280).nullable().default(null),
});

interface Output {
  alertId: string;
  /** Human-readable rule label, e.g. "XAUUSD 1h close above 2400". */
  describes: string;
}

export type { Output as SetAlertOutput };

declare module '@hamafx/shared' {
  interface ToolIOMap {
    set_alert: { input: z.infer<typeof InputSchema>; output: Output };
  }
}

function describeRule(rule: z.infer<typeof AlertRuleSchema>): string {
  switch (rule.type) {
    case 'priceCross':
      return `${rule.symbol} price ${rule.direction} ${rule.level}`;
    case 'candleClose':
      return `${rule.symbol} ${rule.tf} close ${rule.direction} ${rule.level}`;
    case 'indicatorCross':
      return `${rule.symbol} ${rule.tf} ${rule.indicator} ${rule.direction} ${rule.level}`;
  }
}

export const setAlertTool = tool({
  description:
    'Create a one-shot price / indicator / candle-close alert. Fires when the rule first matches and then deactivates. The user can resend by editing the alert in /alerts.',
  inputSchema: InputSchema,
  execute: async ({ rule, channels, note }): Promise<Output> => {
    const alert = await createAlert({ rule, channels, note });
    return { alertId: alert.id, describes: describeRule(rule) };
  },
});
