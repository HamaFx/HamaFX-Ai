import { z } from 'zod';

export const RunSystemActionInputSchema = z.object({
  action: z.enum(['resonance_sync', 'cot_sync', 'flush_cache', 'check_migrations']),
  params: z.array(z.string()).optional(),
});

export type RunSystemActionInput = z.infer<typeof RunSystemActionInputSchema>;

export const RunSystemActionOutputSchema = z.object({
  action: z.enum(['resonance_sync', 'cot_sync', 'flush_cache', 'check_migrations']),
  status: z.enum(['success', 'error']),
  consoleLogs: z.array(z.string()),
  executionTimeMs: z.number(),
  message: z.string(),
});

export type RunSystemActionOutput = z.infer<typeof RunSystemActionOutputSchema>;
