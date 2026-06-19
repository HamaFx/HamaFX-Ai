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
