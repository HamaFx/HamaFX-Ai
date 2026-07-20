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

// Tool: set_alert.
//
// Lets the model create a one-shot alert. Mirrors the AlertRule schema
// directly so the tool input is the same shape the DB row stores.

import { AlertChannelSchema, AlertRuleSchema, type SetAlertOutput } from '@hamafx/shared';
import { tool } from 'ai';
import { z } from 'zod';

import { createAlert } from '../alerts/persistence';
import { getToolContext } from '../tool-context';
import { assertMutationIntent } from './mutation-guard';
import { alertRuleRegistry } from '../alerts/rule-registry';

const InputSchema = z.object({
  rule: AlertRuleSchema,
  channels: z.array(AlertChannelSchema).default(['email']),
  note: z.string().max(280).nullable().default(null),
});

declare module '@hamafx/shared' {
  interface ToolIOMap {
    set_alert: { input: z.infer<typeof InputSchema> };
  }
}

function describeRule(rule: z.infer<typeof AlertRuleSchema>): string {
  // P1-3 — delegate to plugin registry instead of switch(rule.type).
  // The Zod-inferred type is compatible with AlertRule for the describe() contract.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return alertRuleRegistry.get(rule.type).describe(rule as any);
}

export const setAlertTool = tool({
  description:
    'Create a one-shot price / indicator / candle-close alert. Fires when the rule first matches and then deactivates. The user can resend by editing the alert in /alerts.',
  inputSchema: InputSchema,
  execute: async ({ rule, channels, note }): Promise<SetAlertOutput> => {
    assertMutationIntent('set_alert');
    const alert = await createAlert({ userId: getToolContext().userId, rule, channels, note });
    return { alertId: alert.id, describes: describeRule(rule) };
  },
});
