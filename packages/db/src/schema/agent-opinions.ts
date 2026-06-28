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

import { index, integer, jsonb, pgTable, real, text, timestamp, uuid } from 'drizzle-orm/pg-core';
import { users } from './auth';
import { chatThreads, chatMessages } from './chat';

export const agentOpinions = pgTable(
  'agent_opinions',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: text('user_id').references(() => users.id, { onDelete: 'cascade' }).notNull(),
    threadId: uuid('thread_id').references(() => chatThreads.id, { onDelete: 'cascade' }).notNull(),
    messageId: uuid('message_id').references(() => chatMessages.id, { onDelete: 'cascade' }).notNull(),
    agentName: text('agent_name').notNull(),
    bias: text('bias').notNull(),
    confidence: real('confidence').notNull(),
    reasoning: text('reasoning').notNull(),
    rawData: jsonb('raw_data').notNull(),
    model: text('model').notNull(),
    costUsd: real('cost_usd').notNull(),
    latencyMs: integer('latency_ms').notNull(),
    analysisMode: text('analysis_mode').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    index('agent_opinions_thread_idx').on(t.threadId),
    index('agent_opinions_user_created_idx').on(t.userId, t.createdAt),
  ],
);

export type AgentOpinionRow = typeof agentOpinions.$inferSelect;
export type AgentOpinionInsert = typeof agentOpinions.$inferInsert;
