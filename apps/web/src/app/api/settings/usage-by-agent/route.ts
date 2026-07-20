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

// /api/settings/usage-by-agent — per-agent and per-mode cost breakdown.
//
// Returns:
//   {
//     byAgent: [{ agentName, turns, totalCostUsd, avgLatencyMs }],
//     byMode:  [{ analysisMode, turns, totalCostUsd }],
//     totalCostUsd, totalTurns
//   }
//
// Reads from the agent_opinions table (specialist agents) — the Decision
// agent's cost is not in agent_opinions (it doesn't produce an opinion),
// so we include it as a synthetic row with cost = totalCost - sum(specialists).
//
// Auth: NextAuth session gate. Per-user data only.

import { schema } from '@hamafx/db';
import { getDb } from '@hamafx/ai';
import { eq, gte, and, sql } from 'drizzle-orm';

import { errorResponse, withAuth } from '@/lib/api';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export const GET = withAuth<void>(async (_req, { user }) => {
  try {
    const db = getDb();
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

    // Per-agent breakdown (specialist agents only — they have rows in agent_opinions).
    const byAgentRows = await db
      .select({
        agentName: schema.agentOpinions.agentName,
        turns: sql<number>`count(*)::int`,
        totalCostUsd: sql<number>`coalesce(sum(${schema.agentOpinions.costUsd}), 0)::float8`,
        avgLatencyMs: sql<number>`coalesce(avg(${schema.agentOpinions.latencyMs}), 0)::int`,
      })
      .from(schema.agentOpinions)
      .where(
        and(
          eq(schema.agentOpinions.userId, user.userId),
          gte(schema.agentOpinions.createdAt, thirtyDaysAgo),
        ),
      )
      .groupBy(schema.agentOpinions.agentName);

    // Per-mode breakdown.
    const byModeRows = await db
      .select({
        analysisMode: schema.agentOpinions.analysisMode,
        turns: sql<number>`count(*)::int`,
        totalCostUsd: sql<number>`coalesce(sum(${schema.agentOpinions.costUsd}), 0)::float8`,
      })
      .from(schema.agentOpinions)
      .where(
        and(
          eq(schema.agentOpinions.userId, user.userId),
          gte(schema.agentOpinions.createdAt, thirtyDaysAgo),
        ),
      )
      .groupBy(schema.agentOpinions.analysisMode);

    const totalCostUsd = byAgentRows.reduce((s, r) => s + Number(r.totalCostUsd), 0);
    const totalTurns = byAgentRows.reduce((s, r) => s + Number(r.turns), 0);

    return Response.json({
      byAgent: byAgentRows.map((r) => ({
        agentName: r.agentName,
        turns: Number(r.turns),
        totalCostUsd: Number(r.totalCostUsd),
        avgLatencyMs: Number(r.avgLatencyMs),
      })),
      byMode: byModeRows.map((r) => ({
        analysisMode: r.analysisMode,
        turns: Number(r.turns),
        totalCostUsd: Number(r.totalCostUsd),
      })),
      totalCostUsd,
      totalTurns,
    });
  } catch (err) {
    return errorResponse(err);
  }
});