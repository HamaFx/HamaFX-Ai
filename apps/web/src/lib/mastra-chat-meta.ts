// SPDX-License-Identifier: Apache-2.0

import type { XauusdResearchReport } from '@kestrel/ai/mastra';

export interface MastraChatMeta {
  agent: 'mastra-xauusd';
  runId: string;
  modelId: string;
  providerId: string;
  researchStatus: 'ready' | 'blocked';
  dataQuality: 'complete' | 'partial' | 'degraded';
  packetId: string;
  observedCost: number;
  report: XauusdResearchReport | null;
}

export function createMastraChatMeta(input: Omit<MastraChatMeta, 'agent'>): MastraChatMeta {
  return { agent: 'mastra-xauusd', ...input };
}
