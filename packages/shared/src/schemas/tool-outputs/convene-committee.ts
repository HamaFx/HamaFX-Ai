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
import { SymbolSchema } from '../../symbols';
import { CommitteeVerdictSchema } from '../ui-parts';

export const ConveneCommitteeInputSchema = z.object({
  symbol: SymbolSchema,
  side: z.enum(['long', 'short']),
  entry: z.number().positive(),
  stop: z.number().positive().optional(),
  target: z.number().positive().optional(),
  notes: z.string().optional(),
});
export type ConveneCommitteeInput = z.infer<typeof ConveneCommitteeInputSchema>;

export const ConveneCommitteeOutputSchema = z.object({
  symbol: SymbolSchema,
  side: z.enum(['long', 'short']),
  entry: z.number(),
  stop: z.number().optional(),
  target: z.number().optional(),
  verdicts: z.array(CommitteeVerdictSchema).length(3),
  grade: z.enum(['A', 'B', 'C', 'D', 'F']),
  goNoGo: z.enum(['go', 'caution', 'no-go']),
  consensus: z.string(),
});
export type ConveneCommitteeOutput = z.infer<typeof ConveneCommitteeOutputSchema>;
