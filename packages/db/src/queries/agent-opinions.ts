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

// Agent opinions query helpers — cost/latency breakdown by agent and mode.

import { and, eq, gte } from 'drizzle-orm';
import { getDb, schema } from '../client';

export interface AgentOpinionRow {
  agentName: string;
  analysisMode: string;
  costUsd: number;
  latencyMs: number;
}

/**
 * List agent opinion rows for a user since a given date (MTD).
 * Used by the usage page for multi-agent breakdown.
 */
export async function listMtdAgentOpinions(
  userId: string,
  since: Date,
): Promise<AgentOpinionRow[]> {
  const db = getDb();
  return db
    .select({
      agentName: schema.agentOpinions.agentName,
      analysisMode: schema.agentOpinions.analysisMode,
      costUsd: schema.agentOpinions.costUsd,
      latencyMs: schema.agentOpinions.latencyMs,
    })
    .from(schema.agentOpinions)
    .where(
      and(
        eq(schema.agentOpinions.userId, userId),
        gte(schema.agentOpinions.createdAt, since),
      ),
    );
}
